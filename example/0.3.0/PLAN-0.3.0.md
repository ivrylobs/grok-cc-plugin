# 0.3.0 — "make the second model raise the ceiling, or don't call it quality"

Synthesized from a three-family cross-examination: Claude (thesis + synthesis),
Fable 5 (composition law + missing controls), Grok (the attack that fixed it).
Evidence: benchmark P1 — solo Claude **93.5**, co-work **85.5**, solo Grok **80.5**.
The collaboration *subtracted* capability. This plan says why, and what replaces it.

---

## 1. The finding (why v0.2 collaboration lost)

**Serial handoff composes by `min()`; the weaker generator on the critical path,
behind a lossy brief, caps the result at a blend — never a max.** Co-work landed
at 85.5, between Grok-solo (80.5) and Claude-solo (93.5): a blend, exactly as the
mechanism predicts. Three sub-causes:
- **min-composition:** output bounded by what survives design→brief→impl.
- **lossy invisible channel:** hundreds of latent invariants never reach DESIGN.md;
  the implementer silently resolves ambiguity toward its own weaker priors (the
  dropped pharmacy check). Nothing in the system knows what didn't survive.
- **verification-shaped review:** review checks what's there, not what's missing; a
  "documented trade-off" is a review exploit that launders a step-down.

**The one thing that worked was accidental:** the dual-grading pass, where two
model families *verified in parallel* and caught **different** real bugs. That is
the only `max()`-topology in the whole experiment.

**Grok's correction (accepted):** the law is `min/max` only for *homogeneous*
quality. With *heterogeneous* strengths, a weaker-on-average model can raise a
*component* ceiling on a slice where it is stronger or differently-biased (Grok's
mutex stock adapter beat Claude's). So the lesson is **not** "never let the weaker
model generate" — it is **"never let it silently generate on the min-path."**

## 2. The principle

> A second model is worth its cost only in a **max-topology**: parallel and
> decorrelated, off the min-critical-path, where checking is cheaper than
> generating. Put it anywhere else and it subtracts.

Concretely, three legitimate max-topologies, and one demoted min-topology:

| Topology | Shape | When it's additive |
|----------|-------|--------------------|
| **Attack** | Claude authors; Grok red-teams; Claude merges gated | verification asymmetry + decorrelated review |
| **Counter** | Both solve blind in parallel; Claude cherry-picks the best of each | decorrelated *generation*; the only way to beat solo on *design* |
| **Specialize** | Grok generates a bounded slice it's differentially good at (concurrency harnesses, adversarial input/property tests); Claude merges as candidate-not-license | heterogeneous strength on a slice |
| **Delegate (demoted)** | Grok does spec-clamped/mechanical/parallel work | throughput & cost only — **never claimed as quality** |

## 3. Flagship surfaces (a pair, not a replacement)

- **`/grok:attack <path|diff>`** — primary *quality* surface. `read` grip. Emits a
  typed **finding stream**, three classes:
  - `REPRO` — ships a runnable failing test / exact command + expected-vs-actual;
    captain auto-runs; fix→pass or discard.
  - `JUDGMENT` — design/taste/architecture (the class a repro-only filter would
    censor: "should be a port", "this is two aggregates", "anemic domain"). Requires
    explicit **ACCEPT/REJECT with one-line rationale**; default REJECT on timeout.
  - `GAP-vs-SPEC` — a delta between a stated design and the implementation (targets
    the exact v0.2 failure mode: the silent step-down).
- **`/grok:counter <problem>`** — primary *generative-max* surface. Grok solves the
  problem **blind, in an isolated worktree**, no shared design; then a cross-exam
  produces a **merge brief** (structure from A, tests/invariants from B) that Claude
  integrates. This is the topology the first draft wrongly made "optional" — it is
  the only one that can beat solo Claude on architecture.
- **`/grok:work`** — kept, **demoted in claims**: parallel/mechanical/spec-clamped
  tasks, `grok-composer-2.5-fast`, leash/advise, with a **mandatory design-diff gate**
  whenever a DESIGN exists (any deviation is a blocking `NEED_INPUT`, never a code
  comment). Pitch: hands and throughput, *not* brains. Stop selling quality here.
- `/grok:diff-audit` folds into `/grok:attack` as its `GAP-vs-SPEC` mode — not a
  separate brand; needs executable/traceability checks, not string-grep.

## 4. The floor — **per finding class** (final-attack fix: the one floor didn't compose)

"By construction" was aspiration; a single S-gate was *incoherent* — JUDGMENT is off
suite S by definition, so gating on S floored the wrong critiques. The floor is now
**split by class**, and the schema is made honest:

| Class | Floor mechanism |
|-------|-----------------|
| **REPRO** | Auto-run the repro; merge the fix only if behavioral suite `S_beh` and A0's tests **don't regress**; the fix must turn *that* repro green (no "fix by deleting the assert"). **"Unreproduced discarded" applies to this class only.** |
| **GAP-vs-SPEC** | Executable/traceability check against the frozen DESIGN; same `S_beh` non-regression gate. |
| **JUDGMENT** (architecture/taste) | **Not** S-gated (checking a design opinion costs as much as making it — no verification asymmetry here). Requires: explicit **ACCEPT + rationale + a design-delta record** (what invariant/structure changes) + a **counterfactual check** — either a small invariant suite authored *as part of the accept* and frozen into `S_beh`, or a second-party (S1-style) reject before apply. Default REJECT on timeout. |

Plus, all classes: **author-only merge** (Grok never lands code; only Claude applies),
**fix budget / blast-radius cap** (exceed → `NEED_INPUT`, no scar-tissue thrash),
**revert bar** (a fix that fails A0's tests auto-reverts; attack tests are additive),
**no documented-trade-off escape** (accepting a gap needs a user-visible record).

**Honest limit, stated plainly:** we get a **mechanical floor on behavior** (`S_beh` +
A0 tests). **Architecture is a logged human/captain decision, not a mechanical floor.**
We do not claim "never below solo" on taste — and the kill experiment (§6) measures
architecture separately precisely because the floor can't guarantee it.

## 5. Prerequisites — broker/skill hardening (NOT "plus", these gate everything)

The benchmark proved these block any second-model topology; ship them **first**:
- **F1:** `paused` gets a timeout + one auto-nudge ("continue to DONE") before
  parking, symmetric to the permission timeout. No more silent 36-min stalls.
- **F3/F4:** `grokctl wait --actionable` (returns only on permission/paused/blocked/
  done, not checkpoints) and `wait <ids…> --any` (one wait for a fleet) — kills the
  captain's leaking hand-rolled pollers.
- **Finding schema:** a first-class `Finding{id, class, repro_path, status}` in the
  broker + typed inbox item; "unreproduced discarded" must be a system rule, not a
  skill aspiration.
- **0007 retention:** attack findings often live in prose; the RESULT-strips-prose
  bug must stay fixed or the attack primitive is dead on arrival.
- **Permission ergonomics:** `read`/`advise` must auto-allow read-only test runs and
  read-only git for attack workers, or "runnable repro" collapses to captain-side
  babysitting (the P1 cost sink). This widens a boundary — gate it to the `read`
  grip's already-audited whitelist.

## 6. The kill experiment (release gate — pre-registered)

A product constitution cannot rest on N=1. Two scores are pre-registered (final-attack
fix — one score measured only near-test correctness, not the deciding axis):
- **`S_beh`** — hidden behavioral/property suite (concurrency harness, invariants, API
  contracts). The merge gate uses this.
- **`S_arch`** — a frozen **binary architecture checklist**, evidence-linked to file
  paths (ports at the boundary? aggregate boundaries? no anemic domain? explicit
  consistency story?) — *not* an essay rubric. Graded **blind to arm label**.

Both written **before any arm by a party that never authors a solution.** **Saturation
rule:** if `S_beh(A0)` ceilings (e.g. ≥95), that problem is invalid for quality ranking
(only regression/cost count) — pick/harden problems until A0 doesn't ceiling-out. **≥1
of the ≥3 problems must be OUTSIDE house-style hexagonal DDD** (else the exam is
Claude-shaped and the result is rigged).

| Arm | Process | Isolates |
|-----|---------|----------|
| **S0** | Claude solo. Freeze `A0`. | baseline |
| **S1a** | Claude + **Claude self-attack**, process-matched to S2. | "any review pass" vs Grok |
| **S1b** | **Claude→Claude handoff** (brief → 2nd Claude implements). | attributes the v0.2 loss to *handoff* vs *Grok* |
| **S2** | Claude + **Grok `/grok:attack`**, Claude-only fixes, gated. | the attack thesis |
| **S3** (high-value) | `/grok:counter` blind-solve + artifact-backed cherry-pick. | generative max |

Pre-registered verdicts (on **both** S_beh and S_arch):
- `S2 ≤ S0` → attack thesis **dead** for quality; keep as opt-in lint.
- `S2 > S0` but `S1a ≥ S2` → value is "a second pass," **not Grok**; sell review.
- `S2 > S0` **and** `S2 > S1a` → multi-model attack **lives**; promote it.
- only `S_beh` moves, not `S_arch` → attack is a **bug-bash lint**, not architecture
  quality; `/grok:counter` (not attack) is the design-quality flagship.
- `S3 > max(S0, S2)` → flagship is **counter**, not attack.
- **Cost gate:** a quality-winning arm that loses on quality-per-dollar vs S0 is a
  high-spend mode, not the default UX.
- **JUDGMENT accept-rate** is itself a kill metric: if ≈0, attack cannot deliver
  architecture value — package it as behavioral lint and say so.

**The pivot is pre-written, not a one-liner:** if `S1a ≥ S2`, the honest product is
"throughput + an optional self-review skill; Grok is not in the quality critical path."

## 7. Honest caveats we will not paper over

- **Quality is regime-dependent, not a scalar.** We benchmarked the *maximal-solo-
  advantage* regime (greenfield, single context window, house-style hexagonal DDD —
  possibly a Claude-shaped exam). Delegation's real wins (parallel throughput, cost,
  tasks exceeding one context) were never tested. Don't over-generalize "collab
  subtracts."
- **Decorrelation is partial.** Same cutoffs, same TS idioms → correlated
  *architecture* failures even when *bugs* decorrelate. Don't assume Claude≠Grok ⇒
  independent errors.
- **Model non-stationarity.** The 80.5/93.5 gap is one snapshot; a future
  grok-composer could invert it. Don't hard-code demotion into UX — make role
  assignment a measured setting, re-run the kill experiment per model.
- **The measurement was confounded** by the 36-min stall (captain fatigue → shallower
  review) and a non-blind co-work arm. Harness v2 fixes both.

## 8. Sequence — **existence proof before infrastructure** (final-attack fix)

The first draft built the cathedral (broker schema, skills) before proving the thesis
that already failed once in the wild. Inverted:

1. **Cheap paper kill FIRST.** 1–2 non-ceiling problems (≥1 non-hexagonal), frozen
   `S_beh` + binary `S_arch`, arms **S0 / S1a / S2**, **manual** red-team and **manual**
   merge — *no new broker features, no new skills*. Captain runs repros and applies
   fixes by hand. Log JUDGMENT accept-rate. Pre-registered verdicts from §6.
2. **Gate everything on step 1.** If `S2 ≤ S1a` or `S2 ≤ S0` → the multi-model *quality*
   thesis is dead; ship the honest product (throughput lane + optional self-review) and
   **do not build §5's schema or the attack skill for quality**. If `S2 > S1a` and
   `> S0` on both scores → proceed.
3. **In parallel, regardless of the thesis:** ship F1–F4 + permission ergonomics as
   **standalone reliability wins** (they help every lane and were the real cost sink).
   These are *not* gated on the thesis; they're just correct.
4. **Only if step 1 survives:** build `/grok:attack` (+ `/grok:counter`) + the Finding
   schema, then the full **≥3×≥2** harness as the release constitution before any
   "quality-additive" marketing.

**Deferred out of 0.3.0 scope** (final-attack: unresolved contradictions, don't ship
half-baked): the **Specialize** topology (Grok generates a slice vs author-only-merge is
unresolved; the "mutex stock was better" win is one unreplicated anecdote — revisit with
its own kill arm later). And the **attack-vs-counter identity is decided now:**
`/grok:attack` is **behavioral/bug quality** (REPRO-led); `/grok:counter` is
**design/architecture quality**. They are not co-equal "quality" surfaces — packaging
must say which is which, or we re-sell a surface that can't deliver the win.

_Full flaw register (32 items across plan/method/plugin) in FLAWS.md._
