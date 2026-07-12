# Paper-kill protocol — does Grok beat solo Claude enough to license 0.4.0?

The cheap, manual experiment that licenses or kills the quality thesis **before** a line of
duel code is written. It is the whole hinge of the 0.3.0→0.4.0 decision (SHIP-0.3.0 §7,
FLAWS §E). If it comes back negative, 0.3.0-floor is the honest ship and the Grok-4.5 quality
thesis is recorded dead for this scope.

## The question

Does adding Grok — as an **adversary** (S2: attack Claude's work) or as a **blind-parallel
duel arm** (S3: solve alongside, adjudicate) — beat solo Claude by enough to justify building
the 0.4.0 quality surface? Or is the honest product the reliable throughput floor?

## Why this experiment is trustworthy (the non-negotiables)

The final attack's meta-flaw was: experimenter = designer = scorer = acceptor. Every rule
below exists to break that.

1. **Pre-registered.** The rules (arms, thresholds, license/kill, date) are committed in
   `PRE-REGISTRATION.md` and git-timestamped **before any problem is chosen**. Problem choice
   is not a degree of freedom you get to tune toward a result.
2. **Independent authoring.** The 2 problems + the hidden behavioral suite (S_beh) + the
   architecture contract (S_arch) are authored by a **non-arm** party. Claude and Grok are the
   arms, so neither writes them — else both trees are shaped to the author.
3. **Human blind grade for design.** S_arch (the design axis — the axis P1 actually lost on)
   is graded by a **human**, blind, on anonymized/label-stripped trees. LLM grades are
   advisory only, **never license-binding** — no model judges the axis it competes on.
4. **Product-constrained.** S2/S3 run under the constraints the *shipped* product would have —
   read-grip, repro-gated findings, unreproduced discarded, a fix-budget cap — not a clean
   manual demo. A win under a cleaner-than-production process is a false license.
5. **Two scores, never one.** S_beh (executable correctness) and S_arch (blind design) are
   reported separately. The min()/max() "law" was a one-point fit; we measure both axes.
6. **Autonomy is measured.** Intervention count (human touches from kickoff to result) is a
   first-class metric — "autonomous" is proven, not assumed.
7. **N.** 2 problems, ≥1 **non-hexagonal / non-house-style / non-ceiling**. S0 run **twice**
   per problem to get the noise floor σ.

## Roles

| Role | Who | Does |
|------|-----|------|
| **Third party** (non-arm) | Fable 5 (diff. family from both arms) + owner approval, or owner-supplied | Author P1, P2 + frozen hidden S_beh + S_arch contract |
| **Blind grader** (human) | Owner (or a trusted engineer) | Grade S_arch on anonymized trees — license-binding |
| **Arm A** | Claude | solo / author / duel arm A |
| **Arm B** | Grok (grok-4.5) | adversary / duel arm B |
| **Owner** | you | sign the failure clause, set the drop-dead date, do the blind S_arch grade |

## Arms (run per problem, both problems)

| Arm | What | Answers |
|-----|------|---------|
| **S0 ×2** | solo Claude, twice | baseline mean + σ (the noise floor) |
| **S1a** | solo Claude + Claude self-review + fix | does *any* second pass help? (isolates "Grok" from "a second look") |
| **S1b** | Claude→Claude handoff: one Claude writes the brief/design, a **fresh** Claude implements from it only | is the P1 loss *handoff* or *Grok*? If S1b ≈ co-work ≪ S0, it's handoff |
| **S2** | solo Claude + Grok adversarial attack (read-grip, repro-gated, unreproduced discarded, fix-budget N) + Claude applies accepted findings | does the **attack** tier beat solo? (the cheaper surface) |
| **S3** | manual duel: Claude and Grok **blind-solve in parallel**; cross-attack artifact-only (exchange-law); whole-tree winner by S_beh + blind S_arch | does the **duel** (generative-max) beat solo? (the flagship) |

## Scoring

- **S_beh** — run the frozen hidden suite; score = pass rate / points. Objective, automated.
- **S_arch** — human blind grade against the frozen contract: binary conformance items +
  a design band. Anonymized, arm labels & house-style paths stripped.
- **Logged, NOT on the license bar** — interventions, wall-clock, tokens/$.

## Verdict (pre-registered; computed, not argued)

Let `σ` = stdev of the two S0 runs (behavioral) for a problem; `S0̄` = their mean.

- **License the DUEL** (build C1/C2) **iff, on BOTH problems:**
  `S3 ≥ S0̄ + 2σ` on **at least one** axis (S_beh or S_arch) **and** `S3 ≥ S0̄ − σ` on the other.
- **License ATTACK-as-lint** (cheaper, separate surface) **iff, on both problems:**
  `S2 ≥ S0̄ + 2σ` on S_beh **and** `S2 ≥ S0̄ − σ` on S_arch.
- **KILL** (ship the floor + a `THESIS` surface) **iff** neither clears on both problems.
- **Quality-per-dollar is NOT on the bar** — solo dominates $/point by construction; putting
  it on the bar would kill the duel dishonestly. Cost is handled by routing + budget, not here.
- **Disambiguators** (reported, not license-binding): `S1a − S0̄` (any-second-pass effect);
  `S1b` vs co-work/S0 (handoff-vs-Grok attribution).

## Drop-dead

If no signed license by the pre-registered date, the ship is the 0.3.0 floor, and the
Grok-4.5 quality thesis is recorded **not licensed** for this model snapshot. A different peer
model (Codex, next-gen Grok) is a *new* hypothesis, re-run from scratch — not a re-roll of this one.

## Procedure

1. **Lock** `PRE-REGISTRATION.md` (owner signs clause + date; roles fixed). Commit. ← the gate opens here
2. Third party authors P1, P2 + frozen S_beh + S_arch contract. Commit (hashes recorded).
3. Run the arms per problem into `results/<problem>/<arm>.md` + the intervention log.
4. Owner grades S_arch blind on anonymized trees.
5. Compute the verdict against the pre-registered thresholds. Sign license-or-kill.
