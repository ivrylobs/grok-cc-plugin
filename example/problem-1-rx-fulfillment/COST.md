# Problem 1 — cost / effort log (measured, not scored)

Quality scores are in SCORECARD.md. This is the effort/time half of the ask.

| Condition | Wall-clock | Effort | Human interventions | Result |
|-----------|-----------|--------|--------------------:|--------|
| **claude-answer** (solo, blind) | **11 min** | ~113k tokens, 39 tool calls, one subagent | **0** — fully autonomous | 33 tests pass · scored **93.5**, rank **1** |
| **grok-answer** (solo, blind) | **56 min** wall (**~20 min active + ~36 min stalled**) | Grok worker + captain babysitting | **~7** (env probe, resume-nudge, ~5 test/inspect approvals) | 26 tests pass · scored **80.5**, rank **3** |
| **claude-grok-answer** (co-work) | **60 min** wall (~24 active + ~36 stalled) | Claude wrote DESIGN.md + reviewed/hardened; Grok implemented | **~8** (design authoring + review + approvals) | 29 tests pass · scored **85.5**, rank **2** |
| grok rater (grading pass) | 7 min | Grok worker, read grip | 4 approvals (test runs) | independent scorecard |

### What this says about effort/time (your question)

- **Claude solo was by far the cheapest to get a top answer:** 11 minutes, zero human
  attention, best score. It just ran.
- **The Grok-driven conditions cost 5× the wall-clock and constant human attention.**
  But be fair about *why*: ~36 min of that was the `paused` stall (a **plugin bug**,
  finding F1 — not Grok being slow). Subtract it and Grok-solo's *active* build was
  ~20 min. The irreducible cost difference is the **human babysitting**: every test
  run and file inspection hit the veto gate and needed a manual approval, where the
  Claude subagent needed none.
- **Co-work cost the most human effort of all** (design + review + approvals) and did
  not out-score the best solo — the collaboration tax wasn't repaid *on this problem*.

The stall (F1) and the approval-drip are exactly the friction the next phase fixes;
re-running on the improved plugin should collapse the wall-clock gap toward the
active-time gap (~20 vs 11 min) and cut interventions sharply.

Intervention = a human (captain) had to answer a permission or steer. Checkpoints
that need no action are not counted but ARE noted as tooling friction (backlog).
