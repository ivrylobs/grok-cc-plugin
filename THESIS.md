# The thesis, tested

This project started with a bet, and it ran a real experiment to find out if the bet was true.
This page is the honest answer, kept in the repo on purpose — including the part that failed.

## The bet

Claude is the captain; Grok-4.5 is the co-worker. The **0.3.0 floor** was always the reliable
part: hand Grok a task, it works in parallel, unattended, behind a veto gate. The **0.4.0 dream**
was the ambitious part: that a decorrelated Grok peer would make the *code itself measurably
better* than solo Claude — enough to justify building autonomous quality machinery (the "duel":
two models solve blind, cross-attack, and an executable court picks the winner).

Before writing a line of that machinery, we tested whether the quality claim was real.

## The test — a paper-kill

A **paper-kill** is a pre-registered, blind, adversarial experiment designed to *kill* a thesis
cheaply before you build on it. Arms, thresholds, and problems were frozen (hash-committed)
*before* the problems were seen, so problem-choice couldn't become a thumb on the scale. Two
runs, two orthogonal hard problems built to be hard:

- **run-1** — an async task queue (concurrency/lifecycle).
- **run-2** — a timezone / RRULE / DST recurrence library.

Each run measured three axes: a hidden **behavioral** suite (0–100), a **blind 3-model design
panel** (0–24, the neutral non-arm grader binding), and — in run-2 — an **autonomy** axis
(human interventions, wall-clock, crater events).

## The verdict: KILL — for this scope

Full record: [`example/paper-kill/run-2/results/VERDICT.md`](example/paper-kill/run-2/results/VERDICT.md)
· visual summary: <https://claude.ai/code/artifact/86fced45-136c-4296-892e-aaa253c962a1>

- **Behavioral:** both problems **saturated** — solo Claude Opus reached reference quality
  (100/100; the suite is verified discriminating, a deliberately-flawed foil scores 73). When
  solo Claude is already at the ceiling, no peer can show an uplift. Twice.
- **Design (binding grid):** in run-2, solo Grok's code ranked **last on every grid** — 8–10
  points below the Claude baselines on the binding neutral grader. Run-1's design axis pointed the
  same way (Grok's tree lowest) but by a smaller, ambiguous margin. Either way, the one axis where
  quality could still surface pointed *against* the peer.
- **Autonomy:** the red-team path **cratered** — ~0 useful findings at 13–22 human approvals per
  attack across the runs (VERDICT §4), needing human steering to stop. An autonomous peer that
  needs a babysitter isn't one.

So the specific bet — **"turn on Grok and the code comes out better than solo Claude"** — is
**not true for greenfield, single-context, house-style work**, and the 0.4.0 quality machinery
is **not built**. That is the whole point of a paper-kill: we found out before spending the weeks.

## What did *not* die (don't let the kill overclaim)

The experiment tested one thing in one regime. It did **not** show Grok is useless:

- **It ships working code, fast.** Grok's solo solve passed the hidden suite (100/100) and, in
  this instance, ran quickest of the arms (~3.6 min, one approval — see `run-2/results/timing.csv`
  and `interventions.csv`). Honest caveat: the *formal* throughput bars **failed** on the peer
  (attack/duel) paths, so this is a capability observation, not a proven throughput win. The 0.3.0
  floor's wall-time / token-offload value is its product goal — this experiment didn't put it on trial.
- **Co-thinking on messy code is untested here.** The attack tier only ever critiqued Claude's
  *already-reference-quality* code, where there was almost nothing to find. On real, messy code the
  story may differ: a single Grok delegation on this very plugin once surfaced **3 real bugs that 35
  tests had missed** — one out-of-band anecdote (N=1), not part of this verdict. Whether Grok is a
  sharper co-thinker on hard/unfamiliar code is a *different, open* question this experiment
  deliberately did not answer.
- **Integrity was clean.** Grok scored its own tree lowest in both runs — it isn't deluded about
  the gap.

## What ships instead

The honest floor, and only the honest floor:

- **Claude captain + Grok as a fast, reliable co-worker and advisory reviewer.** It's built to cut
  wall-time and offload token cost from the captain (the product goal — not a bar this experiment
  measured). It makes **no claim** to out-quality solo Claude, and the `/grok:work` surface says so
  plainly.
- **No duel machinery**, no "your code gets better" promise. If the thesis is ever re-opened, it's
  a genuinely new hypothesis — a different peer model, or a regime where peers plausibly win
  (bug-dense, concurrency-heavy, unfamiliar codebases, wall-clock-bound work) — run from scratch,
  not an escape hatch that lets this one avoid dying.

Keeping a failed hypothesis in the repo, with its data, is the floor product too. Honesty is the
feature that a "your code gets better" banner over an unproven claim would have quietly sold out.
