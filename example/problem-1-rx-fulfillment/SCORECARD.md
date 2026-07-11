# Problem 1 — Scorecard

Two independent raters (Claude, Grok) score the three answers on RUBRIC.md.
All three answers' tests were run and **pass**: claude 33/33, grok 26/26,
co-work 29/29.

---

## Rater 1 — Claude

**Self-bias disclosure:** I am scoring `claude-answer` (a Claude subagent) and
`claude-grok-answer` (I wrote its design). I traced each answer's concurrency
path against the same failing scenario rather than trusting reputation.

| Criterion (max) | claude-answer | grok-answer | claude-grok-answer |
|---|---:|---:|---:|
| Architecture & design (25) | 23 | 21 | 21 |
| Domain & invariants (20) | 18 | 15 | 17 |
| Clean code (15) | 14 | 11 | 13 |
| Scalability (15) | 14 | 13 | 13 |
| Security (15) | 13 | 13 | 13 |
| Testing (10) | 10 | 8 | 9 |
| **Total** | **92** | **81** | **86** |

**Rank (Claude): claude-answer > claude-grok-answer > grok-answer.**

Per-answer:
- **claude-answer (92) — strongest:** a first-class `IdempotencyStore` port for
  request-level dispense idempotency, the most detailed scalability section
  (versioned cache invalidation, hot-key analysis, honest "167 writes/s is
  modest"), 33 tests including the concurrency race. **Weakest:** the DESIGN is
  the longest (206 lines) — thorough but a touch verbose; driving adapter only
  sketched.
- **grok-answer (81) — strongest:** clean layered structure, a good trade-offs
  table and explicit assumptions in DESIGN. **Weakest (real defect):** stock is
  keyed by `dispense:{rxId}:{dispenseKey}` and decremented *before* the version
  CAS, so two concurrent dispenses with *different* keys **double-decrement**
  (loser's stock not rolled back). Its concurrency test only uses a *shared* key
  (`dk-shared`), so the hole isn't caught. Also `assertCanDispense` calls
  `dispense()` inside an assertion — confusing control flow.
- **claude-grok-answer (86) — strongest:** correct exactly-once (stock keyed by
  `rxId`, robust to any concurrent dispense), transactional-outbox event, honestly
  documented the single-class-vs-class-family trade-off. **Weakest:** DESIGN is
  the most concise (126 lines) so some scale detail is implied rather than spelled
  out; the aggregate is a single class with status guards rather than the ideal
  type-level state machine.

Honest note on my own family: `claude-answer` ranks first on *checkable* merits
(test count, the request-idempotency port, and correct rxId-keyed stock), not on
authorship — the decisive gap is grok-answer's verified concurrency hole, which I
reproduced by reading its stock key + concurrency test, not by preferring Claude.

---

## Rater 2 — Grok (independent, read grip)

**Self-bias disclosure (Grok's own words):** it co-authored B and C; it scored its
own solo work (B) **last** and said it graded itself "conservatively."

| Criterion (max) | claude-answer | grok-answer | claude-grok-answer |
|---|---:|---:|---:|
| Architecture & design (25) | 24 | 21 | 22 |
| Domain & invariants (20) | 19 | 16 | 17 |
| Clean code (15) | 14 | 11 | 13 |
| Scalability (15) | 14 | 12 | 12 |
| Security (15) | 14 | 11 | 12 |
| Testing (10) | 10 | 9 | 9 |
| **Total** | **95** | **80** | **85** |

**Rank (Grok): claude-answer > claude-grok-answer > grok-answer.**

Grok's distinctive findings (different from mine — combined coverage is the point):
- On **B (its own)**: "claim ignores expiry," "dispense has no claiming-pharmacy
  check," and the Postgres "sketch" is just a `POSTGRES_SKETCH = true` flag, not a
  coded class. (I instead caught B's dispenseKey-vs-rxId stock double-decrement.)
- On **A (Claude's)**: docked it because the in-memory stock isn't mutex-serialized
  (races are simulated), a dimension where Grok's own adapter is actually stronger.
- On **C**: "dispense does not re-check claiming pharmacy in the domain; ship not
  idempotent."

---

## Reconciliation

**The two raters independently agree on the ranking, and the scores are within
≤3 points of each other on every answer:**

| Answer | Claude | Grok | **Avg** | Rank |
|--------|-------:|-----:|--------:|:----:|
| **claude-answer** (solo) | 92 | 95 | **93.5** | **1** |
| **claude-grok-answer** (co-work) | 86 | 85 | **85.5** | **2** |
| **grok-answer** (solo) | 81 | 80 | **80.5** | **3** |

Two things stand out:
1. **Unanimous order, tight scores.** Independent Claude and Grok graders landed on
   the same 1-2-3 and within 3 points — the quality signal is robust, not a coin flip.
2. **Grok graded honestly against itself.** It ranked Claude's solo answer #1 and its
   own solo answer #3, and named concrete defects in its own code. That is the single
   best evidence the scores aren't self-serving.
3. **The two raters caught *different* real defects** in grok-answer (I found the
   stock double-decrement; Grok found claim-ignores-expiry + no pharmacy check). Two
   graders > one: neither alone had the full picture.

**Verdict:** for this problem, **Claude solo produced the best answer**, the
**collaboration came second** (cleaner than Grok-solo but not as deep as Claude-solo),
and **Grok solo third** (correct and tested, but thinner sketches and a couple of real
invariant gaps). Note the co-work did *not* beat the best solo — worth discussing why
(the design was mine, but Grok's implementation made a documented step-down from the
ideal, and I did not aggressively re-architect on review).
