# 0.3.0 brainstorm — make Claude+Grok BEAT solo Claude (or admit it can't)

Shared substrate for the Claude↔Grok↔Fable brainstorm. Evidence: benchmark
problem 1 — solo Claude **93.5**, co-work **85.5**, solo Grok **80.5**. The
collaboration *subtracted* capability. Findings F1–F4 in ../BENCHMARK-FINDINGS.md.

## Three prior takes (converging)

**Claude's thesis:** the plugin optimizes the wrong primitive — *delegation*
(hand work to Grok). Delegation only helps when capacity-bound or the delegate is
more capable. Grok (80.5) is weaker here, so putting it on the generative critical
path caps the result at a *blend*, not a *max*. Fix: **delegate doubt, not work.**
Claude stays author (ceiling = solo Claude); Grok's role is adversarial so output
is ≥ solo by construction.

**Grok's own take (from the P1 discussion):** collab was "serial handoff, not
fusion." A stated deviation became "permission to ship the step-down" — "a note is
not a review, it's an apology in the source." Fix: mandatory design-diff veto gate
(every gap vs design is fixed or escalated as NEED_INPUT, accepted in writing), and
invert the labor split.

**Fable's third-opinion critique (sharpest):**
- **Composition law: serial pipelines compose by `min()`; parallel verification by
  `max()`.** Co-work was min-blend → structurally guaranteed to lose to solo.
  Dual-grading was the only max-topology and it was accidental.
- Three mechanisms: (a) min vs max; (b) the brief is a **lossy channel** and the
  loss is *invisible* — nobody knows what didn't survive serialization; (c) review
  is **verification-shaped** — it checks what's there, not what's missing;
  "documented trade-off" is a review exploit.
- **A second model is additive iff: (i) decorrelated errors, (ii) verification
  asymmetry (checking ≪ generating), (iii) NOT on the generative critical path.**
  Our setup violated all three.
- **Right primitive: the adversary with reproducible findings.** Claude keeps
  generative ownership; Grok attacks under `read` grip; **every finding ships with
  a reproduction** (a failing test file / exact command + expected-vs-actual);
  captain runs reproductions; unreproduced findings are discarded. This also
  neutralizes the "Grok misreports its own capabilities" trap — a failing test is
  self-proving, no trust required. Worst case = solo Claude + a few tokens.
- **Highest leverage: invert roles — `/grok:attack` replaces `/grok:work` as the
  flagship.** Claude implements; Grok red-teams the spec/diff under read grip.
- **Missing benchmark controls (damning):** (1) no "Claude + Claude self-review"
  arm → can't tell if *Grok* adds value or if *any* second pass does; (2) no
  Claude+Claude *handoff* arm → can't attribute the loss to Grok vs to handoff
  itself; (3) rubric may be Claude-shaped (it penalized the co-work for being
  *concise*); (4) self-authored tests prove nothing — need a hidden objective
  acceptance suite written before any arm; (5) the thesis-saving arm (Claude solo +
  Grok adversarial review + fix) was never run; (6) regime coverage zero — greenfield
  single-context is the *maximal-solo-advantage* regime; delegation's real wins
  (parallel throughput, cost, tasks exceeding one context window) were untested.
- **0.3.0 = two honest lanes:** Lane A (quality) = decorrelated adversary
  (`/grok:attack`, `/grok:diff-audit spec impl`, optional `/grok:counter` =
  parallel blind solve + cross-exam). Lane B (throughput/cost) = delegation, HONESTLY
  DEMOTED — keep `/grok:work` for parallel/mechanical/spec-clamped tasks, stop
  claiming quality gains. Plus contract hardening (deviation = blocking NEED_INPUT;
  auto-nudge on `paused` + timeout; `grokctl wait --actionable`/`--any`; acceptance-
  tests-before-spawn) and a benchmark harness v2 with the self-review control, a
  hidden objective test suite, repeated runs, dollar accounting, and **"adversary arm
  never scores below solo" as a hard release constitution.**

## Open questions for the brainstorm (attack these)

1. Is the "adversary with reproducible findings" primitive actually right, or does
   it too have a failure mode? (e.g. adversary misses whole classes of defects a
   *generator* would have avoided; reproduction requirement suppresses valid
   design/taste critiques that aren't test-shaped.)
2. Is "never below solo" achievable in practice, or does even adversarial review
   sometimes *worsen* the artifact (bad fixes, reviewer-introduced churn)?
3. What's the strongest case that delegation-for-quality CAN still work — i.e. a
   topology where a weaker model on the critical path still raises the ceiling?
4. Does Grok agree to being demoted from "worker" to "adversary/parallel-solver"?
   Where is that wrong?
5. What flaws remain in this plan? What are all of us still not seeing?

_(Grok appends its attack below; Claude synthesizes into PLAN-0.3.0.md.)_
