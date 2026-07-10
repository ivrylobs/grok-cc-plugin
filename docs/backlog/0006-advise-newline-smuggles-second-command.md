---
id: 0006
title: "A newline in an advise command smuggles a second, unreviewed command"
severity: blocker
area: policy
found: 2026-07-10
---

## What happened

Under the default `advise` grip, a shell command whose **first line** begins with
an allow-listed head is auto-allowed in full — including everything on subsequent
lines. A worker (or a compromised tool input) can prepend an allow-listed read
plus a newline to any command and it runs without a permission prompt.

`advise` is the default grip (`lib/worker.mjs:136`, `commands/work.md:15`), and
README states fs-mediator containment guards only grok's file tools, never shell.
So this escapes the workspace.

## Evidence

All of these auto-allow today. The probe builds the command strings with
`String.fromCharCode` so no raw control char is pasted into a shell:

```
node --input-type=module -e '
import { decideToolCall } from "./lib/policy.mjs";
const NL = String.fromCharCode(10), CR = String.fromCharCode(13);
const ask = c => decideToolCall("advise", { kind: "execute", rawInput: { command: c } });
console.log(ask("cat a" + NL + "rm -rf /tmp/x"));    // allow   <-- exploitable
console.log(ask("cat a" + CR + "rm -rf /tmp/x"));    // allow   <-- cosmetic (see Severity)
console.log(ask("cat a #" + NL + "rm -rf /tmp/x"));  // allow   <-- comment eats line 1
'
```

Which of these bash actually executes as a second command (empirical):

```
bash -c "$(printf 'true a\necho NL_EXEC')"   # prints NL_EXEC  -> newline IS a separator
bash -c "$(printf 'true a\recho CR_EXEC')"   # prints nothing  -> CR is not
bash -c "$(printf 'true a\vecho VT_EXEC')"   # prints nothing  -> VT is not
```

## Root cause

`lib/policy.mjs:65`:

```js
if (/[;&`<>]|\$\(/.test(norm)) return false   // chain / substitute / redirect-to-file
```

The character class has no `\n`. Then `:69` matches the head against `segs[0]`
only, with a `^\s*head` regex — and in JavaScript `\s` matches `\n`, so
`cat` + `\n` + `rm` still satisfies `^\s*cat`. The second line is never inspected.

## Severity note (corrected)

Only **newline** is a true command separator in bash. `\r`, `\v`, `\f`, U+2028,
U+2029 all make `decideToolCall` return `allow` but do **not** split a command in
bash — they become part of an argument token. So there is exactly **one**
exploitable vector today (newline); the others are policy-hygiene defects worth
closing defense-in-depth, not RCE. An earlier draft overstated this as five live
vectors; the live bash test above corrected it.

## Cost

None realized yet — found in review before a worker weaponized it. The exposure:
any `advise` worker turn that emits a multi-line command starting with an
allow-listed head runs its later lines unreviewed, with broker privileges,
outside the fs-mediator's reach.

## Proposed fix

In `adviseAllowsShell`, fail closed on the control-character class, then validate
per `&&` segment (this also fixes [0001](0001-advise-blocks-chained-readonly-commands.md)):

```js
// reject C0 controls except tab (\x09), plus NEL and line/para separators
if (/[\x00-\x08\x0a-\x1f\x85\u2028\u2029]/.test(norm)) return false
const seqs = norm.split('&&')
if (seqs.some(s => /[;&`<>]|\$\(/.test(s))) return false   // '&' alone, ';', subst, redirect
return seqs.every(s => segmentAllowed(s))                  // existing pipe/head logic, per segment
```

Reject the whole class even though only `\n` is exploitable in bash: the command
may run under a different shell or platform, and fail-closed is cheap. Keep `\t`
and space — a horizontal tab is an argument separator, not a command separator,
and legitimate reads use both.

Lock in `test/policy.test.mjs`: `\n`, `\r`, and `cat a #` + `\n` all → ask,
alongside the existing metachar cases.

## Not the fix

- **Reject only `\n` and `\r`.** Leaves the Unicode/`\v`/`\f` policy-allows open;
  reject the whole class instead — same cost, no residue.
- **Sanitize/normalize the command before matching.** Stripping line breaks and
  re-matching invites a re-injection bug; reject-and-ask is simpler and safer.
