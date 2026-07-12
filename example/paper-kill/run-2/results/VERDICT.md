# run-2 verdict — P2 ZonedRecurrence

**Outcome: KILL.** Ship the 0.3.0 throughput/reliability floor with zero quality claims.
The Grok-4.5 quality thesis is recorded **dead for this scope**. (A different peer model is a
new hypothesis, run from scratch — not an escape hatch for this one; DESIGN §5.)

Gate: commit `501a0ab`, 7 materials frozen and hash-verified. Suite verified discriminating
(reference=100/100, foil=73/100). Grading: blinded-best-effort, same-day (RUBRIC procedure).

---

## 1. Behavioral axis — Rule 0 NO-TEST (saturated a second time)

| Arm | B (hidden suite, 0–100) | src/recur.ts SHA |
|-----|-------------------------|------------------|
| S0a (solo Claude) | 100 | c7e41f1087dc1820 |
| S0b (solo Claude) | 100 | 7959e7009e969818 |
| G   (solo Grok)   | 100 | 0371bb918b031109 |

`S̄0_B = 100 > 92` → **Rule 0: NO-TEST (behavioral referee saturated).** Second consecutive
saturation on an orthogonal hard problem (run-1 was AsyncTaskQueue; run-2 is a DST/RRULE
library Fable-calibrated for a 73-point foil). Solo Claude Opus reaches reference quality on
purpose-built hard problems, so **no arm can show behavioral uplift** — the behavioral axis is
not merely unproven, it is **unmeasurable** in this regime. Solo Claude is the ceiling.

## 2. Design axis — the fallback signal, and it points *against* the peer

The only quality signal left under behavioral saturation (as in run-1). Three-model blind
panel on anonymized trees; **Fable's neutral grid is verdict-binding** (RUBRIC grading-authority
clause — never the panel average, closing run-1's 0.5-point panel-flip ambiguity).

Mapping (sealed during grading, unsealed after): **A=S0b, B=S0a, C=G**.

| Arm | Grok Σ | Claude Σ | **Fable Σ (binding)** |
|-----|:------:|:--------:|:---------------------:|
| **S0a** (solo Claude) | 18 | 22 | **24** |
| **S0b** (solo Claude) | 23 | 23 | **22** |
| **G**   (solo Grok)   | 15 | 15 | **14** |

- **Solo Grok's design is last on all three grids, unanimously** — 8–10 points below both
  Claude baselines on the binding grid. Run-1's design axis was an ambiguous tiebreaker; run-2's
  is not close. The one axis where quality could still surface favors *solo Claude*.
- **Integrity clean:** Grok scored its own tree (C=G) lowest of the three (15), same as run-1.
  No self-favoritism; the harsh-on-others / harsh-on-self pattern is consistent.
- `D̄0 = (24+22)/2 = 23`, `N_D = 3`.

## 3. Verdict rule §5 (top-to-bottom, first match wins)

```
Rule 0:  S̄0_B = 100 > 92  → NO-TEST (behavioral referee saturated)

W (duel winner) = higher B in {DC, DG}; B(DC)=B(DG)=100 tie
                → higher D: D(DC=S0b)=22 > D(DG=G)=14  → W = DC   (B=100, D=22)

duelQuality   = [B(W) ≥ S̄0_B + N_B]  OR  [D(W) ≥ D̄0 + N_D]
              = [100 ≥ 100 + 6]        OR  [22 ≥ 23 + 3]
              = FALSE                  OR  FALSE                   = FALSE
attackQuality = [B(S2′) − B(S0a) ≥ N_B  AND  D(S2′) ≥ D(S0a) − N_D]
              = [100 − 100 = 0 ≥ 6]     …                          = FALSE
attackTP      = throughputClears(attack) = FALSE   (see §4)
duelTP        = throughputClears(duel)   = FALSE   (see §4)

Line 1  duelQuality  AND duelTP                       → FALSE
Line 2  attackQuality AND attackTP                    → FALSE
Line 3  (duelQuality AND ¬duelTP) OR (attackQuality AND ¬attackTP) → FALSE
Line 4  otherwise                                     → KILL   ◀
```

`N_B = max(|100−100|, 6) = 6`. Even ignoring Rule 0 and running the numbered lines on the
design axis alone, **duelQuality is FALSE on its own terms** (D(W)=22 < D̄0+N_D=26): the duel
tree that wins is a Claude baseline, and it cannot exceed the Claude baseline mean — because the
only way a duel *raises* the ceiling is Grok's tree winning, and Grok's tree is 8 points worse.

## 4. Throughput / autonomy axis (THROUGHPUT.md) — cratered on both paths

Data: `results/timing.csv`, `results/interventions.csv`. `W_solo = mean(731s, 560s) = 645.5s`;
`H_solo = 0` (both baselines ran as unattended subagents — zero rows, the product target).

**Attack path** (S2 attack + S2′ fix): 20 interventions, **0 accepted findings**, **2 steer
events** (denied a workspace-escape search — isolation guard; then forced finalize after Grok
looped). Grok probed ~18 DST/RRULE scenarios and concluded "zero violations found."

| Bar | Attack | Threshold | |
|-----|:------:|:---------:|:-:|
| T1 interventions/finding | 20 / max(0,1) = **20** | ≤ 2.0 | ✗ |
| T2 marginal interventions | **20** | ≤ 12 | ✗ |
| T3 wall ratio | 1725s / 645.5s = **2.67×** | ≤ 1.5× | ✗ |
| T4 no crater | **2 steer events** | required | ✗ |

**Duel path** (G solve + cross-attacks + fixes): 14 marginal interventions, 1 accepted finding
(DC: rule-16 `count=200001` truncated at MAX_ITER — a degenerate absurd-input edge, B unaffected;
fix = 1-line cap). DG (Claude attacks G): 0 findings → no fix.

| Bar | Duel | Threshold | |
|-----|:----:|:---------:|:-:|
| T1 interventions/finding | 14 / 1 = **14** | ≤ 2.0 | ✗ |
| T2 marginal interventions | **14** | ≤ 16 | ✓ |
| T3 wall ratio | ~1.85× | ≤ 2.0× | ✓ |
| T4 no crater | **1 steer event** | required | ✗ |

Both paths fail T1 by ~7–10× and crater on T4. `throughputClears = FALSE` for each. This is the
**4th confirmation** across both runs that the Grok red-team path is not autonomous: run-1 cost
13 & 22 approvals per attack; run-2 cost 20 (attack) + 13 (duel) with near-zero useful yield and
required human steering to terminate. An "autonomous peer" that needs a human more than twice per
bug it proves — and here proved essentially none — is a review tool with a babysitter.

## 5. What this licenses

Nothing above the floor. Per DESIGN §5 line 4 and the SHIP-0.3.0 §1 failure clause:

- **KILL is final for the grok-4.5 snapshot on this scope.** Two purpose-built hard problems,
  both behaviorally saturated; the fallback design axis favors solo Claude unanimously; autonomy
  cratered 4×. There is no path to LICENSE-DUEL or LICENSE-ATTACK-ONLY in this data.
- **Ship the 0.3.0 floor** (invisible-reviewer identity, reliability R1–R8, exchange law), and
  the honest kill record: THESIS surface stating the quality claim was tested, pre-registered,
  and not licensed for this scope — with this data.
- **The autonomy-crater finding is itself a product signal:** the value the plugin *can* defend
  is throughput/reliability with zero-intervention subagent solves, not a Grok quality uplift.

**Owner action (yours, not the model's — SHIP-0.3.0 §1/§10):** co-sign the failure clause so
the kill is on record with a date, then P2 (honest floor: ambient attack tier + THESIS surface)
is unblocked.

_Off the bar, on the record: token/cost per arm recorded but not gating (cross-vendor noise);
discarded-vs-accepted findings — attack 0/many-probes, duel 1 degenerate/13-probes._
