# 0.3.0 flaw register

Every flaw named across the three-family cross-examination (Claude, Fable, Grok),
in our work: the plan, the benchmark method, and the plugin. Ranked within group.
Each gets an owner/fix in PLAN-0.3.0.md or the backlog.

## A. Plugin / architecture (fix as 0.3.0 prerequisites)

| # | Flaw | Fix |
|---|------|-----|
| A1 | **Delegation is a throughput primitive sold as a quality primitive.** Puts the weaker generator on the min-critical-path. | Two lanes; demote `/grok:work` claims (PLAN §2–3). |
| A2 | **`paused` has no timeout (F1)** — a turn that ends without DONE parks forever, silently. Caused a 36-min stall. | timeout + one auto-nudge, symmetric to permissions (PLAN §5). |
| A3 | **No design-conformance enforcement.** "Documented trade-off" launders a step-down; reviewer is the design author (weakest review). | deviation = blocking NEED_INPUT; acceptance-tests-before-spawn; author-only merge (PLAN §3–4). |
| A4 | **Permission drip taxes exactly the arm it enables.** Every test run hits the veto gate → ~7–8 interventions, 5× wall-clock. | auto-allow read-only test/git under read/advise whitelist (PLAN §5). |
| A5 | **No typed Finding in the broker.** "unreproduced discarded" is a skill wish, not a system rule. | first-class `Finding{id,class,repro,status}` (PLAN §5). |
| A6 | **No `wait --actionable` (F3)** → captain hand-rolls pollers that **leak** (F4, 5 stale loops). | `wait --actionable` / `--any` (PLAN §5). |
| A7 | **0007 RESULT-strips-prose** would kill prose-borne findings. | keep the retention fix; findings as files. |
| A8 | **Mixed fleets (attack + work) reintroduce F3/F4 wake spam.** | fleet-aware wait; orchestration spec. |
| A9 | **Product identity risk.** Users may have bought labor-offload, not a bug-bash. | keep both lanes; don't rename flagship before the kill experiment. |

## B. The 0.3.0 plan itself (caught in cross-exam, already folded in)

| # | Flaw | Resolution in plan |
|---|------|--------------------|
| B1 | **"Adversary with only reproducible findings" censors architecture/taste critique** — the exact axis that decided the benchmark. | REPRO **+ JUDGMENT + GAP-vs-spec** classes (PLAN §3). |
| B2 | **"Never below solo by construction" is false;** review can worsen the artifact. | mechanical merge gates on frozen suite S + author-only apply (PLAN §4). |
| B3 | **Demoting all generation throws away decorrelated generative strength** (Grok's mutex stock beat Claude's). | keep Counter + Specialize topologies (PLAN §2). |
| B4 | **`/grok:counter` (blind parallel solve) was made optional** — but it's the only generative-max topology that can beat solo on design. | promoted to co-flagship (PLAN §3). |
| B5 | **Goodhart on the adversary:** discard-unreproduced → farm nits, suppress structural findings. | precision metrics (accept/repro rate), not volume; JUDGMENT class. |
| B6 | **Decorrelation assumed as a law;** same cutoffs → correlated architecture failures. | caveat §7; measure, don't assume. |
| B7 | **Model non-stationarity** — hard-coding demotion is premature on one snapshot. | role assignment is a measured setting; re-run kill experiment per model (§7). |
| B8 | **Who writes hidden suite S?** author-shaped or leakage risk. | frozen before any arm by a non-authoring party (§6). |
| B9 | **`diff-audit` via string-grep** false-pos on renames / false-neg on behavior. | executable/traceability, folded into attack GAP mode (§3). |

## C. Benchmark method (fix in harness v2 before re-benchmarking)

| # | Flaw |
|---|------|
| C1 | **N=1 problem, N=1 run** — LLM variance ±5; magnitude unreliable, ranking-on-other-problems unknown. |
| C2 | **No Claude+Claude self-review control (S1)** → can't separate "Grok helps" from "any second pass helps." |
| C3 | **No Claude+Claude handoff control** → can't attribute the loss to *Grok* vs to *handoff itself*. |
| C4 | **Thesis-saving arm never run** — "Claude solo + adversarial review + fix" (the whole 0.3.0 idea) was untested. |
| C5 | **Rubric may be Claude-shaped** — it penalized the co-work for being *concise*; process-aesthetic weights favor long DESIGN. |
| C6 | **Self-authored tests prove nothing** (each author wrote their own; all green). Need a hidden objective suite. |
| C7 | **Graded by reading, not executing** — "exactly-once under concurrency" needs a real concurrent property harness as referee. |
| C8 | **Unbalanced safety arms** — solo Claude unsupervised/unsandboxed; Grok behind a dripping veto gate. Gate both or leash both. |
| C9 | **Non-blind co-work** — not process-matched to the blind solo arms. |
| C10 | **Cost absent from the ranking** — solo Claude dominated cost *and* quality; quality-per-dollar should be a ranking axis. |
| C11 | **Stall contamination** — 36-min stall likely depressed co-work review depth (captain fatigue); confounds the causal claim. |
| C12 | **Regime coverage zero** — only greenfield/single-context/house-style hexagonal; delegation's plausible wins untested. |
| C13 | **Exam may be Claude-shaped** — hexagonal DDD is this workspace's `clean-ddd-hexagonal` house style; Grok may be weaker on *this class*, not coding generally. |

## D. Surviving holes in the synthesized plan (from the final attack ON the plan)

These survived the first cross-exam and were caught by dogfooding `/grok:attack` on
PLAN-0.3.0 itself. All now folded into the plan (§4/§6/§8).

| # | Surviving hole | Fix (in plan) |
|---|----------------|---------------|
| D1 | **JUDGMENT × merge-gate-on-S don't compose** — the floor gated on S, but architecture (JUDGMENT) is off S by definition; floored the wrong critiques. Schema's "unreproduced discarded" also contradicts JUDGMENT. | §4 per-class floor; "discard" applies to REPRO only; JUDGMENT needs ACCEPT + design-delta + counterfactual. |
| D2 | **Hidden suite S still measures near-test correctness, not architecture** — if A0 saturates S, experiment only powered for "doesn't hurt." | §6 two scores S_beh + binary S_arch; saturation rule; ≥1 non-hexagonal problem. |
| D3 | **S1 (self-attack) doesn't close the handoff-attribution question (C3).** | §6 add S1b (Claude→Claude handoff). |
| D4 | **Sequencing builds infrastructure before the existence proof.** | §8 inverted: cheap manual paper-kill FIRST; F1–F4 parallel/standalone. |
| D5 | **Specialize (Grok generates a slice) vs author-only-merge is contradictory;** the "mutex was better" win is one unreplicated anecdote. | §8 deferred out of 0.3.0 scope. |
| D6 | **Verification-asymmetry ("checking ≪ generating") is false for JUDGMENT** — category error to call it a max-topology. | §4 JUDGMENT explicitly not S-gated; principle restated per class. |
| D7 | **Counter's prose merge brief re-enacts the lossy channel;** GAP-vs-SPEC freezes a lossy DESIGN. | §8 merge brief must be artifact-backed; pair GAP with attack-on-DESIGN pre-impl. |
| D8 | **Unresolved product-identity fork:** attack (behavioral) vs counter (architecture) sold as co-equal "quality." | §8 identity decided: attack = bug quality, counter = design quality. |

## E. Survived the FINAL attack (fresh decorrelated adversary on plan+FLAWS+recommendation)

A fourth-round Grok adversary (read grip, grok-4.5/high) attacked the *whole synthesized
position including the paper-kill recommendation itself*. These landed — none were in A–D.
This is the thesis dogfooding itself: a decorrelated pass found holes 32 flaws + 3 families missed.

| # | Surviving hole | Fix |
|---|----------------|-----|
| E1 | **Paper-kill measures the wrong axis.** P1's wound was *design* (silent step-down, lossy DESIGN). S0/S1a/S2 tests *attack* (behavioral). Coupling "build the quality surface" to S2 alone false-licenses: Grok finds one concurrency bug → S_beh moves → we ship attack infra for a wound we never measured. | **S3 (counter) is mandatory in the paper-kill**, not deferred. Architecture-thesis license gated on `S3 > max(S0,S2)` on S_arch; attack is a *separate, cheaper* lint gate. |
| E2 | **Manual paper-kill ≠ the product.** No broker, no permission drip, no discard, no schema → S2 gets a cleaner process than shipped `/grok:attack` ever will. A false license that won't transfer. | Add a **product-constraint arm**: shell-enforce REPRO-only auto-run, findings-as-files, unreproduced discarded, fix-budget cap, JUDGMENT default-REJECT on timeout. License only if S2>S0 *under those constraints*. |
| E3 | **N=1×1 with a hard inequality decides a constitution.** Run variance is ±5; one lucky S_arch checkbox flips the whole build/don't-build call. | **≥2 independent S0 runs** to estimate σ; license/kill only if `|S2−S0| > 2σ`. If we won't pay 2×S0, we don't get a release constitution. |
| E4 | **JUDGMENT accept-rate is circular.** Default-REJECT + captain-is-A0-author → accept≈0 is the *policy*, then we read "≈0 → package as lint" as a *measurement*. The censor reports the censor worked. | Forced ACCEPT/REJECT-with-rationale quota inside a time box, **or a third-party acceptor** who didn't author A0. |
| E5 | **`min()/max()` is a one-point fit, not a law.** 85.5 between 80.5 and 93.5 is equally consistent with handoff-tax + stall + non-blind + Claude-shaped rubric. The real dominating variable may be **I(channel)** (invisible brief loss), not model strength. | Run **S1b (Claude→Claude handoff)** to disambiguate: if S1b ≈ co-work ≪ S0, the lesson is "don't hand off," *not* "Grok should attack." Treat min/max as hypothesis, not foundation. |
| E6 | **Author-only merge hard-codes Claude as the ceiling** — so you *cannot beat solo on architecture by construction*, only match it or add bugs Claude accepts. Directly contradicts the plan's "raise the ceiling" goal. | Either (a) **honestly drop the ceiling-raise claim for architecture** (attack can only *defend* the solo ceiling, not exceed it), or (b) change merge topology to **executable selection**: both models emit full trees, winner chosen by S_beh + blind third-party S_arch + scripted integration — captain is harness, not aesthetic monarch. |
| E7 | **If S1a ≥ S2, this isn't a Grok product.** The value is "structured second pass," and Grok is one backend. Branding identity on Grok quality is then wrong. | Default post-null identity = **model-agnostic `/review:attack`** with pluggable backend; Grok is a plugin, not the thesis. |
| E8 | **The flagship may be the wrong layer.** Deepest P1 mechanism was the lossy invisible channel, not "Grok weaker." Fix the *channel* (executable design contracts + design-diff gate, works solo AND multi-model) and delegation-for-throughput becomes safe again. | Consider flagship = **executable design contract + GAP-vs-SPEC gate**; attack/counter are optional consumers of it. Quality floor attaches to the contract, not to "second-model topology." |

**Meta-flaw (the real one, named by the final attack):** the *entire* deliberation is
selection-biased toward "better multi-model topology." Every participant — Claude, Grok,
Fable — is a model whose job is to improve this plugin, so the **null product** ("stop
selling multi-model *quality*; be a thin throughput+reliability layer") only ever appears as
a post-failure pivot, never as the *prior-favored* hypothesis given that collaboration
*subtracted* on P1. Experimenter = designer = scorer = acceptor; Claude-as-bottleneck is
treated as sacred; a lab exam is treated as a proxy for brownfield PR quality.

**The two corrections that actually matter, in order:**
1. **Write a one-page null-product PRD** (F1–F4 reliability + honest throughput, *zero*
   quality claims) and require the quality arms to beat *that* on a **real-repo user task**,
   not just beat Claude-solo on a lab problem. Ship F1–F4 now — it needs no thesis.
2. **Only then** run the corrected paper-kill — now **S0(×2)/S1a/S1b/S2/S3 with a
   product-constraint arm, forced JUDGMENT quota, and an independent third-party re-grade** —
   BEFORE writing any 0.3.0 quality code. The version in §8 (S0/S1a/S2, manual, N=1) was
   itself a false-license machine.
