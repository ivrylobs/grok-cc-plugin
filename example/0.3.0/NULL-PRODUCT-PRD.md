# Null-product PRD — grok-cc as a reliable throughput layer (no quality claim)

This is the **floor product**: what 0.3.0 ships even if the paper-kill returns "the duel
does not beat solo." It makes ZERO quality claims. It exists so that (a) shipping the floor
is a git tag, not a demoralizing pivot, and (b) the quality arms have a concrete, honest
baseline to beat — the failure clause has teeth only because this product is real and good.

Written per Fable's teeth #1 and the meta-flaw fix in FLAWS.md §E.

## What it is (one line)

**A reliable way to run Grok workers from inside Claude Code as parallel throughput** — spawn,
supervise, and reap delegated agents without babysitting — sold honestly as *labor-offload*,
not as *better answers*.

## Who it's for

A developer already in Claude Code who wants to (a) fan work out to a cheaper/parallel model,
(b) run over-context or wall-clock-bound tasks a single agent can't hold, or (c) keep a second
model on tap — and who is NOT promised the output is higher quality than solo Claude.

## What it promises — and what it explicitly does NOT

| Promises | Does NOT promise |
|----------|------------------|
| Workers run autonomously to DONE without per-turn babysitting (R1/R2) | That a Grok worker's answer beats solo Claude |
| One tracked wait per worker; no leaked pollers (R3/R4) | Any quality uplift from delegation |
| Read-only inspection + granted test runs don't drip permissions (R5) | "Two heads are better" — that's the gated quality thesis, not this |
| Deviations block instead of silently shipping (R8) | |
| Honest cost: you pay ~1× per worker; parallel = wall-clock win, not token win | |

## Feature set (all already built or in this release)

- `grok:work` — delegate a task; supervised advisory loop; grips (gate/advise/leash/read).
- Reliability: paused-nudge+escalate (R1), WORKING run-through (R2), `wait --actionable` (R3),
  no-poller skill (R4), permission whitelist + `--allow-tests` grant (R5), deviation-blocks +
  `--accept` acceptance (R8).
- Typed `Finding` store (R6) — available as structured output even in the floor product.
- `grok:status` table, config, models, resume.

## Explicit non-goals for the floor

- No duel, no ambient attack sold as quality, no "invisible reviewer" branding.
- README states plainly: *throughput and reliability; no quality claim vs solo Claude.*

## The bar this product sets (what the quality arms must beat)

The duel/attack quality surface earns its place ONLY by beating **this** product on a
**real-repo user task** — quality-per-2×-dollar — not by beating solo Claude on a lab exam.
If the paper-kill (§7) does not license the duel, 0.3.0 ships exactly this, plus the
THESIS-status surface stating the Grok-4.5 quality thesis was tested and not licensed for
this scope. That is not a failure of the release; it is the release being honest.

## Definition of done

- R1–R8 shipped + regression-tested (P1 stall & approval-drip cannot recur). ✅ (R1,R2,R3,R5,R6,R8; R4 skill)
- README carries the throughput-only framing and the no-quality-claim line.
- `THESIS.md` scaffold exists, ready to state the kill outcome if the paper-kill returns negative.
