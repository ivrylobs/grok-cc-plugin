# The paper-kill — how we tested whether Grok makes Claude's code better

<p align="center">
  <img src="https://raw.githubusercontent.com/ivrylobs/grok-cc-plugin/main/example/paper-kill/verdict.svg" alt="Paper-kill verdict across three axes: BEHAVIORAL — solo Claude hit 100/100 reference quality twice while a flawed foil scored 73; DESIGN — solo Grok ranked last on every blind grid; AUTONOMY — the red-team needed 13–22 approvals per attack and found ~0 real bugs. Verdict: KILL." width="820">
</p>

> **The whole project rested on one claim. So we tried to kill it before building on it.**
> This is the honest record of that experiment — including the part where the claim died.

**Visual verdict:** <https://claude.ai/code/artifact/86fced45-136c-4296-892e-aaa253c962a1>
· **Machine-checkable record:** [`run-2/results/VERDICT.md`](run-2/results/VERDICT.md)

---

## The claim on trial

`grok-cc-plugin` ships a reliable floor: Claude captains, Grok works in parallel behind a veto
gate. That part is measured and real. But the *ambitious* version of the project — the reason to
build a whole "duel" engine in 0.4.0 — was a stronger claim:

> Turn on a decorrelated Grok-4.5 peer and the **code itself comes out better** than solo Claude.

If that's true, it's worth a lot of machinery. If it's not, the machinery is a monument to a
belief nobody checked. There was exactly one honest way to find out: **try to kill the claim, on
purpose, before writing the code that assumes it.**

## Why a "paper-kill"

A paper-kill is a pre-registered, blind, adversarial experiment whose job is to *falsify* a thesis
cheaply. The name is the point: you are trying to kill it on paper so you don't have to kill it in
production after six weeks of building. The bar is set to make a **pass hard and a kill honest** —
because the tempting failure mode is to design a test your own idea passes.

The one meta-flaw that sinks most self-run evals is: **experimenter = designer = scorer =
acceptor.** Every rule here exists to break that loop:

- **Pre-registered.** Arms, thresholds, and the license/kill rule were git-committed *before the
  problems were chosen* ([`PRE-REGISTRATION.md`](PRE-REGISTRATION.md), [`PROTOCOL.md`](PROTOCOL.md)).
  Problem choice is not a knob you get to turn toward the answer you want.
- **Blind + adversarial.** Design was graded on anonymized, label-stripped trees; the models
  cross-attacked each other's code, artifact-only, with no idea which tree was whose.
- **Product-constrained.** The attack ran under the constraints the *shipped* product would have —
  read-only target, findings discarded unless a repro actually reproduced, a fix budget — not a
  clean demo. A win under a cleaner-than-production process is a false license.
- **Two axes, never one.** A hidden **behavioral** suite (does it work?) and a **blind design**
  grade (is it good?) were reported separately — plus a third axis in run 2: **autonomy** (how many
  times did a human have to step in?).

## What we ran

Two orthogonal hard problems, each authored to be genuinely difficult, each frozen by hash before
any model saw it:

| Run | Problem | Why it's hard |
|-----|---------|---------------|
| **run-1** | an async task queue | concurrency, cancellation, retry, shutdown ordering |
| **run-2** | a timezone / RRULE / DST recurrence library | civil-calendar math, DST gaps & overlaps, spec edges |

Each problem was solved by solo Claude (twice, for a noise floor), by solo Grok, and then put
through the adversarial arms: Grok attacks Claude's finished tree; a blind cross-attacking duel.
Full arm design in [`run-2/DESIGN.md`](run-2/DESIGN.md).

## What happened

**Both problems behaviorally saturated.** Solo Claude Opus reached *reference quality* — 100/100 on
the hidden suite — on both. The suite wasn't broken: a deliberately-flawed foil implementation
scores 73 on the same harness, so the test discriminates. It's just that on greenfield,
well-specified library work, **solo Claude is already at the ceiling** — which means no peer can
demonstrate an uplift above it. Twice.

**The design axis — the tie-breaker — pointed the wrong way for the thesis.** With behavior
saturated, blind design grade was the only place quality could still show. On the binding neutral
grader, solo Grok's code ranked **last on every grid in run-2**, 8–10 points below the Claude
baselines; run-1 pointed the same way (Grok's tree lowest) but by a smaller, ambiguous margin. The
duel couldn't win either: the best duel tree *was* a Claude baseline, because a duel can only raise
quality if Grok's tree wins — and it didn't.

**The red-team was not autonomous.** Grok attacking reference-quality Claude code found
essentially nothing real, at **13–22 human approvals per attack** across the runs, and had to be
*steered to stop looping*. An autonomous peer that needs a babysitter more than once per bug it
proves — and here proved almost none — is a review tool with a human attached, not a peer.

## The verdict: KILL — for this scope

The pre-registered rule returned **KILL**. Every grader, every basis, both runs. So:

- **The 0.4.0 duel machinery was not built.** That is the paper-kill working exactly as designed —
  we found out before spending the weeks.
- **0.3.0 ships as the honest floor** with no "your code gets better" claim, and this record stays
  in the repo. See [`../../THESIS.md`](../../THESIS.md).

## What did *not* die (reading the result honestly)

The experiment tested **one thing in one regime**, and the honest read matters as much as the kill:

- **It ships working code, fast.** Grok's solo solve passed the hidden suite (100/100) and, in this
  instance, ran quickest of the arms — ~3.6 minutes, one approval ([`run-2/results/timing.csv`](run-2/results/timing.csv),
  [`interventions.csv`](run-2/results/interventions.csv)). Honest caveat: the *formal* throughput
  bars **failed** on the peer (attack/duel) paths, so this is a capability observation, not a proven
  throughput win — the wall-time/token value of the co-worker floor is a product goal, not on trial here.
- **Co-thinking on messy code is untested here.** The attack only ever critiqued Claude's
  *already-near-perfect* code, where there was nothing to find. On real, messy code the story may
  differ: a single Grok delegation on *this very plugin* once surfaced **3 real bugs that 35 tests
  had missed** — one out-of-band anecdote (N=1), not part of this verdict. Whether Grok is a sharper
  co-thinker on hard/unfamiliar code is a *different, open* question this experiment deliberately did
  not answer.
- **Integrity was clean.** Grok scored its own tree lowest in both runs. It isn't deluded about the
  gap — and neither are we.

## What killed the thesis, in one line

Not "Grok is bad." **Solo Claude is the ceiling on its home turf**, so a quality *uplift* there is
unmeasurable — and the one axis that could still speak favored solo Claude. The regimes where a
decorrelated peer plausibly wins (bug-dense, concurrency-heavy, unfamiliar codebases,
wall-clock-bound work) are a *new* hypothesis, run from scratch — not an escape hatch that lets this
one avoid dying.

## Read the evidence yourself

| File | What it is |
|------|-----------|
| [`PROTOCOL.md`](PROTOCOL.md) · [`PRE-REGISTRATION.md`](PRE-REGISTRATION.md) | the rules, committed before the problems |
| [`run-2/DESIGN.md`](run-2/DESIGN.md) · [`run-2/PROBLEM.md`](run-2/PROBLEM.md) | run-2 arm design + the frozen problem |
| [`run-2/results/VERDICT.md`](run-2/results/VERDICT.md) | the computed verdict, every number |
| [`run-1/`](run-1/) | the first run (async task queue) |

The artifact above is the one-screen version. This directory is the long version. Both say the same
thing, because that is the point of doing it this way.
