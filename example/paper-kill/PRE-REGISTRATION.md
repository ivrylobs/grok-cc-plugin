# Pre-registration — paper-kill (lock this BEFORE any problem is chosen)

Committing this file (git-timestamped) is what opens the gate. After this is locked, problem
choice, scoring, and grading cannot be tuned toward a result — that's the entire point.
Method: see `PROTOCOL.md`.

## Fixed rules (committed)

- **Arms:** S0×2, S1a, S1b, S2, S3 — run on **both** problems. Definitions per PROTOCOL §Arms.
- **Two scores:** S_beh (frozen executable suite, automated) and S_arch (human blind grade on
  anonymized trees). Reported separately.
- **Product constraints on S2/S3:** read-grip, repro-gated findings, unreproduced discarded,
  fix-budget cap. A win under a cleaner-than-shipped process does not count.
- **Metrics logged, off the license bar:** intervention count, wall-clock, tokens/$.
- **σ** = stdev of the two S0 behavioral runs; **S0̄** = their mean, per problem.

## Verdict thresholds (committed)

- **License DUEL** iff, on BOTH problems: `S3 ≥ S0̄ + 2σ` on ≥1 axis AND `S3 ≥ S0̄ − σ` on the other.
- **License ATTACK-as-lint** iff, on both: `S2 ≥ S0̄ + 2σ` on S_beh AND `S2 ≥ S0̄ − σ` on S_arch.
- **KILL** (ship floor + THESIS surface) iff neither clears on both.
- Quality-per-dollar is NOT on the bar.

## The failure clause (owner co-signs)

> If no arm clears its pre-registered threshold on both problems by the drop-dead date, the
> Grok-4.5 **quality** thesis for this scope is recorded **dead**. 0.4.0 becomes the null
> product (throughput + reliability) or a *different* peer model as a new hypothesis — not a
> re-roll of this experiment. 0.3.0-floor ships regardless.

## Owner-owned slots — TO LOCK

| Slot | Value |
|------|-------|
| Third-party author (problems + S_beh + S_arch contract) | ⬜ _to decide_ |
| Blind S_arch grader (human, license-binding) | ⬜ _to decide_ |
| Drop-dead date | ⬜ _to decide_ |
| Failure clause co-signed | ⬜ _pending_ |
| Owner signature / date | ⬜ |

_Nothing below the line runs until the four slots are filled and this file is committed._
