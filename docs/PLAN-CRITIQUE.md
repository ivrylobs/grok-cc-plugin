# PLAN-CRITIQUE — attack on the 0.2.0 one-shot ship plan

**Mode:** attack, not grade.  
**Constraints:** do not contradict ESTABLISHED FACTS A–C without new evidence. Every code claim is `file:line` from this tree, or a live `decideToolCall` probe recorded in S2.  
**Plan under attack:** items 1–7 as given (newline fix; 0001+0002; `read` grip; 0007 raw prose; 0003 rewrite + `agents/grok-worker.md`; 0008 table time; stretch 0004 streaming).

---

## S1. THE ORDERING IS WRONG

The sequence **1 → 2 → 3 → 4 → 5 → 6 → 7** is wrong for a one-shot 0.2.0 ship. Reorder, split, and drop as follows.

### What must land first: (1)+(2), not (3)

**Item 3 (`read` grip) depends on (1)+(2) landing first.**  
A new grip that denies write/edit is useless as a silent review path while `adviseAllowsShell` still:

- false-negatives natural multi-file reads on `&&` (`lib/policy.mjs:65`; backlog 0001),
- omits the heads a reviewer actually uses (`lib/policy.mjs:8-16` vs 0002),
- and (until (1)) **auto-allows newline-smuggled second commands** (FACT B; live probe S2).

Shipping `read` before the shared shell function is fixed only multiplies grips that still page the human on `cat a && cat b` and still have a newline hole. Implement (1)+(2) as **one function change + one test file**, then build `read` on that function.

### Item 4 is not first — but it is too late at position 4 for the proposed build loop

**Item 4 (persist DONE prose) does not need to be absolute first.** Security holes (1)+(2) outrank result ergonomics. But the plan’s **build loop** says: Grok writes failing tests under `--grip gate`; captain implements; a **fresh Grok worker attacks the patch**.

That loop’s value is the attacker’s argument, not a one-line `summary` field. Today:

- `parseStatus` returns `raw` (`lib/contract.mjs:7,23,28`),
- turn end only stores `parsed.result` (`lib/worker.mjs:253-254`),
- `grokctl result` returns only that (`lib/worker.mjs:405-407`).

When the worker follows protocol (RESULT fenced JSON + `STATUS: DONE` — `lib/worker.mjs:121-125`), the essay outside the fence is **discarded**. A Grok attack of a policy patch arrives as `{"summary":"…","files_changed":[],"verification":"…"}` — exactly the failure mode this critique document is written to prevent.

**Correct place for item 4: immediately after (1)+(2), before any “fresh Grok attacks the patch” expectation, and before item 3 if item 3’s acceptance depends on Grok review quality.** It is small (contract + inbox shape + `result` CLI) and unblocks every subsequent dogfood turn.

It is **not** a substitute for (1)+(2): without shell fixes, the attacker parks on permissions and you are back in 0004/`result: null` territory for *parked* workers (item 7), which is a different bug.

### Item 5 must be split; half of it is not optional

Item 5 bundles:

1. **Rewrite backlog 0003’s root cause** (docs) — FACT C: top-level captain *can* `grokctl answer … allow`; forbidden are subagent answering, re-issuing a denied command, and scripted auto-approval loops. Cost is **captain turns**, not “human keystrokes only.” Docs rewrite is necessary so the rest of the release does not re-encode the lie.
2. **Fix or delete `agents/grok-worker.md`** — codepath product. That agent spawns, waits in a loop, then `result` (`agents/grok-worker.md:8-14`) with **no inbox drain** and no answer path. A subagent also cannot clear permissions (FACT C). This agent is a footgun independent of policy.

Do not gate the security ship on a long essay in the backlog file. Do **ship or delete the agent** in the same release as (1)+(2), or every “easy” subagent delegation keeps reproducing 0003-class dead ends.

### Item 6 is independent polish — fine late, fine parallel

`commands/status.md:11` tells the model to “Present the returned JSON.” Timestamps are ISO UTC from `toISOString()` at write sites (e.g. `lib/worker.mjs:128,133,139`, `lib/store.mjs` meta `updatedAt`). Moving formatting into `grokctl list --table` is correct and **does not depend on (1)–(5)**. Keep it in 0.2.0 only if CLI work does not steal review budget from the security core; otherwise ship next.

### Item 7 must be dropped from the one-shot ship

**Stretch 0004 (streamed assistant deltas) is not safe to attempt in the same release as (1)–(6).**

Evidence of why it is a different project:

- Chunks already accumulate in memory (`lib/worker.mjs:152`: `agent_message_chunk` → `msgBuf`),
- but `msgBuf` is cleared at each turn start (`lib/worker.mjs:230`) and only parsed at turn end (`lib/worker.mjs:253-257`),
- `result` only reads completed `done` inbox items (`lib/worker.mjs:405-407`),
- parking mid-turn means **no** `done` and often **no** prose at all (backlog 0004: tool-only turns).

Partial `result` changes the captain contract (`skills/advisory-loop/SKILL.md`, `commands/*`), races with cancel/deny (`lib/worker.mjs:248-251`), and can publish half-formed JSON fences. Shipping a half-streamed API next to a security-sensitive policy rewrite is how you get a release that fails both. **Defer 0004.** Mitigate parked silence in 0.2.0 by making (1)+(2)+`read` so the common review path never parks.

### Recommended one-shot order

| Order | Item | Rationale |
|------:|------|-----------|
| 1 | (1)+(2) newline + `&&` split + 0002 heads, **one** `adviseAllowsShell` change | Security core; shared by `advise` and future `read` |
| 2 | (4) persist DONE `raw` / prose via `result` | Unblocks Grok attack loop quality |
| 3 | (3) `read` grip (policy + fs-mediator + spawn flag surface) | Needs fixed shell; needs wiring (see S4) |
| 4 | (5b) fix/delete `agents/grok-worker.md` | Broken control plane |
| 5 | (5a) rewrite backlog 0003 to FACT C | Truth; non-blocking for code if (5b) done |
| 6 | (6) `list --table` local time | Polish |
| — | **Drop (7)** from 0.2.0 | Separate subsystem; high regression risk |

### Build-loop note

“Grok writes failing tests under `--grip gate`” is sound: gate stages writes (`lib/fs-mediator.mjs:100-103`) and `decideToolCall('gate', …)` asks for essentially everything (`lib/policy.mjs:93-94`). Captain apply + fresh attacker is sound **only if** the attacker’s DONE body is recoverable (item 4) and the attacker is not fighting newline/`&&`/missing heads (items 1–2) or silent `advise` writes (item 3 + S4 wiring).

---

## S2. THE FIX FOR (1)+(2) IS INCOMPLETE

### Current gate (read carefully)

`adviseAllowsShell` (`lib/policy.mjs:63-70`):

1. Strip `2>&1` → space (`:64`).
2. **Reject** if `/[;&`<>]|\$\(/` matches (`:65`) — note: **no** `\n`, `\r`, `|` alone is not in the class.
3. Reject `ADVISE_DANGER_FLAG` (`:66`, `:28`).
4. Split on `|` (`:68`); head must match `ADVISE_ALLOW` (`:69`); every later segment must match `SAFE_FILTER` (`:70`).

Heads are unanchored only at the start via `^\s*…` (`:9-16`). **`\s` includes `\n` and `\r` in JavaScript**, so a newline immediately after the head still satisfies the head regex while introducing a second shell command.

### Proposed fix under attack

As stated: reject `\n`/`\r`; split on `&&`; validate each segment with existing pipe/head rules; keep rejecting `;`, bare `&`, backticks, `$(…)`, `<>`.

Below: **every** construct that can smuggle a second command (or equivalent exec) past a head-anchored allow-list.  
**CURRENT** = today’s `decideToolCall('advise', {kind:'execute',…})`.  
**PROPOSED** = reject `\n\r` + `&&` split + per-segment validation (assuming segment validation **keeps** step 2’s metachar class **and** pipe/`SAFE_FILTER` logic).

| # | Construct | CURRENT (live / source) | PROPOSED | Notes |
|---|-----------|-------------------------|----------|-------|
| 1 | Newline `\n` as command separator: `cat a\nrm -rf /tmp/x` | **allow** (live; FACT B) | **ask** (if `\n` rejected) | Core hole. Head regex treats `\n` as `\s` after `cat`. |
| 2 | CR `\r`: `cat a\rrm -rf /tmp/x` | **allow** (live) | **ask** (if `\r` rejected) | Same class as (1) for JS `\s`. Shell-dependent execution; fail closed. |
| 3 | CRLF `\r\n` | **allow** (live) | **ask** | Covered if either `\n` or `\r` rejected. |
| 4 | Vertical tab `\v` | **allow** (live) | **allow** (not in proposed reject set) | Bash does **not** treat `\v` as a command separator (literal / token glue). Not a multi-command smuggle on common shells; optional harden. |
| 5 | Form feed `\f` | **allow** (live) | **allow** | Same as `\v`. |
| 6 | U+2028 LINE SEPARATOR | **allow** (live) | **allow** | Not in `[;&`<>]` / not `\n\r`. Bash typically does **not** treat U+2028 as newline. Defense-in-depth: reject `\u2028\u2029` anyway. |
| 7 | U+2029 PARAGRAPH SEPARATOR | **allow** (live) | **allow** | Same as (6). |
| 8 | `||` : `cat a \|\| rm -rf /tmp/x` | **ask** (live) | **ask** | Not caught by metachar class; caught because `split('|')` yields a non-`SAFE_FILTER` segment (`lib/policy.mjs:68-70`). **Regression risk:** any rewrite that only checks the first head and stops splitting on `\|` reopens this. |
| 9 | `|&` : `cat a \|& rm -rf /tmp/x` | **ask** (live) | **ask** | Same pipe-segment path as (8). |
| 10 | Backslash-newline continuation: `cat a \\\n rm -rf /tmp/x` | **allow** (live) | **ask** if bare `\n` rejected; else **allow** | Shell line-continuation → single command `cat` with extra args (`rm`, `-rf`, …), **not** exec of `rm`. Fail-closed ask is OK; not a true second-command smuggle. |
| 11 | Comment then newline: `cat a #\nrm -rf /tmp/x` | **allow** (live) | **ask** (via `\n`) | `#` is **not** in metachar class (`:65`). Comment eats rest of line; newline starts `rm`. Proposed `\n` reject is required; do not “allow `#`” without rejecting line breaks. |
| 12 | `;` sequencing | **ask** (`:65` has `;`) | **ask** | Keep. |
| 13 | Bare `&` background: `cat a & rm …` | **ask** (`:65` has `&`) | **ask** | Why `split('&&')` must run **before** the `&` test (0001). |
| 14 | `&&` with bad RHS: `cat a && rm -rf /tmp/x` | **ask** (via `&` in class today) | **ask** (RHS fails allow-list) | |
| 15 | `&&` with good RHS: `cat a && cat b` | **ask** today (0001) | **allow** (intent of fix) | |
| 16 | Backticks `` cat `payload` `` | **ask** (`:65` has `` ` ``) | **ask** | |
| 17 | `$(…)` | **ask** (`:65` has `\$\(`) | **ask** | |
| 18 | Process subst `<(…)` / `>(…)` | **ask** (live; `<`/`>` in class) | **ask** | |
| 19 | Redir `>` / `<` / here-doc `<<` / `<<<` | **ask** (live) | **ask** | |
| 20 | Pipe to non-filter: `git log \| sh`, `ls \| xargs rm` | **ask** (`SAFE_FILTER` `:31-33`) | **ask** | |
| 21 | `2>&1` then pipe to filter | **allow** by design (`:64`, tests) | **allow** | Keep strip. |
| 22 | Weaponized flags `--pre`, `--output` | **ask** (`:28,66`) | **ask** | 0002 must **extend** this for `sed -i`, `find -exec/-delete/-ok/-fprint` (backlog 0002). Plan text “add heads” without guards is incomplete. |
| 23 | Env assignment prefix: `FOO=1 cat a` | **ask** (live; head not allow-listed) | **ask** | |
| 24 | `FOO=$(rm) cat a` | **ask** (live; `$(` and/or head) | **ask** | |
| 25 | Brace / subshell groups `{ …; }`, `( …; )` | **ask** (live; `;` or head) | **ask** | |
| 26 | Tab as IFS whitespace: `cat\trm\t-rf\t/tmp/x` | **allow** (live) | **allow** | Shell: one `cat` argv list, not `rm` exec. Not a second-command smuggle. |
| 27 | Newline-only second line without allow head: `\nrm -rf /tmp/x` | **ask** (live; head fails) | **ask** | |
| 28 | `cat\na` (newline after head, second token command name) | **allow** (live) | **ask** | Variant of (1). |

### Probes for anything not settled by reading alone

Already run (this session), import from `./lib/policy.mjs`:

```js
decideToolCall('advise', { kind: 'execute', rawInput: { command: 'cat a\nrm -rf /tmp/x' } }) // allow
decideToolCall('advise', { kind: 'execute', rawInput: { command: 'cat a\rrm -rf /tmp/x' } }) // allow
decideToolCall('advise', { kind: 'execute', rawInput: { command: 'cat a\vrm -rf /tmp/x' } }) // allow
decideToolCall('advise', { kind: 'execute', rawInput: { command: 'cat a\u2028rm -rf /tmp/x' } }) // allow
decideToolCall('advise', { kind: 'execute', rawInput: { command: 'cat a || rm -rf /tmp/x' } }) // ask
decideToolCall('advise', { kind: 'execute', rawInput: { command: 'cat a |& rm -rf /tmp/x' } }) // ask
decideToolCall('advise', { kind: 'execute', rawInput: { command: 'cat a #\nrm -rf /tmp/x' } }) // allow
decideToolCall('advise', { kind: 'execute', rawInput: { command: 'cat a && cat b' } }) // ask
```

**Optional post-fix probes** (same shape): confirm `cat a && cat b` → allow; `cat a && rm -rf /tmp/x` → ask; `cat a\nrm` → ask; `cat a || rm` → ask; `rg --pre sh x` → ask; `sed -i` / `find -delete` → ask after 0002 guards.

### What the proposed fix still misses (security core gaps)

1. **Unicode line separators (6)(7)** and optionally `\v`/`\f`: not in the stated reject set. Low practical bash risk; cheap to reject all Unicode line terminators + C0 line breaks in one ` /[\n\r\u2028\u2029]/ ` (and treat any other C0 control as ask).
2. **`||` / `|&` safety is accidental** — it rides on `split('|')` + `SAFE_FILTER`, not on an explicit “no OR / pipe-and” rule. A naive “only allow-list the first token” refactor will re-open (8)(9). Tests must lock `||` and `|&`.
3. **0002 without danger-flag expansion** turns `sed`/`find` into write/exec oracles. Backlog 0002 already warns: bare `-i` collides with `grep -i`. Plan item (2) must include guards, not only new head regexes.
4. **No coverage of `|&` / `||` / newline in `test/policy.test.mjs` today** — existing metachar test (`test/policy.test.mjs:55-57`) uses `&&`, `;`, `>`, backticks, `$(`, `tee` — **not** `\n`. Ship tests that fail on FACT B before the fix.
5. **Shell is not the only write path** (FACT A): even a perfect `adviseAllowsShell` leaves `kind: write|edit` auto-allowed under `advise` (`lib/policy.mjs:83`) and disk writes for any grip ≠ `gate` (`lib/fs-mediator.mjs:104-106`). Items (1)+(2) alone do **not** make consults read-only.

---

## S3. THE `read` GRIP SPEC

Exact predicates. `decideToolCall` today returns only `'allow' | 'ask'` (`lib/policy.mjs:1,76`) — there is no `'deny'`. Spec below uses that alphabet plus **hard refuse** in the mediator (throw / non-writing error), because `ask` alone is not read-only under FACT C (captain can `answer allow`).

### `decideToolCall('read', toolCall)`

| `toolCall.kind` | Return | Rule |
|-----------------|--------|------|
| `read` | **`allow`** | File reads are the point of the grip. |
| `write` | **`ask` is insufficient; prefer hard auto-reject** | Must **never** return `allow`. If the API cannot grow a `deny` value, `holdPermission` for grip `read` must pick `reject_once` without inbox (parallel to auto-allow), **and** mediator must refuse. Returning plain `ask` lets a captain `grokctl answer allow` (FACT C) authorize the permission; only the mediator then saves you for file tools. |
| `edit` | same as `write` | Same path as write tools. |
| `execute` | **`allow` iff `adviseAllowsShell(command)`** (post (1)+(2)); else **`ask`** | Reuse the **same** function as advise after the newline/`&&`/heads fix. Do **not** invent a second allow-list. |
| other / missing kind | **`ask`** | Same as unknown tools under advise (`lib/policy.mjs:85-86`). |

**Unknown grip today falls through to `ask`** (`lib/policy.mjs:93-94`). `read` must be an **explicit branch** before that fallthrough, or it is silently “all ask” (gate-like) without mediator refuse — wrong on both axes.

### Shell: auto-allow the ADVISE_ALLOW set, or ask for everything?

**Auto-allow the shared read-only shell set** (post-fix `adviseAllowsShell`), **ask for everything else.**

- Ask-for-everything shell recreates 0001/0002 pain and makes `read` worse than current `advise` for reviews.
- Auto-allow full shell destroys “read-only.”
- Shared function with advise keeps one security core (S2).

`read` does **not** get `GROK_CC_ADVISE_TESTS` test runners unless explicitly decided; default **off** (same rationale as `lib/policy.mjs:2-7`: write-then-run escalation). Review grip should not run `npm test` silently.

### `fs-mediator` behavior for grip `read`

In `writeTextFile` (`lib/fs-mediator.mjs:93-111`):

```
if (meta.grip === 'read') {
  audit(..., { op: 'denied-write' | 'read-grip-refuse', ... })
  throw /* or return error the ACP layer maps to failure */
  // do NOT write abs, do NOT write staged/
}
```

- **`gate`**: keep staging (`:100-103`).
- **`advise` / `leash`**: keep direct write (`:104-106`) — FACT A remains true for those grips.
- **`read`**: **refuse** (stronger than stage). Staging is still a side effect; a read-only consult must not create `staged/` payloads.

`readTextFile` (`:81-90`): unchanged allow-within-containment.

### Permission path vs FS path (both required)

File tools:

1. Agent requests permission → `holdPermission` → `decideToolCall` (`lib/worker.mjs:267-274`).
2. On allow, later `fs/write_text_file` → `writeTextFile` **with no second policy check** (`lib/worker.mjs:260-262`).

Therefore **policy alone cannot enforce read-only files**; mediator refuse is mandatory. Shell never hits the mediator (`README` / design: containment is file-tools only) — read-only for shell is **only** allow-list + residual `ask`.

### What breaks if a `read`-grip worker runs `git diff`?

`git diff` / `git status` / `git log` are in `ADVISE_ALLOW` (`lib/policy.mjs:14-16`) and would auto-allow under the shared shell predicate.

**They are not pure observers.** Typical mutations / side effects:

| Command | Mutation |
|---------|----------|
| **`git status` / `git diff`** (no extra flags) | May create or take **`.git/index.lock`**, refresh the index, write bitmap/pack maintenance in some git versions/config. Contended lock fails concurrent git in the same repo. |
| **`git status`** with optional features | Can update **untracked cache** / racy-index bookkeeping under `.git/`. |
| **`git diff --output=FILE`** | Explicit write — already forced to `ask` via `ADVISE_DANGER_FLAG` (`lib/policy.mjs:28,66`). |

So: **policy “allow” ≠ filesystem freeze.** The grip is “no mediated file writes + no free-form shell,” not “no subprocess may touch `.git`.”

### At least one read-only-looking command that mutates state

Concrete examples to name in tests/docs:

1. **`git status`** / **`git diff`** — index lock / index refresh (above); still on the allow-list.
2. **`find … -delete`** — looks like search; deletes. Must stay `ask` via 0002 guards.
3. **`sed -i`** — looks like stream edit; in-place file write. Must stay `ask`.
4. **`rg --pre CMD`** — looks like search; executes `CMD` (`lib/policy.mjs:25-28`).
5. **`csplit` / `tee` / `cp`** — not allow-listed today; if someone “adds common readers” carelessly, they mutate.

For the grip pitch: **`git diff` is the poster child** — auto-allowed, review-natural, can take `.git/index.lock`.

### What `read` does *not* claim

- Not a OS sandbox (same as leash disclaimer, `lib/policy.mjs:35-40`).
- Not immune to captain-approved shell (`ask` + FACT C).
- Not the default until spawn/docs wire it (S4).

---

## S4. WHAT THE PLAN MISSES

**Defect: plan adds grip `read` but never wires it into the only spawn surfaces humans/captains use — default remains write-capable `advise`.**

Citations:

- Default grip at spawn: `grip = 'advise'` (`lib/worker.mjs:136`).
- `/grok:work` defaults: “grip `advise`” (`commands/work.md:15`); argument-hint only `gate|advise|leash` (`commands/work.md:3,8`).
- Delegation skill: “Default `advise`” (`skills/delegation-contract/SKILL.md:13`).
- Under that default, write/edit auto-allow (`lib/policy.mjs:83`) and non-gate writes hit the live tree (`lib/fs-mediator.mjs:104-106`) — FACT A.

Items 1–7 as written can ship a correct `read` implementation that **nothing selects**. Autonomous consults and the build-loop attacker keep using `advise` unless the plan also includes: `--grip read` in work/review commands, skill text, and any “second opinion” spawn template. Without that, 0.2.0 fails its own product goal (silent read-only review) while claiming a new grip.

Secondary miss (same theme, if the above is fixed): **`decideToolCall` has no `deny`**, and `holdPermission` only auto-allows or asks (`lib/worker.mjs:271-291`). Spec must hard-reject file writes for `read` at mediator (S3); plan text “never allows” is ambiguous and easy to implement as `ask` only.

---

## Summary

| Section | Verdict |
|---------|---------|
| S1 ordering | (1)+(2) first; (4) before dogfood attack loop; (3) after shell fix; split (5); (6) optional late; **drop (7)** from one-shot |
| S2 policy | Newline/`\r`/comment-NL are live allows; proposed fix closes those if `\n\r` rejected, but misses Unicode separators unless extended; `||` safety is fragile; 0002 needs danger flags |
| S3 `read` | File write/edit never allow + mediator refuse; shell = shared `adviseAllowsShell`; `git diff`/`status` mutate `.git` locks |
| S4 miss | **`read` not wired; default spawn stays `advise`** (`lib/worker.mjs:136`, `commands/work.md:15`) |

---

*End of PLAN-CRITIQUE.*
