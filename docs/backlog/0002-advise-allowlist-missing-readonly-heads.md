---
id: 0002
title: "Allow-list omits `sed -n`, `find`, `head`, `wc`, `test`"
severity: major
area: policy
found: 2026-07-10
---

## What happened

`ADVISE_ALLOW` permits `ls`, `cat`, `grep`, `rg`, `git status|diff|log`. But the
commands a reviewer reaches for constantly to read *part* of a large file, or to
locate one, are absent. `head` and `wc` appear in `SAFE_FILTER`, so they may
follow a pipe — but not lead one.

Reading lines 1250–1350 of a 1500-line route file is a permission prompt.
Finding where `HIE_PROFILES.md` lives is a permission prompt.

## Evidence

```
node --input-type=module -e '
import { decideToolCall } from "./lib/policy.mjs";
const ask = c => decideToolCall("advise", { kind: "execute", rawInput: { command: c } });
for (const c of ["sed -n \x271,50p\x27 f.ts", "find . -name x.md", "head -200 f.md", "wc -l f.ts", "test -f f.md"])
  console.log(ask(c).padEnd(6), c);
'
```

All five print `ask`. All five are read-only as invoked.

## Root cause

`lib/policy.mjs`, `ADVISE_ALLOW` — the list was seeded with the obvious readers
and never revisited against what a reviewing worker actually runs. `head`/`wc`
being in `SAFE_FILTER` but not `ADVISE_ALLOW` is the clearest sign: they are
already trusted to read, just not to go first.

## Cost

Compounds [0001](0001-advise-blocks-chained-readonly-commands.md). A worker
asked to review a 1500-line file cannot read the relevant slice without an
approval, so it either prompts or slurps the whole file into context.

## Proposed fix

Add to `ADVISE_ALLOW`, each guarded against its write mode:

| Command | Guard | Why it needs one |
|---|---|---|
| `sed` | reject `-i` | `sed -i` edits in place |
| `find` | reject `-exec`, `-delete`, `-fprint`, `-ok` | arbitrary exec / delete / write |
| `head`, `tail`, `wc`, `file`, `stat` | none | no write mode |
| `test` | none | exit status only |

Extend `ADVISE_DANGER_FLAG` rather than special-casing per head:

```js
const ADVISE_DANGER_FLAG =
  /(^|\s)(--pre(=|\s|$)|--output(=|\s|$)|-i(=|\s|$)|-exec(\s|$)|-delete(\s|$)|-ok(\s|$)|-fprint(\s|$))/
```

Careful: a bare `-i` is also `grep -i` (case-insensitive), which is harmless.
Guard `-i` only for a `sed` head, or match `sed[^|]*\s-i` specifically. Getting
this wrong makes `grep -i` prompt, which is worse than the bug being fixed.

## Not the fix

- **Allow any command whose name "looks read-only."** `find` is read-only until
  `-delete`. The guard belongs on the flag, not the name.
- **Raise `head`/`wc` out of `SAFE_FILTER` only.** They would then lead a pipe
  but `sed -n` and `find` — the two most-wanted — stay blocked.
