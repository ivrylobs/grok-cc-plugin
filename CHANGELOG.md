# Changelog

## 0.3.0 — Reliability & Autonomy

The foundation release: it makes delegated Grok workers run **autonomously to done**
without babysitting, and lays the substrate the quality surface (0.4.0, gated behind a
paper-kill experiment) will stand on. No quality claim vs solo Claude — that's the
0.4.0 thesis, deliberately unproven and unbuilt here.

Every item below turns a measured friction from the benchmark (see `example/`) into a fix.
Suite grew 119 → 133 tests, all green.

### Autonomy & reliability
- **Paused-worker stall fixed (R1).** A turn that ended without a terminal `STATUS` used to
  park forever (a 36-minute silent stall in the benchmark). The broker now auto-nudges a
  paused worker once after a grace period, then escalates to a human `stalled` signal if it
  re-pauses — never looping a confused worker. Hardened after a decorrelated review caught
  five edge cases (latch-before-success, false-escalate, no reset on human `say`, dead-worker
  resurrection, missing timestamp).
- **`STATUS: WORKING` runs through (R2).** An explicit "still working" checkpoint now
  auto-continues under advise/leash/read (with a runaway cap) instead of costing a round-trip
  per turn. `gate` still parks for steering.
- **`grokctl wait --actionable` (R3).** One self-terminating wait per worker that fires only on
  actionable events (permission / done / blocked / need_input / stalled), skipping the
  checkpoint noise. `--any` waits on a whole fleet. Replaces the hand-rolled pollers that leaked.
- **Poller-free advisory loop (R4).** The skill now mandates the tracked `wait --actionable`
  and bans `&`-detached subshells and `while … sleep` pollers.

### Permissions & safety
- **Permission drip cut (R5).** Read-only git inspection expanded (`rev-parse`, `ls-files`,
  `show-ref`, `show`) and a scoped `grokctl spawn --allow-tests` grant lets one worker
  auto-run its test runners — keeping the global write-then-run escalation OFF by default.
  Security-audited: `git cat-file` was pulled (its `--textconv` runs a driver), and the
  global-option-prefix bypass and the read-grip test leak were both verified closed.
- **Deviation is blocking (R8).** The worker brief now makes any design/acceptance deviation a
  blocking `NEED_INPUT` — a "documented trade-off" shipped without approval is a defect, not a
  note. New `grokctl spawn --accept <cmd>` makes DONE invalid until an acceptance command passes.

### New substrate for 0.4.0
- **Typed `Finding` (R6).** `lib/finding.mjs`: class-validated findings (REPRO needs a runnable
  reproduction, JUDGMENT a counterfactual, GAP a spec+deviation) with an enforced gate — a
  proposed REPRO **cannot** be accepted without first being reproduced. `grokctl findings` /
  `grokctl finding <id> <status>`.
- **Exchange-law contract.** `lib/exchange.mjs`: the chat guard. Only structured references
  (`problem` / `tree` / `finding` / `court`) may cross between model arms on the quality path;
  free-text prose is refused and counted (`proseHops`). Prevents the invisible `min()`
  regression before the duel is ever built.

### Docs
- `example/0.3.0/` — the full design record: `SHIP-0.3.0.md`, the 40-flaw register, the
  ambient-ladder UX, and the `NULL-PRODUCT-PRD`, `DUEL-REPORT-SPEC`, and `EXCHANGE-LAW` specs
  that guide the gated 0.4.0 build.

### Deferred to 0.4.0 (they guard the duel, which the paper-kill must license first)
- Cost caps (S-5), quality-path grip discipline (S-2), the worktree primitive, the duel + court,
  the ambient attack tier, and the router.

## 0.2.2 and earlier
See git history.
