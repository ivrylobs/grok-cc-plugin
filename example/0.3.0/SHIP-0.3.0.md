# grok-cc-plugin 0.3.0 — final product + ship plan

Synthesized from a 3-model decorrelated pass: Claude drafted; Grok reviewed from the
implementer/peer seat; Fable from the product/framing seat. They found complementary holes
(security/isolation vs identity/commercial) and converged on the big moves. This is the fold.

Source corpus: PLAN-0.3.0, FLAWS (A–E + meta), AMBIENT-UX, BENCHMARK-FINDINGS, COST/SCORECARD,
grok-cc-autonomy-vision.

---

## 0. What 0.3.0 IS — the invisible reviewer

**Turn on the plugin → your work gets an always-on, decorrelated second look for ~1.3×.** That
is the product identity, and it ships **in every branch of the gate below** — it monetizes the
one thing problem 1 actually proved: a decorrelated reviewer catches what the author cannot see
about his own work.

- The **duel** (2× parallel-blind solve) is the **evidence-gated top rung**, not the identity.
  It arrives *through* the paper-kill, which is more credible for a proof-first repo, not less.
- **"Autonomous peer co-worker" is the 0.4.0 identity you earn** once the duel is licensed and
  its ambient trigger is built on real data (not N=2).
- **Autonomy is already real in 0.3.0**, and we say this to the owner plainly: it lives in (1)
  the attack tier, fully ambient; and (2) *within-duel* autonomy — zero human interventions from
  spawn to report (R1–R5 make this real, §7 measures it). Ambient *triggering* of the 2× tier is
  a routing luxury on top of autonomy — and its routing table can't exist yet. Cutting it isn't
  lowering the bar; building it on N=2 would be faking the bar.
- **Front door makes one promise: catch-my-mistakes (quality).** `/grok:work` survives as an
  explicitly-labeled throughput tool with **zero quality claims** (A9/A1).

## 1. Thesis, evidence, bar

- **Evidence (problem 1):** solo-Claude 93.5, co-work 85.5, solo-Grok 80.5 — collaboration
  *subtracted*.
- **Hypothesis (NOT law — E5):** serial handoff/chat composes by `min()`; parallel selection by
  `max()` iff selection is low-noise. This is a one-point fit from N=1 confounded data; **S1b
  (Claude→Claude handoff) is the disambiguator** and must run before we call it settled. Nothing
  user-facing says "law."
- **Regime truth:** peers beat solo in bug-dense/concurrency/non-house-style/over-context/
  wall-clock-bound work; they LOSE in single-context greenfield house-style (P1's regime).
- **The bar, with teeth (all four required, not just a signature):**
  1. **Owner co-signs the failure clause** in writing.
  2. **Pre-registration:** arms, thresholds, and problem selection committed (hash/third-party)
     *before problems are seen* — else problem-choice is a new experimenter degree of freedom.
  3. **Drop-dead date:** "if no signed license by `<DATE>`, 0.3.0 ships the floor." No date = the
     gate defers forever while quality code accretes.
  4. **The kill is stated dead:** if killed, the shipped record says the *Grok-4.5-quality thesis
     for this scope is dead.* "Or a different peer model" is a legitimately **new** hypothesis
     (re-run per model, B7), not an escape hatch that lets this one never die.

## 2. The three tiers (attack is the spine)

| Tier | What | Cost | Trigger (0.3.0) | Consent |
|------|------|------|-----------------|---------|
| **solo** | Claude alone | 1.0× | trivial / question / house-style greenfield | none |
| **attack** | Grok red-teams Claude's finished artifact — **read-grip, repro-gated, async, batched, unreproduced discarded** | ~1.3× | ambient + silent on **narrow** nontrivial (concurrency/security/money-path/multi-file behavioral) | pre-authorized at first-run |
| **duel** | §3 primitive | ~2× | **explicit invoke / pre-merge flag only** (ambient trigger → 0.4.0) | standing budget policy OR one-tap |

- **Ambient attack is governed by PRECISION, not recall** — this is the lint-fatigue graveyard.
  Launch **narrow**, widen on evidence. **Precision SLO with auto-quiet:** if rolling
  accepted-finding precision drops below threshold, the tier quiets itself and says so in the
  digest. Repro gate (R6) is load-bearing for *survival*, not just epistemics — never weakened.
- **Batched delivery** at natural boundaries (task end / pre-commit), not whenever Grok finishes.
- **Sell duel as STAKES-TRIGGERED, not a mode:** "solo for typing, attack on everything that
  matters, duel for changes that can hurt you" — high-stakes code, unattended runs (where human
  minutes, not tokens, are scarce — a 0-intervention 2× duel is *cheaper in attention* than 1×
  + manual review), pre-merge moments.
- **Mode legibility:** footer `mode=solo|attack|duel  cost≈1.0×|1.3×|2.1×`, incl. the
  **budget-exhausted state** `mode=solo (budget)`.

## 3. The duel primitive — 0.3.0 = manual, whole-tree, contract-gated

1. **Blind parallel generation** — both models solve in **isolated worktrees from a clean base
   SHA** (auto-duel refuses a dirty base). Claude's arm is *also* worktree-isolated; the main
   tree is read-only to the duel until the court promotes a winner. Both arms receive **only the
   frozen problem bundle** (files listed, no session/chat history, same skill pack or neither).
2. **Cross-attack** — each red-teams the *other's tree* (artifact-only, not chat), repro-gated.
   Symmetric → the judge of tree A is the author of tree B.
3. **Executable court:**
   - **Product court = behavioral suite (S_beh) required.** Config `duel.test_command` or a
     discovered `npm test`/etc. **No suite → hard-refuse auto-duel** (manual only, with explicit
     "I accept unscripted merge"). Winner = **whole tree, higher S_beh.** **No cherry-pick in
     0.3.0** (cherry-pick reopens the lossy channel → 0.4.0).
   - **Architecture = conformance, not taste.** A script cannot score "good design"; it scores
     *conformance to a pre-frozen executable contract* (structural rules + acceptance tests +
     GAP-vs-SPEC), authored **before either tree exists**. Claude authors the contract (symmetric
     — biases what counts, not who wins); **Grok gets one bounded round to attack the contract**
     before generation. For architecture the court **defends the ceiling** (E6 branch a); the
     *raise* comes only from whole-tree selection when Grok's tree wins (branch b). Both branches,
     honestly composed. The shipped court does **not** claim to catch open-form design quality.
   - **Integration = promote winner into a third integration worktree, run S_beh, then main.** Cap
     retries at 1, else NEED_INPUT with both trees preserved. No Claude aesthetic merge (E6).

## 4. The exchange law (the chat guard — enforced in prod, not just tests)

The `>1 round-trip` guard was undefined; here it is, enforceable:

- **Allowed between models:** (i) the frozen problem statement P (bytes); (ii) finished trees as
  git objects; (iii) typed Finding files; (iv) court script I/O.
- **Forbidden:** model A's free-text turn content as input to model B — *including a captain
  pasting "Grok said…".* Cross-attack reads the peer **tree**, which is artifact-only and is NOT
  a round-trip.
- **Detect + enforce:** broker tags each message `source_worker_id`; the duel orchestrator may
  pass only paths + SHAs + Finding files; any prose hop increments `cross_model_prose_hops`. On
  the quality path, hops > 0 → hard-fail (or strip and continue solo) **in production**, not only
  a harness assert on the fixture duel. Without this, chat = `min()` twice = the P1 regression,
  now invisible.

## 5. Security & isolation (must-do, was absent from the draft — Grok)

| ID | Gap | Fix |
|----|-----|-----|
| **S-1** | **Worktree primitive doesn't exist** (only probed; COMPETITIVE-ANALYSIS 2.4 open) | `spawn --worktree` from clean SHA; set cwd; register in duel meta; delete on terminal + `prune`. Blocks any duel. |
| **S-2** | **Shell isn't covered by fs containment** (known containment-gap) | Quality paths use grip ∈ {`read`,`gate`} **only, never `leash`**; duel write-arm = worktree + gate. Documented. |
| **S-3** | **Secrets/PHI leak into worktrees** | Clean-SHA checkout; exclude `.env*`, creds, `*.pem` (sparse/exclude list); attack mirror = source files only; audit if secret-looking paths appear. |
| **S-4** | **Cross-tree read for attack** | Attacker gets read-only mount of peer tree; PATH_ESCAPE still blocks writes (tested). |
| **S-5** | **Cost runaway** | Hard `max_usd_per_duel` / `max_usd_per_session`; abort + partial report. A dashboard is not a kill-switch. |
| **S-6** | **Crash mid-duel** | Duel FSM: `pending\|generating\|attacking\|adjudicating\|done\|aborted`; dead worker → abort, keep surviving tree, no false court; resume only from frozen SHAs; orphan-worktree GC. |
| **S-7** | **Adjudicator itself buggy** | Golden fixtures + mutation tests of the court script; court version pinned in every duel report. A buggy court = a false license forever. |
| **S-8** | **Ambient attack SHA race** | Freeze `base_sha` + file snapshot at attack start; findings cite `base_sha`; HEAD ≠ base at apply → `STALE`, no auto-apply. |
| **S-9** | **Permission drip on duel generators** | Pre-authorize test runs inside the duel worktree under budget, or the veto gate makes duel unusable (P1's 7–8 approvals). |

## 6. Product artifacts (was absent — Fable)

- **Duel report (design before the court — its shape drives the court's data model):** one page
  per run — why the winner won (failing tests in the loser, with repro commands), contract
  line-items, what was discarded and why, cost, wall-clock, court version. This is the *receipt*
  for every 2× purchase; without it duel is a black box that charged double and said "trust me."
- **First-run consent flow:** on enable, author the budget policy, explain the tiers, and make
  **the first N attacks loud, not silent** — trust in an invisible tier is built by progressive
  disclosure (verbose until it's caught something or stayed honest about catching nothing).
- **Budget policy schema:** per-day cap, per-repo enable, tier ceilings, "duel up to $X/day then
  one-tap"; plus the budget-exhausted degrade behavior (→ attack or solo, shown in footer).
- **Trust telemetry — `grok gain`** (mirrors the owner's own `rtk gain`): weekly digest —
  attacks run, reproduced findings, would-have-shipped catches, $, precision. This is the
  uninstall-prevention mechanism.
- **Findings feedback loop:** dismiss-and-suppress (per-repo suppression list) — repeated false
  flags turn the invisible reviewer into the annoying one and it gets disabled.
- **Thesis-status surface** (if killed): a `THESIS.md`/README section — "quality claim tested,
  not licensed for this scope, here's the data." Honesty *is* the floor product.

## 7. The gate — corrected paper-kill (before any quality code)

- Third party freezes S_beh (executable) + the architecture spec/contract for **2 problems,
  ≥1 non-hexagonal, non-ceiling**; problem statement P written by a non-implementing party,
  **not mentioning ports/aggregates** (else both arms are Claude-shaped and Grok loses on prior).
- Arms: **S0 ×2** (variance σ), S1a (self-review), **S1b (Claude→Claude handoff)**, **S2 under
  hand-enforced product constraints** (findings-as-files, repro-or-discard, fix-budget cap,
  forced JUDGMENT accept/reject **or third-party acceptor**), **S3 (manual duel)**.
- Architecture axis graded by a **blinded third party** on anonymized tree tarballs (labels/paths
  stripped) — never LLM-as-judge for license.
- **Intervention count logged as a first-class metric** (autonomy is measured, not assumed).
- **License to build the duel** iff S3 > solo + 2σ on one axis and ≥ solo − σ on the other, on
  **both** problems. Else: failure clause fires; ship the floor.
- **Quality-per-dollar is NOT on the license bar** — solo dominates $/point by construction, so
  that axis would kill duel dishonestly. Quality (2σ) is the bar; dollars are handled by routing
  + budget policy (resolves §9-Q2).

## 8. Release split (both reviewers: duel+router+ambient = two releases)

**0.3.0 (defensible minimal):** R1–R8 + exchange law + security cluster (S-1…S-9 as needed) +
first-run consent & budget schema + **ambient attack** (narrow, repro-gated, batched, precision
SLO, footer, `grok gain`) + null-product PRD + corrected paper-kill + **if licensed:** manual
whole-tree `/grok:duel` with report.

**0.4.0 (cut, on purpose):** ambient *duel* triggering; the smart router (hexagonal classifier,
rich rules) — 0.3.0 ships a **dumb 3-rule static policy + a routing-signal log**, not a table
from N=2; cherry-pick/hybrid integration; shadow-duel automation; harness-v2 as a platform;
cost dashboard; Specialize topology (D5).

## 9. The unified task list — everything, prioritized

Merges Claude R/C, Grok G0–G22, Fable's list. `[R]`=reliability `[X]`=security `[P]`=product
`[E]`=experiment `[Q]`=quality-surface(licensed only).

**P0 — ship regardless of the thesis (weeks 0–1):**  _(✅ = landed + tested + Grok-reviewed; suite 119→124)_
1. ✅ `[R]` **R1** — `paused` timeout + one auto-nudge + escalate-on-re-pause. Grok's decorrelated review caught 5 real bugs (latch-before-success, escalate≠re-pause, no reset on human say, resurrect-dead, missing-pausedAt) — all fixed. `test/pause-nudge.test.mjs`.
2. ✅ `[R]` **R3** — `grokctl wait --actionable`/`--any` + `isActionable` predicate (skips un-escalated `paused` checkpoints, wakes on R1 escalation). `test/actionable.test.mjs`. **R4** (ban poller pattern in skills) still pending — doc change.
3. ✅ `[R]` **R2** — `STATUS: WORKING` now auto-continues (run straight through to DONE) under advise/leash/read with a runaway cap; `gate` still parks for steering. Root cause was `WORKING`→`paused`. `test/working-continue.test.mjs`.
4. ✅ `[R]` **R5** — expanded git read-only whitelist (rev-parse/ls-files/show-ref/show) + per-worker `--allow-tests` grant (global test-run default stays OFF — write-then-run escalation stays opt-in, now scoped per worker). Security-verified: my `git -h` audit caught & pulled `cat-file` (its `--textconv` execs a driver); direct probe confirmed the `git -c pager=…` prefix bypass and the `allowTests`→read-grip leak are both closed. `test/policy.test.mjs`.
5. ✅ `[R]` **R6** — typed `Finding{id,class,repro,status}` in `lib/finding.mjs`: class-specific validation (REPRO needs a runnable repro, JUDGMENT needs a counterfactual, GAP needs spec+deviation) + the enforced gate that a proposed REPRO **cannot** reach `accepted` without `reproduced` + `activeFindings` filter + `grokctl findings`/`finding` CLI. (R7 retention already shipped, A7.) `test/finding.test.mjs`.
6. ✅ `[R]` **R8** — `buildBrief` now makes deviation a **blocking NEED_INPUT** ("a trade-off shipped without approval is a defect, not a note") + optional `--accept <cmd>` acceptance criteria that makes DONE-on-red invalid. `test/brief.test.mjs`.
7. ✅ `[X]` **Exchange law** — `lib/exchange.mjs`: `assertExchangeLegal` (only `problem|tree|finding|court` refs cross; raw strings & prose-carrying objects throw) + `makeExchangeLog` prose-hop counter (fails closed, counts breaches for the report). Spec: `EXCHANGE-LAW.md`. `test/exchange.test.mjs`. _(Contract shipped first; the duel path is required to call it — wiring lands with the duel.)_
8. ⏳ `[X]` **S-2 / S-5** — quality-path grip ∈ {read,gate}; hard cost caps + kill-switch. **DEFERRED with the duel** — these guard the 2× duel spawn/spend, which doesn't exist pre-license; building them now is speculative duel-infrastructure (D4/§8). S-5 token-cost tracking has some standalone value for the floor product — flag for the user.
9. ✅ `[P]` **Null-product PRD** — `NULL-PRODUCT-PRD.md` (throughput-only, no quality claim; the baseline the quality arms must beat; the failure clause's teeth).
10. ✅ `[P]` **Duel report spec** — `DUEL-REPORT-SPEC.md` (`duel-report@1` schema + human view; drives the court's data model; enforces proseHops=0, pinned court version, shown discards, explicit 2× cost).
11. ✅ `[R]` **R4** — advisory-loop skill now mandates `wait --actionable` (tracked, not `&`-detached) and bans hand-rolled pollers (closes F4).

**P1 — the gate (before any quality code):**
11. `[E]` **Corrected paper-kill** (§7) — pre-registered, dated, third-party-graded, intervention-logged.
12. `[E]` **Signed license-or-kill** + routing-signal log (not a rule table).

**P2 — if KILLED (ship honesty):**
13. `[P]` **Ambient attack-as-lint** — §2 attack tier: async, read-grip, repro auto, JUDGMENT one-tap, **S-8 base_sha/STALE**, precision SLO, suppression list, batched, footer, `grok gain`.
14. `[P]` **THESIS-status surface** + demote `/work` claims; README = floor product + optional lint.

**P3 — if LICENSED (thin quality surface, still not the full ladder):**
15. `[X]` **S-1** worktree primitive (clean-SHA, cwd, cleanup, dirty-base refuse) + **S-6** duel FSM + **S-3** secret excludes + **S-4** cross-tree read mount.
16. `[Q]` **Manual `/grok:duel` MVP** — two worktrees, frozen P only, cross-attack artifact-only, **whole-tree** winner via S_beh script, **no cherry-pick**, no ambient trigger.
17. `[Q]` **Court MVP + contract** — pre-frozen executable contract (+ Grok's one contract-attack round); run `test_command` on both trees; max S_beh; tie → lower cost or NEED_INPUT; **S-7 golden fixtures + version pin**; the report (task 10).
18. `[X]` **S-9** pre-auth tests inside duel worktrees under budget.
19. `[P]` **Budget schema + first-run consent** (first-N-attacks-loud) + **mode footer** (incl. budget-exhausted).
20. `[P]` Promote ambient attack (task 13) as tier-1 if S2 won.

**0.4.0:** ambient-duel trigger, smart router, cherry-pick, shadow-duel automation, harness-v2 platform, cost dashboard, Specialize.

## 10. Decisions that are the owner's

1. **Co-sign the failure clause** — *with* pre-registration and a drop-dead date (§1). Recommended.
2. **Cost model:** duel is premium **stakes-triggered** mode; **quality-per-dollar stays OFF the
   license bar** (§7). Confirm.
3. **Consent relocation:** budget-policy consent (recommended) vs zero surface (= bill-shock; all
   three advise against).
4. **The date and the two experiment problems** (one must be non-hexagonal).

## 11. Four contradictions in the draft — resolved

- §4 shadow-duel vs "never silently commit 2×" → **shadow-duel is 0.4.0 / owner-scheduled only**, never silent auto-spend.
- §3 "Grok fixed 1" vs attack read-grip → **Grok never writes on attack; "fixed" = Claude applied after the repro went green.** Copy corrected.
- §0 unconditional identity vs §7-conditional product → **identity = the invisible reviewer (attack tier), which ships in both branches;** duel is the gated top rung.
- §1 "Law" / §2 "never below solo" → **softened to hypothesis / "suite-gated, empirically at-or-above."**

## 12. Definition of done for 0.3.0

- R1–R8 shipped; P1-style stall & approval-drip cannot recur (regression tests).
- Exchange-law guard enforced in prod; fixture duel asserts 0 prose hops.
- Ambient attack live behind first-run consent, repro-gated, batched, precision-SLO'd, legible.
- Corrected paper-kill has run and returned a **signed, pre-registered, dated** license-or-kill.
- If licensed: manual whole-tree duel + court + report shipped behind the budget envelope.
- If killed: honest floor + THESIS surface shipped; failure clause on record; 0.4.0 rescoped.

---

_Final 3-model fold. The one sentence for the owner: **0.3.0's identity is the invisible
reviewer — the rung that ships no matter what the experiment says; the duel is the evidence-gated
top rung whose receipt, contract, and kill-date you design now and whose ambient trigger you earn
in 0.4.0.**_
