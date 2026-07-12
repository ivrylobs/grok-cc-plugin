# Paper-kill run 1 — efficient design (pre-registered)

Author: Fable 5 (neutral, non-arm). Committing this file freezes the scoring rules.
No arm has run. No arm wrote the problem, the hidden suite, or the rubric.

Answers one question: does involving Grok (adversary or blind-parallel duel) make the
final code better than Claude solo, enough to license the 0.4.0 duel machinery — or is
the honest product the throughput floor with no quality claim?

## 1. The arm set — 6 work units instead of 12

| Run | What | Why it is load-bearing |
|-----|------|------------------------|
| **S0a** | solo Claude, fresh session, bundle only, 60 min cap | baseline point 1; base tree for S1a/S2 |
| **S0b** | solo Claude, second fresh session, same conditions | baseline point 2 → the noise floor (E3); **doubles as the duel's Claude arm** — the duel's generation phase is process-identical to a blind solo solve, so this run is reused, not duplicated |
| **G** | solo Grok, same conditions | the duel's Grok arm (not a graded baseline of its own) |
| **S1a′** | Claude self-attack on frozen S0a → fix | prices the *generic second-pass* effect; without it a Grok win licenses the wrong product (E7). Behavioral score only. |
| **S2′** | Grok attack on frozen S0a under product constraints → Claude fix | the attack tier, tested as it would ship (E2) |
| **Duel** | cross-attack S0b↔G, each author fixes own tree → **DC**, **DG**; winner **W** | the thing 0.4.0 would actually build (E1) |

Paired structure is the efficiency trick: S1a′ and S2′ share base S0a (their deltas are
directly comparable, base variance cancels); the duel reuses S0b and G. Three generative
solves, two review-fix passes, one cross-attack. All generation runs in parallel.

### What was cut, and why it is safe

- **S1b (Claude→Claude handoff)** — answers *why* P1 lost (handoff vs Grok), which is
  attribution science, not the build/kill decision. Nothing in the verdict rule needs it.
  If today's result is confusing, S1b is the follow-up — never the gate.
- **Problem 2 for the KILL path** — a kill on one fair, non-house-style, pre-registered
  problem is sufficient to *not build machinery today*; a kill is reversible by new
  evidence later. A **license is not** — it commits engineering — so any LICENSE below is
  provisional until it replicates on P2. Asymmetric burden: cheap kill, replicated license.
  P2's domain is named now so it can't be tuned later: **timezone-aware recurring-event
  expansion (RRULE subset) with DST-boundary correctness** — calendrical logic, maximally
  far from both async concurrency and hexagonal DDD. I author it only if triggered.
- **Grok solo as a graded baseline** — G is only the duel's input arm. Grading Grok solo
  against Claude solo answers "which model is better," which is not the question.

### Cheapest kill / cheapest license

- **Kill:** the 6 units above, one session. Early exit: if Grok's cross-attack on S0b
  yields zero accepted (reproducible) findings, then DC = S0b, and B(DC) can never clear
  `S0̄_B + N_B` (since |B(S0a)−B(S0b)| ≤ N_B by construction); if additionally B(DG) and
  B(S2′) miss their bars, skip the design grading of DC/DG — the verdict is already KILL.
- **License:** same 6 units, plus one replication (same design, problem P2) before any
  0.4.0 code is written.

## 2. Problems, referee, rubric (frozen)

- **PROBLEM.md** — AsyncTaskQueue: a TypeScript/Bun concurrency library. Non-house-style
  (no service, no layers — hexagonal DDD has zero purchase), non-ceiling (calibration
  below), one session, and the hard part is exactly the interaction cases.
- **hidden/score.ts** — 22 executable checks, 100 points: 34 fundamentals / 66
  interactions (dedup×abort, orphaned-slot accounting, timeout×retry, shutdown
  mid-flight). **Calibrated:** reference implementation scores 100/100; a deliberately
  mediocre implementation (basics right, interactions wrong) scores **70/100** — a
  30-point separation against an 8-point noise floor. Referee is not saturated and not
  a coin flip (S-7, D2).
- **RUBRIC.md** — 6 human-graded dimensions × 0–4 (D: 0–24), with the anonymization
  procedure and the tell-stripping list.

Freeze hashes (sha256, committed with this file):

```
8e039f0af96628dcb4eb7463fbeb20a415e00048cb2134337e91fc850ae542ea  PROBLEM.md
6e601fe003ed2fbfbd807ca896ddca3a51505f1445d65b1b0c3fa878ebc6ada1  hidden/score.ts
ab89ceb18b0e497d8baeadb64183aaee200507f2f839f380fdedabf697fc0872  hidden/reference/src/queue.ts
34fdd0777dec6f93d5612a25429341b8f2390a36cae5f67c04028869101e8426  RUBRIC.md
```

## 3. Run rules (integrity — violating any one voids the run it touches)

1. **Isolation.** Every generative arm (S0a, S0b, G) runs in a fresh directory containing
   only PROBLEM.md, in a fresh session with no access to this repo, no chat history, and
   the same skill pack or none. 60-minute soft cap; whatever exists at cap ships as-is.
2. **The hidden suite never enters any arm's context.** Scoring = copy `hidden/score.ts`
   into the tree root and `bun score.ts`, after all fixing is over. One scoring run per
   final tree; the JSON line is the record.
3. **Product constraints on every Grok involvement** (S2 and cross-attack):
   read-only grip on the target tree; every finding = `findings/NN.md` + a runnable
   `findings/NN.repro.ts` that exits non-zero against the current tree while citing the
   PROBLEM.md rule it violates; a finding whose repro does not run or does not fail is
   **discarded without discussion**; max 8 findings per attack.
4. **Symmetric budgets.** S1a and S2 use the identical format, finding cap, and a
   25-minute fix pass. Fixes may address submitted findings only — no opportunistic
   refactoring (else the fix pass becomes a second solve and the comparison dies).
5. **Exchange law.** Between models: problem bytes, trees, finding files, scores. No
   prose hops — no captain paraphrasing "Grok said…". Duel fixes: each author fixes its
   OWN tree from the opponent's findings.
6. **Log interventions.** Every human touch from arm kickoff to arm result, counted per
   arm. Off the license bar, on the record.
7. **Order of operations.** All behavioral scoring and the sealed anonymization happen
   BEFORE the human opens any tree to grade; all six D-scores per tree are written before
   unsealing the mapping.

## 4. The verdict rule (pre-registered, computable)

Let `B(x)` = hidden-suite total (0–100), `D(x)` = rubric total (0–24).

```
S0̄_B = (B(S0a) + B(S0b)) / 2
N_B  = max(|B(S0a) − B(S0b)|, 8)          # behavioral noise floor
D̄0  = (D(S0a) + D(S0b)) / 2
N_D  = 3                                   # design noise floor (fixed: single-grader, 0–24 scale)

W = DC if B(DC) > B(DG); DG if B(DG) > B(DC); tie → higher D; tie again → no winner (duel cannot license)

duelClears   = [B(W) ≥ S0̄_B + N_B  AND  D(W) ≥ D̄0 − N_D]
            OR [D(W) ≥ D̄0 + N_D   AND  B(W) ≥ S0̄_B − N_B]
attackClears = [B(S2′) − B(S0a) ≥ N_B  AND  D(S2′) ≥ D(S0a) − N_D]
grokSpecific = [B(S2′) > B(S1a′)]
```

First matching line is the verdict:

1. `duelClears AND (B(W) ≥ B(S2′) OR NOT attackClears)` → **LICENSE-DUEL** (provisional).
2. `attackClears AND grokSpecific` → **LICENSE-ATTACK-ONLY** (provisional).
3. `attackClears AND NOT grokSpecific` → **KILL the Grok thesis**; record "generic
   second-pass effect": what helped was *a structured review pass*, so any shipped
   review surface is model-agnostic with no Grok quality claim (E7).
4. otherwise → **KILL**: ship the 0.3.0 floor (throughput + reliability), zero quality
   claims; Grok-4.5 quality thesis recorded dead for this scope.

Rule 1's guard exists so a duel that merely ties the 1.3× attack tier cannot license 2×
machinery. Rule 3 exists so Grok cannot take credit for what Claude's own second look
achieves under the identical budget.

**Replication clause:** either LICENSE is provisional; before any 0.4.0 quality code, the
identical design must clear the same rule on P2 (domain fixed in §1). A KILL on P1 is
final for the grok-4.5 snapshot; a different peer model is a new hypothesis, run from
scratch.

**Off the bar, on the record:** intervention counts, wall-clock, tokens/$, discarded-vs-
accepted finding counts per attack (the precision number the ambient tier will live or
die by).

## 5. Runbook (one session, ≈ 3.5–4 h)

1. Commit this directory (opens the gate; hashes above are the freeze).
2. Parallel: S0a, S0b (fresh Claude sessions), G (Grok worker) — 60 min. Freeze all
   three trees (copy or tag; record SHAs).
3. Parallel: S1a (Claude self-attack+fix on a copy of S0a) and S2 (Grok attack on
   read-only S0a, Claude fix on a copy) — ≈ 55 min. Freeze S1a′, S2′.
4. Duel: Grok attacks S0b (read-only) while Claude attacks G; each author fixes own
   copy, 25 min — freeze DC, DG.
5. Score: copy `hidden/score.ts` into each of S0a, S0b, S1a′, S2′, DC, DG; run once
   each; record the JSON lines.
6. Anonymize the five D-graded trees per RUBRIC.md (S0a, S0b, S2′, DC, DG); human
   grades; unseal.
7. Compute §4 top-to-bottom. Write the verdict and the numbers into
   `results/VERDICT.md`. If LICENSE: schedule the P2 replication before any 0.4.0 code.
