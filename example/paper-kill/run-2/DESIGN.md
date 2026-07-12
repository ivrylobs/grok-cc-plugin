# Paper-kill run 2 — design (pre-registered)

Author: Fable 5 (neutral, non-arm). Recording this file with the freeze hashes below locks
the problem, the referee, the rubric, the throughput bars, and the verdict rule. No arm has
run. No arm wrote any material in this directory.

Run-1 (P1, AsyncTaskQueue) ended in KILL-by-saturation: all six arms scored 100/100 on the
behavioral suite, so the experiment could not measure whether Grok makes code more correct —
and throughput/autonomy, the actual product thesis, was never measured at all. Run-2 closes
both gaps:

- **Gap 1 (headroom):** P2 is calendrical logic with three orthogonal trap families; the
  suite is empirically calibrated so a strong one-session solo solve lands well below 100
  (§3). A saturation guard (§5 rule 0) makes a repeat saturation NO-TEST, not a fake verdict.
- **Gap 2 (autonomy):** every arm is instrumented for wall-clock and human interventions,
  with pre-registered pass/fail bars (THROUGHPUT.md). Quality that craters autonomy gets its
  own verdict line instead of hiding.

## 1. The arm set — 6 work units (plus one conditional)

| Run | What | Why it is load-bearing |
|-----|------|------------------------|
| **S0a** | solo Claude, fresh session, PROBLEM.md only, 60 min cap | baseline point 1; base tree for S2 |
| **S0b** | solo Claude, second fresh session, same conditions | baseline point 2 → the noise floor; doubles as the duel's Claude arm |
| **G** | solo Grok, same conditions | the duel's Grok arm (not a graded baseline of its own) |
| **S2′** | Grok attack on frozen S0a under product constraints → Claude fix | the attack tier, tested as it would ship |
| **Duel** | cross-attack S0b↔G, each author fixes own tree → **DC**, **DG**; winner **W** | the thing 0.4.0 would actually build |
| *(S1a′)* | *conditional*: Claude self-attack on frozen S0a → fix, behavioral score only | attribution guard; runs ONLY if the verdict reaches LICENSE-ATTACK-ONLY (§5 rule 2). Run-1 priced the generic-second-pass effect at zero signal under saturation; with headroom it must be re-priced before an attack license is granted, but not paid for otherwise. |

Paired structure as in run-1: S2′ shares base S0a; the duel reuses S0b and G. Three
generative solves in parallel, one attack+fix, one cross-attack. Grok solo is never graded
against Claude solo — "which model is better" is not the question.

Kill remains cheap (6 units, one session); any LICENSE is provisional until it replicates.
The replication problem domain is named now so it cannot be tuned later: **P3 =
zero-dependency streaming multipart/form-data parser with backpressure and chunk-boundary
split correctness** — far from async queues, far from calendars, still library-shaped.

## 2. Problem and referee (frozen)

- **PROBLEM.md** — ZonedRecurrence: timezone-aware recurring-event expansion (RRULE subset)
  with DST-boundary correctness. TypeScript/Bun, zero runtime deps (Intl allowed), library
  not service, one session — same shape as P1 so the harness carries over. Non-house-style:
  no services, no layers, no async machinery; the hard part is civil-calendar × timezone
  interaction. The spec is fully normative (22 numbered rules) and deliberately diverges
  from RFC 5545 folklore in marked places (count-before-exDates, scheduled-wall exDate
  matching, skip-not-clamp, start-not-auto-included, Monday-week parity) — every trap is IN
  THE TEXT; points are lost to implementation difficulty and folklore pattern-matching,
  never to hidden requirements.
- **hidden/score.ts** — 25 checks, 100 points: 36 fundamentals / 64 interactions. Because
  `expandBetween` is synchronous, each check runs in a subprocess with a hard 3s kill (a
  sync hang scores 0 for that check only — run-1's Promise.race cap cannot preempt sync
  loops). Suite literals were derived from direct `Intl` probes and independent date
  arithmetic, then cross-validated against the reference — not generated from it.
- **hidden/reference/src/recur.ts** — reference implementation, scores **100/100**.
- **hidden/foil/src/recur.ts** — calibration foil, scores **73/100** (§3).

## 3. Calibration — why this suite cannot saturate the way P1 did

**Empirical anchors (both runs recorded above):** reference = 100/100; foil = 73/100.

The foil is not a strawman: it is the reference with four degradations, each a documented
real-library failure mode a competent one-session solver plausibly commits:

1. *"Guess offset, refine once"* wall→instant resolution (no gap/overlap candidate
   enumeration) — fails B1 (NY gap, 6 pts) while passing Sydney/Lord Howe/overlap by
   coincidence of offset sign and transition hour.
2. *count refilled after exDates* (RFC-folklore) — fails A7, B12, and B11's count
   interaction (12 pts).
3. *Weeks anchored on start's date* instead of Monday-based calendar weeks — fails B4 (5).
4. *Day-31 clamps to month end* (Luxon/cron behavior) — fails B5 (4).

**Why a strong solo solve lands ~70-88, not 100:** the 64 interaction points span three
ORTHOGONAL trap families — (i) zone resolution: gap policy, overlap direction, 30-minute
zone, southern-hemisphere dates, until-at-ambiguous-instant (~23 pts); (ii) calendrical
selection: week-parity anchor, skip-vs-clamp, negative/ordinal/5th selectors, leap-year
skip (~21 pts); (iii) set semantics: count-before-exDates, scheduled-wall matching,
exact-match, window/format edges (~20 pts). Failing any family is independent of the
others, so scores spread instead of clustering at 100 — and partial competence WITHIN the
resolver family earns partial credit (the foil's naive resolver still passes 4 of the 8
DST checks), so the distribution is not bimodal either. Missing just two family-level
decisions costs 8-15 points. Getting all three families fully right in 60 minutes requires
reading all 22 rules against folklore priors and writing a candidate-enumerating resolver
few first passes produce. If a solo arm nonetheless maxes the suite, rule 0 below converts
that into NO-TEST rather than a false verdict — saturation can no longer masquerade as KILL.

## 4. Run rules (integrity — violating any one voids the run it touches)

1. **Isolation.** Every generative arm (S0a, S0b, G) runs in a fresh directory containing
   only PROBLEM.md, in a fresh session with no access to this repo, no chat history, and
   the same skill pack or none. 60-minute soft cap; whatever exists at cap ships as-is.
2. **The hidden suite never enters any arm's context.** hidden/ (suite, reference, foil) is
   opened by the referee only, after all fixing is over. Scoring = copy `hidden/score.ts`
   into the tree root, `bun score.ts`, once per final tree; the JSON line is the record.
3. **Product constraints on every Grok involvement** (S2 and cross-attack): read-only grip
   on the target tree; every finding = `findings/NN.md` + a runnable `findings/NN.repro.ts`
   that exits non-zero against the current tree while citing the PROBLEM.md rule it
   violates; a finding whose repro does not run or does not fail is discarded without
   discussion; max 8 findings per attack.
4. **Symmetric budgets.** Every attack uses the identical format, finding cap, and a
   25-minute fix pass. Fixes may address submitted findings only — no opportunistic
   refactoring. The conditional S1a′, if triggered, uses these exact budgets.
5. **Exchange law.** Between models: problem bytes, trees, finding files, scores. No prose
   hops — no captain paraphrasing "Grok said…". Duel fixes: each author fixes its OWN tree
   from the opponent's findings.
6. **Instrumentation is mandatory** (THROUGHPUT.md §1): timing.csv row per phase,
   interventions.csv row per human touch, from kickoff to freeze, for every arm. An
   unlogged intervention discovered later voids the arm it touched.
7. **Order of operations.** All behavioral scoring and the sealed anonymization happen
   BEFORE the grader opens any tree; all six D-scores per tree are written before unsealing
   the mapping. Blindness is best-effort/same-day (RUBRIC.md); record it as such.
8. **Grading authority.** License-binding D grades are the owner's; if delegated, the
   neutral non-arm grader's grid governs (RUBRIC.md). Pre-registered to close run-1's
   panel-average ambiguity.

## 5. The verdict rule (pre-registered, computable, top-to-bottom)

Let `B(x)` = hidden-suite total (0-100), `D(x)` = rubric total (0-24), and
`throughputClears(path)` as defined in THROUGHPUT.md §3 (T1 ≤ 2.0 interventions per
accepted finding; T2 ≤ 12/16 marginal interventions attack/duel; T3 ≤ 1.5x/2.0x solo
wall-clock; T4 no crater event).

```
S0̄_B = (B(S0a) + B(S0b)) / 2
N_B  = max(|B(S0a) − B(S0b)|, 6)     # behavioral noise floor (6 ≈ two interaction checks)
D̄0  = (D(S0a) + D(S0b)) / 2
N_D  = 3                              # design noise floor (single-grader, 0-24 scale)

Rule 0 — referee validity (the anti-run-1 guard):
  if S0̄_B > 92 → NO-TEST (suite saturated again)     — neither kill nor license;
  if S0̄_B < 55 → NO-TEST (problem too hard/underspecified) — redesign referee, rerun.

W = duel winner: higher B among {DC, DG}; tie → higher D; tie again → no winner
    (a winnerless duel cannot license).

duelQuality   = [B(W) ≥ S0̄_B + N_B  AND  D(W) ≥ D̄0 − N_D]
             OR [D(W) ≥ D̄0 + N_D   AND  B(W) ≥ S0̄_B − N_B]
attackQuality = [B(S2′) − B(S0a) ≥ N_B  AND  D(S2′) ≥ D(S0a) − N_D]
duelTP        = throughputClears(duel)
attackTP      = throughputClears(attack)
```

First matching line is the verdict:

1. `duelQuality AND duelTP AND (B(W) ≥ B(S2′) OR NOT (attackQuality AND attackTP))`
   → **LICENSE-DUEL** (provisional: must replicate on P3 with this identical design, and
   the owner-bound grade must stand, before any 0.4.0 code).
2. `attackQuality AND attackTP` → run the conditional **S1a′** (identical budgets, rule 4.4).
   If `B(S2′) > B(S1a′)` → **LICENSE-ATTACK-ONLY** (provisional: P3 replication).
   Else → **KILL (generic-second-pass)**: what helped was a structured review pass, so any
   shipped review surface is model-agnostic with no Grok quality claim.
3. `(duelQuality AND NOT duelTP) OR (attackQuality AND NOT attackTP)`
   → **QUALITY-WITHOUT-AUTONOMY**: the quality effect is real but the autonomous machinery
   is dead — kill 0.4.0's autonomous surface; at most a human-supervised review tier may
   cite the effect. (This is the outcome run-1's approval counts foreshadowed.)
4. otherwise → **KILL**: ship the 0.3.0 throughput/reliability floor, zero quality claims;
   the Grok-4.5 quality thesis is recorded dead for this scope.

Rule 1's guard makes the duel beat the attack tier only when the attack tier is itself
licensable — a duel need not outscore an attack that cannot ship. Rule 2's S1a′ guard keeps
Grok from taking credit for what Claude's own second look achieves under identical budgets.
A KILL on P2 is final for the grok-4.5 snapshot and this scope; a different peer model is a
new hypothesis, run from scratch.

**Off the bar, on the record:** tokens/cost per arm, discarded-vs-accepted finding counts
per attack (the ambient tier's precision number), per-phase intervention histograms.

## 6. Runbook (one session, ≈ 3.5-4.5 h)

1. Record this directory's hashes (§7) — the freeze. Prepare `results/timing.csv` and
   `results/interventions.csv` (headers only).
2. Parallel, timers on: S0a, S0b (fresh Claude sessions), G (Grok worker) — 60 min. Freeze
   all three trees (record SHAs; stop timers).
3. Parallel, timers on: S2 attack (Grok, read-only grip on S0a) then S2′ fix (Claude, on a
   copy of S0a, 25 min). Freeze S2′.
4. Duel, timers on: Grok attacks S0b (read-only) while Claude attacks G; each author fixes
   its OWN copy, 25 min — freeze DC, DG.
5. Score: copy `hidden/score.ts` into each of S0a, S0b, S2′, DC, DG; run once each; record
   the JSON lines. Apply §5 rule 0 (validity window) BEFORE anonymization; if NO-TEST, stop
   here and record it.
6. Anonymize the five D-graded trees (`./anonymize.sh graded/ …`); grade per RUBRIC.md;
   unseal.
7. Compute THROUGHPUT.md §2-3 from the CSVs and finding counts.
8. Compute §5 top-to-bottom. If it reaches rule 2, run S1a′ now (same budgets), score it,
   finish rule 2. Write the verdict and all numbers into `results/VERDICT.md`. If LICENSE:
   schedule the P3 replication before any 0.4.0 code.

## 7. Freeze hashes (sha256)

```
aa0cccd642d6edd566a991fbfb2e1222d6732fa8db2f737e62b0db84722e1ae8  PROBLEM.md
9ed526d7ae1b8d30a295dda491aed5ef8aedf6f230f843ab6975bc026f5b5fc5  RUBRIC.md
c413c04b367a296d28fa422b54eca24578bab49adf198cfa7299f022bb329fec  THROUGHPUT.md
d74a231d9abcc26f8291f1eab10873a9102e9f1a5325e42d71fd2950954c53c5  anonymize.sh
d6346056f3643ba6dc039b4328be02324ff278928d0318e5ec8309b84cfdbbee  hidden/score.ts
687944c844dff3cee859f0d7c64a80aebc99fd179416da59a4712d947d55cf85  hidden/reference/src/recur.ts
037a43c158486fd9e2196d9a88fa7a7f6c79fe99e73eb57e36281de04d724a85  hidden/foil/src/recur.ts
```
