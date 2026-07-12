# Blind design rubric — Problem P2 (ZonedRecurrence)

Graded by a HUMAN on anonymized trees. No LLM grade is license-binding. Six dimensions,
0-4 each, D = 0-24 total. Grade all trees in one sitting, in the shuffled order, before
computing any verdict.

**Grading authority (run-1 lesson, pre-registered):** the license-binding D grades are the
owner's. If the owner delegates to a model panel, the NEUTRAL non-arm grader's grid governs
the verdict computation — never the panel average, and never an arm's own grid. Run-1's
panel-average flipped the verdict on a 0.5-point margin created by one arm's outlier grading
of the baselines; that ambiguity is closed here, in advance.

Score anchors for every dimension: 0 = absent/wrong, 1 = attempted but misleading,
2 = works but a maintainer would tread carefully, 3 = solid, 4 = exemplary (you would
show it to someone as "how to do this").

## D1. Time model

Are UTC instants and local wall times represented as two distinct things (types, shapes, or
at minimum rigorously distinct variables) converted at one explicit boundary — or is the code
doing ad-hoc `Date` arithmetic where the same value sometimes means an instant and sometimes
a wall time? Look for: a scheduled-wall vs resolved-wall distinction (rules 15/18 force it);
no `new Date(y, m, d)` locale-dependent landmines; the naive "wall reinterpreted as UTC"
pivot, if used, clearly named as a pivot and never leaked as an instant.

## D2. Calendrical generation discipline

Is there one canonical candidate generator per frequency with the selector composition
(byMonth × byMonthDay/byDay, dedup, ordering) in a defined order — or nested special cases
smeared through the expansion loop? Termination must be guaranteed by construction
(count/until/window bound the loop; no "iterate and hope"). No epoch±86400000 stepping for
calendar days. Week/month/year arithmetic in the civil calendar, not via ms math.

## D3. Zone-math and formatter hygiene

Gap/overlap resolution lives in exactly one function with the policy (rules 12-14) legible
in its body. `Intl.DateTimeFormat` instances are constructed once per zone and reused —
constructing one per candidate is the classic 100x slowdown and marks 0-2 here. Offset
lookups centralized; no scattered re-parsing of format parts; no hidden dependence on the
host machine's local timezone anywhere (`TZ` must not matter).

## D4. Error semantics

`RecurrenceError` is a real class (`instanceof` works, name correct) thrown synchronously on
validation, before any expansion work. Messages say what was wrong with which field. No
silent coercion where the spec says throw (rule 21), no silent clamping where the spec says
skip (rules 6, 7, 9). No `catch` that swallows `Intl` errors into wrong behavior instead of
rethrowing as `RecurrenceError`.

## D5. Spec fidelity on the open edges

The spec deliberately leaves edges open (exDates naming never-generated times, `until`
earlier than the first occurrence, `start` itself falling in a gap, input-object mutation
or aliasing, seconds in instant strings beyond the fixed format). Did the author notice any
and decide deliberately (code or NOTES.md), or silently do whatever fell out? Penalize
invented surface area — RRULE string parsing, extra frequencies, iterator APIs, options not
in the spec; the anti-goals section was explicit.

## D6. Readability and proportion

Could a stranger modify the MONTHLY ordinal-byDay logic or the gap policy without fear?
Code size proportional to the problem (~200-450 meaningful lines is the natural zone; big
deviations need to earn themselves). Names say what things are (`wall` vs `instant` vs
`candidate` vs `occurrence`). Comments explain WHY on the genuinely tricky transitions and
are absent where code is self-evident.

---

## Anonymization procedure (do this BEFORE the grader sees anything)

Performed by someone/something other than the grader (a fresh Claude session that did not
run any arm is acceptable — it is mechanical). Run `./anonymize.sh graded/ <five trees>`:

1. Each delivered tree is copied to `graded/<letter>/`, letters A-E assigned by shuffling;
   the mapping is sealed in `graded/MAPPING.sealed.txt`, which the grader does not open.
2. Only `src/**` and `NOTES.md` are kept.
3. Tell lines are stripped (any line matching, case-insensitively:
   `claude|anthropic|grok|xai|x\.ai|gpt|llm|generated|model|assistant|session`).
4. Formatting is normalized with prettier so style is not a fingerprint.
5. The grader grades A-E in shuffled order, writes all six scores per tree, THEN the
   mapping is unsealed and scores attach to arms.

The grader ran or observed some arms the same day, so blindness is imperfect — the shuffle,
tell-stripping, and format normalization are the honest best available in one session.
Record in the results that grading was "blinded-best-effort, same-day."

## Which trees get a D grade

Exactly five: S0a, S0b, S2′ (post-attack-fix), DC (duel Claude tree post-fix), DG (duel
Grok tree post-fix). The conditional attribution arm S1a′ (see DESIGN.md §4 rule 2), if it
runs, is scored on behavior only.
