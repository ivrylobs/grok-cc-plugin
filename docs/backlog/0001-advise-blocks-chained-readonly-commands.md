---
id: 0001
title: "`&&`-chained read-only commands force a permission prompt"
severity: blocker
area: policy
found: 2026-07-10
---

## What happened

A worker was spawned under `--grip advise` to review four files. Its first act
was the natural one — read them all in a single command:

```
cat .../publisher.ts && cat .../ids.ts && cat .../buildVisitBundle.ts && sed -n '1250,1350p' .../video-call.ts
```

Every component is read-only. The whole thing asked for permission. The worker
parked in `advising` and could not proceed until a human typed an approval.

## Evidence

```
node --input-type=module -e '
import { decideToolCall } from "./lib/policy.mjs";
const ask = c => decideToolCall("advise", { kind: "execute", rawInput: { command: c } });
console.log(ask("cat a.ts"));                    // allow
console.log(ask("cat a.ts | tail -40"));         // allow
console.log(ask("cat a.ts && cat b.ts"));        // ask   <-- both halves are allow-listed
'
```

A single `cat` is allowed. A pipe into a safe filter is allowed. Two `cat`s
joined by `&&` — strictly less powerful than either, since neither half can see
the other's output — is refused.

## Root cause

`lib/policy.mjs`, `adviseAllowsShell()`:

```js
if (/[;&`<>]|\$\(/.test(norm)) return false   // chain / substitute / redirect-to-file
```

The character class `[;&<>]` cannot distinguish `&&` (sequence, both halves
visible to the policy) from `&` (background a process) or `;` (unconditional
sequence). All three are rejected together. The comment says "chaining" as
though chaining were inherently unsafe, but the danger in `;`/`&` is not the
sequencing — it is that neither is inspected.

## Cost

Three separate human approvals across one review task, each requiring the user
to leave the conversation and paste a `grokctl answer` command. The worker
produced nothing in return (see [0004](0004-parked-worker-yields-no-partial-output.md)).
The captain abandoned the delegation and did the review itself.

## Proposed fix

Split on `&&` and require **every** segment to independently satisfy the
existing per-segment rules (allow-listed head, safe filters downstream, no
danger flags). Keep rejecting `;`, `&`, backticks, `$( )`, and `>`/`<`.

```js
const seqs = norm.split('&&')
if (seqs.some(s => /[;&`<>]|\$\(/.test(s))) return false   // '&' alone, ';', subst, redirect
return seqs.every(s => segmentAllowed(s))                  // existing pipe logic, per segment
```

This is strictly safe: a conjunction of allow-listed read-only commands is
read-only. Note `split('&&')` must run before the `[;&]` test, or `&&` trips the
`&` branch.

Trade-off: `a && b` now runs `b` only if `a` succeeds — no new capability, since
the worker could already run them as two separate approved calls.

Prototyped against the real `ADVISE_ALLOW` / `SAFE_FILTER` before filing. All
ten cases behave, including the one that makes the ordering subtle:

| command | verdict |
|---|---|
| `cat a && cat b` | allow |
| `cat a && cat b \| tail -5` | allow |
| `ls && rg -n foo src/` | allow |
| `cat a & cat b` | **ask** (background, not a sequence) |
| `cat a ; rm -rf /` | ask |
| `cat a && rm -rf /` | ask (segment 2 not allow-listed) |
| `cat a && echo x > f` | ask (redirect) |
| `cat $(evil)` | ask |
| `rg --pre ./x.sh f && cat a` | ask (danger flag) |

The `&` case is why `split('&&')` must precede the `[;&]` test: test first and
`&&` is eaten by the `&` branch; split first and a bare `&` survives inside a
segment, where the test still catches it.

## Not the fix

- **Auto-allow everything under `advise`.** `advise` is the grip a reviewer uses
  on code it does not trust. The allow-list is the point.
- **Ask the captain to pre-approve.** It cannot — see [0003](0003-parent-agent-cannot-answer-permissions.md).
- **Tell workers not to chain commands.** Depends on the model complying every
  time; the policy should be correct regardless of how the worker phrases a
  read.
