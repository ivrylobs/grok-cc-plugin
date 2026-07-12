# Changelog

## 0.3.0 — Reliability & Autonomy (the honest floor)

The foundation release: it makes delegated Grok workers run **autonomously to done**
without babysitting. It ships with **no claim to out-quality solo Claude** — and that
isn't a hedge, it's a **result**. We ran a pre-registered, blind, adversarial experiment
(the "paper-kill") to test whether a Grok peer makes the code *better* than solo Claude,
and it returned **KILL** for this scope. So the 0.4.0 "duel" machinery is **deliberately
not built**, and the honest floor is the product. See [`THESIS.md`](THESIS.md) and
[`example/paper-kill/`](example/paper-kill/).

Every item below turns a measured friction from the benchmark (see `example/`) into a fix.
Suite grew 119 → 133 tests, all green.

### The honest floor (why 0.4.0 isn't here)
- **`THESIS.md`** — the quality thesis, tested and killed for greenfield scope, kept in the
  repo with its data. What died (quality uplift on Claude's home turf), what didn't
  (throughput; co-thinking on messy code), and what ships instead.
- **The paper-kill record** — [`example/paper-kill/`](example/paper-kill/): two orthogonal
  hard problems, both behaviorally saturated (solo Claude = reference quality), design axis
  favoring solo Claude on the binding grid, autonomy cratered. Pre-registration, protocol,
  both runs, and the computed [`VERDICT.md`](example/paper-kill/run-2/results/VERDICT.md).

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
- `example/paper-kill/` — the experiment that decided it: pre-registration, protocol, both runs,
  the hidden scoring suites, and the computed verdict.
- `example/0.3.0/` — design records from the 0.3.0/0.4.0 planning. `NULL-PRODUCT-PRD` and
  `EXCHANGE-LAW` describe what actually shipped; `DUEL-REPORT-SPEC`, `AMBIENT-UX`, and `FLAWS`
  are the design of the 0.4.0 the paper-kill killed — kept as honest history, not a roadmap.
- `example/problem-1-rx-fulfillment/` — the origin benchmark (solo-Claude 93.5, co-work 85.5,
  solo-Grok 80.5) that first showed collaboration subtracting, and motivated the whole test.

### Cut, on purpose (the paper-kill returned KILL)
- The 0.4.0 duel/court/router, the ambient attack tier, cost caps (S-5), and quality-path grip
  discipline (S-2) — all deferred machinery that guarded a duel we decided not to build. If the
  thesis is ever re-opened, it's a new experiment (a different peer model or regime), not a
  resumed roadmap.

## 0.2.2 and earlier
See git history.
