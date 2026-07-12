# Blind design rubric — Problem P1 (AsyncTaskQueue)

Graded by a HUMAN on anonymized trees. No LLM grade is license-binding. Six dimensions,
0–4 each, D = 0–24 total. Grade all trees in one sitting, in the shuffled order, before
computing any verdict.

Score anchors for every dimension: 0 = absent/wrong, 1 = attempted but misleading,
2 = works but a maintainer would tread carefully, 3 = solid, 4 = exemplary (you would
show it to someone as "how to do this").

## D1. Task lifecycle model

Is the execution's state (queued / running / backoff / settled / orphaned) represented
explicitly and transitioned in one place — or smeared across booleans, nullable timers,
and inferences? Look for: a state field or equivalent single source of truth; the
dedup "execution vs caller" split modeled as two distinct things; no zombie states.

## D2. Concurrency discipline

Slot accounting has exactly one increment and one decrement path; the dispatch loop
cannot double-start or stall; orphaned tasks (abort/timeout) cannot corrupt the count
when they eventually settle. Look for: a token/epoch or equivalent guard on stale
attempt callbacks; no polling, no `setInterval`, no sleep-loop scheduling.

## D3. Resource and listener hygiene

Every path that settles an execution clears its timeout timer, its backoff timer, and
removes its abort listeners — including the ugly paths (joiner aborts, full
cancellation, shutdown during backoff). Look for: a single cleanup function invoked from
all exits; `addEventListener` always paired with removal or `{ once: true }` plus
explicit detach on settle.

## D4. Error semantics

Rejection reasons are precise and consistent: the task's own error object passes
through untouched; abort rejections carry the signal's reason; `TimeoutError` /
`QueueClosedError` are real classes with correct names; no `catch` that swallows or
rewraps into anonymous `Error("failed")`; no unhandled-rejection landmines (orphaned
task outcomes are explicitly ignored, not left to explode).

## D5. Spec fidelity on the open edges

The spec deliberately leaves edges open (invalid constructor args, joiner semantics
corner cases, what `shutdown()` does to `onIdle()` waiters, re-entrant `run()` from
inside a task). Did the author notice any and decide deliberately (code or NOTES.md),
or silently do whatever fell out of the implementation? Penalize invented surface area
(events, metrics, options not in the spec) — the anti-goals section was explicit.

## D6. Readability and proportion

Could a stranger modify the dedup or retry logic without fear? Code size proportional
to the problem (~150–350 meaningful lines is the natural zone; big deviations need to
earn themselves). Names say what things are (`execution` vs `caller` vs `attempt`).
Comments explain WHY on the genuinely tricky interactions and are absent where code is
self-evident.

---

## Anonymization procedure (do this BEFORE the grader sees anything)

Performed by someone/something other than the grader (a fresh Claude session that did
not run any arm is acceptable — it is mechanical):

1. Copy each delivered tree to `graded/<letter>/` where letters A–E are assigned by
   shuffling (record the mapping in a sealed file the grader does not open:
   `graded/MAPPING.sealed.txt`).
2. Keep only `src/**` and `NOTES.md`. Delete everything else (package.json, configs,
   scratch files, tests).
3. Strip tells: delete any comment or line matching, case-insensitively:
   `claude|anthropic|grok|xai|x\.ai|gpt|llm|generated|model|assistant|session`.
4. Normalize formatting so style is not a fingerprint:
   `bunx prettier --write "graded/**/*.ts" "graded/**/*.md"` (default config).
5. The grader grades A–E in shuffled order, writes all six scores per tree, THEN the
   mapping is unsealed and scores attach to arms.

The grader ran or observed some arms today, so blindness is imperfect — the shuffle,
tell-stripping, and format normalization are the honest best available in one session.
Record in the results that grading was "blinded-best-effort, same-day."

## Which trees get a D grade

Exactly five: S0a, S0b, S2′ (post-attack-fix), DC (duel Claude tree post-fix),
DG (duel Grok tree post-fix). S1a′ is scored on behavior only — it exists to price the
generic-second-pass effect, not to win anything.
