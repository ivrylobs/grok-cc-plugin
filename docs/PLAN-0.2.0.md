# 0.2.0 — "the gate actually holds"

One-shot release. Fix the security and correctness defects that make the veto
gate — the plugin's entire thesis — leak, then land the read-only grip the
autonomous-teammate direction (0.3.0) depends on.

This plan was built with three adversarial Grok critiques
([COMPETITIVE-ANALYSIS](COMPETITIVE-ANALYSIS.md), [TEAMMATE-CRITIQUE](TEAMMATE-CRITIQUE.md),
[PLAN-CRITIQUE](PLAN-CRITIQUE.md)). Where a critique changed the plan, it is noted.

## Scope decision

The `read` grip ships **inside 0.2.0** (user call, 2026-07-10). It is the largest
item and the foundation for 0.3.0, but without it there is no safe autonomous
consult path, so it belongs with the security fixes.

Streaming partial output (backlog 0004) is **dropped** from 0.2.0 — all three
critiques flagged it as a separate subsystem with high regression risk next to a
policy rewrite. It leads a later release.

## Items, in ship order

### 1. Shell policy rewrite — `lib/policy.mjs` `adviseAllowsShell` (63-70)

Closes [0006](backlog/0006-advise-newline-smuggles-second-command.md) (newline
RCE), [0001](backlog/0001-advise-blocks-chained-readonly-commands.md) (`&&`
chains), [0002](backlog/0002-advise-allowlist-missing-readonly-heads.md) (missing
heads) — one function.

- Fail closed on the control-character class `/[\x00-\x08\x0a-\x1f\x85  ]/`
  (keep `\t` and space). Only `\n` is bash-exploitable; reject the rest
  defense-in-depth.
- Split on `&&`, validate every segment independently against the existing
  per-segment pipe/head rules. `split('&&')` must run **before** the `[;&]` test
  or `&&` trips the `&` branch (0001).
- Add `head`, `find`, `sed -n`, `wc`, `test` as heads — **with danger guards**
  (from PLAN-CRITIQUE S2): extend `ADVISE_DANGER_FLAG` so `sed -i`,
  `find -exec`/`-delete`/`-ok`/`-fprintf`, and bare `sed` (vs `sed -n`) stay
  `ask`. Adding heads without guards turns them into write/exec oracles.

Tests (`test/policy.test.mjs`) must lock, per PLAN-CRITIQUE S2: `\n`/`\r`/comment-
newline → ask; `cat a && cat b` → allow; `cat a && rm` → ask; `||` and `|&` →
ask (their safety is currently *accidental* — it rides on pipe-splitting, so a
naive refactor reopens it); `sed -i`/`find -delete` → ask.

### 2. Persist DONE prose — `lib/contract.mjs` (23,28) → `lib/worker.mjs`

Closes [0007](backlog/0007-done-discards-worker-prose.md). Store `parsed.raw`
alongside `result`; `grokctl result` returns the prose, not only the fenced JSON.

**Ordering (PLAN-CRITIQUE S1): this lands before the build loop below.** Until it
does, every Grok review used to build 0.2.0 reaches the captain as a stripped
abstract — including the reviews of this very release.

### 3. New `read` grip — `lib/policy.mjs` + `lib/fs-mediator.mjs` + wiring

The only genuinely read-only grip. From TEAMMATE-CRITIQUE S2 and PLAN-CRITIQUE
S3/S4:

- **Enforcement is in the mediator, not policy.** `decideToolCall` returns only
  `allow|ask` — no `deny` — and an `ask` is not read-only because the captain can
  answer `allow`. So `fs-mediator.writeTextFile` must **hard-refuse** writes when
  `grip === 'read'` (not stage — staging is still a side effect). `readTextFile`
  unchanged.
- `decideToolCall('read', …)`: `read` → allow; `write`/`edit` → never allow;
  `execute` → allow iff the fixed `adviseAllowsShell` passes; else ask. Must be an
  explicit branch before the `gate`/unknown fallthrough.
- **Wire it or it is dead code** (PLAN-CRITIQUE S4): default spawn grip is
  `advise` (`lib/worker.mjs:136`, `commands/work.md:15`). Add `read` to the
  work-command grip options and to any consult/second-opinion spawn template, or
  0.2.0 ships a grip nothing selects.
- Honest caveat to document: `git status`/`git diff` are allow-listed and can
  touch `.git/index.lock` — `read` means "no mediated file writes + no free-form
  shell," not "no subprocess touches disk."

### 4. Fix or delete `agents/grok-worker.md`

Closes the real half of [0003](backlog/0003-parent-agent-cannot-answer-permissions.md).
The subagent path spawns + waits + reads result with no inbox drain, and a
subagent cannot answer a permission — so it deadlocks and returns `null`. Delete
it, or rewrite it to hand permissions back to the top-level captain.

### 5. Rewrite backlog 0003 (done in this branch)

Root cause corrected to the subagent path; severity blocker → major. Kept for
provenance. Non-blocking for code.

### 6. Timezone — `commands/status.md:11` → `grokctl list --table`

Closes [0008](backlog/0008-status-table-renders-utc-as-local.md). Move timestamp
formatting into the CLI (local time + explicit offset, or labelled `Z`); present
the table verbatim instead of asking a model to format JSON. Independent of 1-5;
fine in parallel or late.

## Build loop (how, not just what)

Per the collaboration model, and because two confident captain claims were wrong
today (captain-can't-answer; five-vector severity), neither model both writes and
blesses the same code:

1. Item 2 (persist prose) lands first, so critiques are readable.
2. Grok writes the failing `test/policy.test.mjs` cases **first**, under
   `--grip gate` (writes stage; captain reviews before apply).
3. Captain implements the `adviseAllowsShell` rewrite and the `read` grip.
4. A **fresh** Grok worker — no context of the captain's reasoning — attacks the
   patch for a bypass. Its enumeration (PLAN-CRITIQUE S2) is the acceptance bar.

## Not in 0.2.0

- Streaming partial output (0004) — separate subsystem, deferred.
- `/grok:review`, `/grok:setup`, batched prompts, `/grok:transfer` — 0.3.0
  competitor-gap items, and `/grok:review` now depends on items 1-3 anyway.
- The autonomous-teammate trigger mechanism — 0.3.0. TEAMMATE-CRITIQUE settles
  the shape: default off, session budget, consult only at explicit human/workflow
  boundaries (not path-regex structural triggers), on the `read` grip this release
  builds.
