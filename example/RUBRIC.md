# Benchmark scoring rubric (shared by both raters)

Each answer is scored out of **100**, by criterion. Score on the artifact as
delivered — do not give credit for things "implied but not written."

| # | Criterion | Weight | What earns the points |
|---|-----------|-------:|-----------------------|
| 1 | **Architecture & design** | 25 | Correct bounded context; genuine ports-and-adapters (domain depends on nothing outward; adapters implement ports); sound event design; clear boundaries; the DESIGN.md reasons about trade-offs, not just describes. |
| 2 | **Domain modeling & invariants** | 20 | Rich domain (not anemic); value objects; every stated business rule enforced *inside* the domain; illegal states unrepresentable; idempotency + exactly-once modeled where required. |
| 3 | **Clean code & maintainability** | 15 | Naming, cohesion, SRP, small focused units, idiomatic TypeScript, no dead flexibility, readable without the author present. |
| 4 | **Scalability & performance** | 15 | Concrete: where to shard/partition, what to cache & invalidation, concurrency control (locks/optimistic/versioning), idempotency keys, realistic reasoning about the stated peak load. |
| 5 | **Security** | 15 | PHI/PII handling, authz model, input validation at the boundary, audit trail, secrets handling, injection/replay defenses — concrete, not "we'd add auth." |
| 6 | **Testing & correctness** | 10 | Tests exist for the invariants AND the use cases; they run; they'd actually catch a regression. Bonus clarity if a test encodes an invariant. |

**Total: 100.**

Rating protocol:
- Two independent raters (Claude, Grok) score all three answers on this rubric.
- Rate the code as it is; if something doesn't run, say so and dock criterion 6.
- Each rater notes, per answer, its single strongest and single weakest point.
- **Self-bias disclosure:** each rater is scoring one answer it (co-)authored.
  Both raters must explicitly flag that and justify any score given to their own
  answer against the same bar as the others. Divergences between the two raters'
  scores are reported, not averaged away.

Separately from quality, each condition is measured for **cost**: wall-clock
time, rough token/effort, and number of human interventions (permission answers,
course corrections).
