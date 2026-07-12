# Throughput / autonomy axis — run-2 (pre-registered)

Run-1 never measured this, and its one incidental data point was a warning: Grok attack
workers needed ~13-22 human approvals each while Claude subagents needed 0. The 0.4.0
product thesis is an AUTONOMOUS peer; a quality win purchased with a babysitting tax is not
the product. This file freezes what is measured and the pass/fail bars before any arm runs.
Numbers below cannot be tuned after kickoff.

## 1. What is measured, per arm, per phase

Phases: `solve` (S0a, S0b, G), `attack` (S2 attack, duel cross-attack x2), `fix` (S2′ fix,
duel fixes x2). Timers start when the arm's kickoff prompt is submitted and stop when its
tree/finding set is frozen (SHA recorded).

1. **Wall-clock** — `results/timing.csv`, one row per phase:
   `arm,phase,started_at,ended_at` (ISO instants).
2. **Human interventions** — `results/interventions.csv`, one row per touch:
   `ts,arm,phase,type,note` with `type` one of:
   - `approval` — permission-gate approve/deny the arm needed to proceed
   - `auth` — login/re-auth/credential fix
   - `unstick` — restart, kill, retry, or nudge of a stalled arm
   - `steer` — any human-authored content beyond approve/deny/auth (a hint, a command,
     a correction). Steering is also an integrity event: it voids the touched arm unless
     it is purely mechanical (e.g. re-running the identical kickoff after a crash).
   A Claude subagent running unattended logs zero rows. Zero rows is the product target.
3. **Tokens / cost** — recorded per arm where the tooling reports it (Claude session cost,
   Grok worker usage). **Recorded, not gating** — cross-vendor cost accounting is too noisy
   to bear a license decision this run.

## 2. Derived quantities (computable from the two CSVs + finding counts)

- `W_solo` = mean(wall(S0a solve), wall(S0b solve)); `H_solo` = mean of their interventions.
- **Attack path** (what LICENSE-ATTACK-ONLY would ship): marginal cost on top of a solo solve.
  - `H_marg(attack)` = interventions in S2 attack + S2′ fix phases.
  - `W(attack)` = wall(S0a solve) + wall(S2 attack) + wall(S2′ fix) — sequential by design.
- **Duel path** (what LICENSE-DUEL would ship): parallel-aware critical path.
  - `H_marg(duel)` = interventions in G solve + both cross-attacks + both fixes.
  - `W(duel)` = max(wall(S0b solve), wall(G solve)) + max(wall of the two attacks)
    + max(wall of the two fixes).
- `A(path)` = accepted findings: repro-gated findings NOT discarded (repro ran and exited
  non-zero against the target tree). Attack path: findings delivered to the S2′ fix.
  Duel path: accepted findings summed over both directions.

## 3. Pre-registered thresholds

`throughputClears(path)` is TRUE iff ALL of:

| # | Bar | Attack path | Duel path |
|---|-----|-------------|-----------|
| T1 | Interventions per accepted finding: `H_marg / max(A,1)` | ≤ **2.0** | ≤ **2.0** |
| T2 | Absolute marginal interventions: `H_marg` | ≤ **12** | ≤ **16** |
| T3 | Wall-clock: `W(path) / W_solo` | ≤ **1.5** | ≤ **2.0** |
| T4 | No crater event (below) | required | required |

**Crater events** (any one fails T4 for that path outright):
- any single phase needs > 25 interventions;
- any `steer` intervention (human authored content for the arm);
- an unattended stall > 15 minutes that only a human restart resolved.

**Why these numbers (fixed now so they cannot be tuned later):**
- T1 = 2.0: run-1's two Grok attacks cost 13 and 22 approvals for 8 accepted findings each
  (1.6 and 2.75 per finding) — with zero measured quality payoff. 2.0 splits them: the
  better run-1 attack would pass, the worse would fail. An "autonomous peer" that needs a
  human more than twice per bug it proves is a review tool with a babysitter, not a peer.
- T2 = 12 / 16: run-1's observed 13 and 22 both FAIL the attack cap. Deliberate: the plugin
  claims autonomy work since run-1 (permission-gate handling); if that work is real, ≤ 12
  is comfortable. If run-1's behavior repeats, throughput fails and the verdict says so.
  The duel gets +4 because it runs one extra Grok phase (the G solve; run-1: +2 approvals).
- T3 = 1.5x / 2.0x: the attack tier is pitched as the cheap add-on — half a solo solve of
  extra wall time is the most a "fast follow-up review" can cost. The duel runs everything
  twice in parallel plus an exchange; if its critical path exceeds 2 solo solves end to
  end, "run two models" has become "wait two turns," and the 0.4.0 pitch dies on latency.

## 4. Interaction with the verdict

`throughputClears` feeds DESIGN.md §5 as a hard conjunct: a path can only LICENSE if its
quality clears AND its throughput clears. Quality-without-throughput is the pre-registered
outcome QUALITY-WITHOUT-AUTONOMY (kill the autonomous machinery, record the quality effect,
permit at most a human-supervised review tier). Off the bar but on the record: tokens/cost,
discarded-vs-accepted finding counts per attack, and per-phase intervention histograms.
