# DESIGN — Prescription Fulfillment Service

## 1. Bounded context & why

**Prescription Fulfillment** is one bounded context in the telehealth platform.
Its job and its language: an electronic prescription (**Rx**) moves through a
lifecycle — a pharmacy **claims** it, **dispenses** it (drawing down inventory),
and **ships** it to the patient. Everything that upholds *fulfillment* invariants
lives here.

Deliberately **out** of this context (integrated via ports/events, not owned):

- **Prescribing / clinical** — how a doctor decides on a drug. We accept an Rx as
  a fact; we do not re-adjudicate clinical appropriateness.
- **Inventory / warehouse** — the source of truth for stock levels. We *reserve /
  decrement* through a `StockPort`; we do not manage receiving, cycle counts, etc.
- **Billing, shipping-carrier, patient-notification** — downstream consumers of
  the `prescription.dispensed` event.
- **Identity / AuthN** — who the caller is. We consume a verified principal; we
  enforce *authorization rules* that are intrinsic to the domain (a pharmacy can
  only dispense what it claimed).

Why draw the line here: the fulfillment invariants (single-claim, exactly-once
stock, controlled-substance approval, legal lifecycle) are highly cohesive and
change together. Inventory truth and clinical rules change for entirely different
reasons and at different cadences, so they are separate contexts reached through
anti-corruption ports.

The **aggregate root is `Rx`**, with `LineItem` as a value object. Consistency
boundary = one Rx: all its invariants are enforced within a single Rx transaction.
Cross-aggregate effects (stock, downstream) are reached through ports and made
eventually consistent via events + idempotency.

## 2. Hexagon: ports & adapters, and the domain boundary

```
                 ┌─────────────────────────────────────────────┐
   HTTP/gRPC ───▶│  app/ (use cases)   ClaimRx DispenseRx ShipRx │
   (driving)     │        │  orchestrate only, no business rules  │
                 │        ▼                                       │
                 │  domain/ (Rx aggregate, LineItem, events,      │
                 │           errors) — ALL invariants here        │
                 │        ▲                                       │
                 │  ports/ (interfaces) ──────────────┐           │
                 └────────┼───────────────────────────┼───────────┘
                          │ implemented by            │ (driven)
                 adapters/ InMemory* + Postgres sketch, EventPublisher,
                           StockPort, Clock, IdempotencyStore
```

- **Driving side** (left): a controller/handler translates a request into a
  use-case call. Not implemented here (framework-free per the brief) but the
  use-case input DTOs are the seam.
- **Application core** (`app/`): thin orchestration — load aggregate, invoke a
  domain method, coordinate ports (stock, repo, events), map results. **No
  business rule lives here.**
- **Domain** (`domain/`): the boundary. `Rx` is the only thing that decides
  whether a claim/dispense/ship is legal. Pure, no I/O, time injected.
- **Ports** (`ports/`): `RxRepository`, `EventPublisher`, `StockPort`, `Clock`,
  `IdempotencyStore`. The core depends only on these interfaces.
- **Adapters** (`adapters/`): `InMemory*` (used by tests + local) and a
  **Postgres sketch** (`adapters/postgres/`) showing the SQL that realizes the
  concurrency guarantees.

**The domain boundary is the `domain/` directory.** If a rule from the spec is
not enforced by a method on `Rx`, that is a bug. Controllers and adapters are
replaceable; the domain is not.

### Where each rule is enforced (all inside `Rx`)

| Rule | Enforced by |
|---|---|
| Rx shape, non-empty line items, valid window | `Rx.issue`, `LineItem.create` |
| No dispense without valid, unexpired Rx | `Rx.dispense` → `assertNotExpired`, transition table |
| Claim binds to one pharmacy; 2nd claim fails | `Rx.claim` → `AlreadyClaimedError` |
| Claim idempotent by (rxId, claimKey) | `Rx.claim` (same pharmacy+key ⇒ no-op) |
| Controlled ⇒ needs `pharmacistApprovalId` | `Rx.dispense` → `ControlledApprovalRequiredError` |
| Stock decremented exactly once | `StockPort` idempotent by rxId + optimistic `version` |
| `prescription.dispensed` emitted | `Rx.dispense` queues event; use case publishes post-save |
| Legal lifecycle only | `ALLOWED` transition table + `assertTransition` |

## 3. Event flow

1. `DispenseRx` loads the Rx, calls `rx.dispense(...)` which validates and, on
   success, **queues** a `prescription.dispensed` event inside the aggregate.
2. Stock is decremented (idempotent), then the aggregate is **saved durably**.
3. **Only after** the durable save does the use case drain events
   (`rx.pullEvents()`) and hand them to `EventPublisher`.
4. Downstream (billing, shipping, patient-notify) subscribe to
   `prescription.dispensed`.

In production `EventPublisher` is a **transactional outbox**: the event row is
written in the *same DB transaction* as the state change, and a relay ships it to
Kafka/SNS at-least-once. Consumers dedupe on `rxId`/event id. This closes the
"saved but event lost" and "event sent but not saved" gaps. The in-memory
publisher stands in for the outbox in tests.

## 4. Scalability (peak 10,000 Rx/min, read-heavy lookups)

10k Rx/min ≈ 167 writes/s of *new* Rx plus claim/dispense/ship transitions —
modest, but the design must stay correct under concurrency and skew.

- **Sharding / partitioning.** The Rx table is **hash-partitioned by `rxId`**
  (Postgres declarative partitioning, or Vitess/Citus-style horizontal shards).
  All of an Rx's mutations hit one shard, so the single-aggregate transaction and
  its optimistic-version CAS stay local — no cross-shard 2PC. Stock is a separate
  store partitioned by `drug_code`.
- **Read path (read-heavy status lookups).** Reads go to a **denormalized read
  model** (CQRS-lite) — a `rx_status` projection updated from the same events —
  and to **read replicas**. Hot status lookups are **cached** (Redis) keyed by
  `rxId`.
  - **Cache invalidation:** write-through on every successful transition — the
    use case updates/deletes the `rxId` cache key as part of publishing. Because
    every status change bumps `version`, cache entries are **versioned**
    (`rxId → {version, status}`); a stale replica read with a lower version is
    ignored/refetched. Short TTL (seconds) bounds staleness as a backstop. We
    never cache PHI-heavy payloads, only status + routing fields.
- **Exactly-once stock decrement under concurrency.** Two mechanisms compose:
  1. **Optimistic concurrency on the aggregate** — `save` is
     `UPDATE rx SET …, version=$new WHERE id=$id AND version=$expected`. Two
     concurrent dispensers of the same Rx both read version *N*; exactly one
     UPDATE matches (→ *N+1*), the other matches 0 rows → `ConcurrencyError`.
     So at most one dispense ever "wins" the state transition.
  2. **Idempotent stock ledger keyed by `rxId`** — decrement is
     `INSERT INTO stock_application(key) ON CONFLICT DO NOTHING` then a guarded
     `UPDATE stock SET available = available - q WHERE available >= q`. A replay
     (same `rxId`) inserts 0 rows and short-circuits, so inventory moves **once**
     even if a crash happens between "stock decremented" and "Rx saved". The
     `available >= q` predicate makes insufficient-stock a 0-row update →
     whole dispense fails, transaction rolls back, nothing partially applied.
  The domain state (`DISPENSED`) is the primary guard; the ledger is defense in
  depth for the crash window. Test
  *"exactly-once under concurrency"* exercises the race directly.
- **Idempotency strategy.**
  - **Claim** — idempotent by **(rxId, claimKey)**. The claim key is persisted on
    the aggregate; a retry (even after restart) reloads a `CLAIMED` Rx and the
    same key is a no-op, a *different* pharmacy/key fails. No extra store needed.
  - **Dispense** — idempotent by **(rxId, dispenseKey)** at the request layer via
    `IdempotencyStore` (Redis with TTL, or a unique-keyed table) so a client
    retry returns the *same response*; the stock ledger + aggregate state make
    the *effects* exactly-once regardless.
- **Backpressure / hot keys.** A single Rx is claimed/dispensed by one pharmacy,
  so per-aggregate contention is naturally low; the hot resource is **stock rows**
  for popular drugs — mitigated by the single-statement guarded decrement (no
  read-modify-write races) and, if needed, per-drug sharded counters.

## 5. Security (PHI, authz, validation, audit, secrets)

- **PHI protection.** Patient identity and the drug list are PHI. In storage,
  only routing columns (`id`, `patient_id`, `status`, timestamps) are in the
  clear; the sensitive payload (`doc`: line items, claim/dispense detail) is held
  as **application-encrypted JSONB** (envelope encryption via KMS data keys).
  Events carry **ids and minimal payload**, not full patient records; downstream
  re-hydrates through authorized reads. TLS in transit, encryption at rest.
  Multi-region: patients pinned to a region; cross-region replication only of
  what a region is permitted to hold (data-residency).
- **AuthZ (doctor / pharmacist / patient).** Enforced at two levels:
  - *Edge RBAC* (driving adapter): only a `prescriber` role may issue; only a
    `pharmacist`/`pharmacy` role may claim/dispense/ship; a `patient` may read
    only their own Rx.
  - *Domain-intrinsic authorization*: the aggregate enforces that the
    **dispensing pharmacy is the one that claimed** the Rx
    (`NotClaimedByPharmacyError`) — this is a business rule, so it lives in the
    domain, not the controller. Patient-scoping (a patient sees only their Rx) is
    enforced in the read model by filtering on `patient_id` from the token.
- **Input validation.** Value objects validate at the boundary of the domain:
  ids are non-empty (`ids.ts`), `LineItem` requires a positive-integer qty and a
  boolean `controlled`, `Rx.issue` requires ≥1 line item and `expiresAt >
  issuedAt`. Invalid input becomes a typed `ValidationError` before any state
  changes — no partially-built aggregates.
- **Audit.** Every transition bumps `version` and (via the outbox) produces an
  event; together with an append-only audit log of *who* (principal), *what*
  (use case + input hash), *when*, and *result*, this yields a tamper-evident
  trail — essential for controlled-substance dispensing (DEA/board scrutiny). The
  `pharmacistApprovalId` is recorded on the dispense record.
- **Secrets.** DB credentials, KMS keys, broker creds come from a secrets manager
  / workload identity — never in code, config files, or images. Rotation without
  redeploy. The code depends only on injected ports, so no secret is ever
  hard-coded in the core.

## 6. Assumptions & trade-offs

- **Assumptions.** One pharmacy fulfills a whole Rx (no split fulfillment).
  `pharmacistApprovalId` is produced by a separate approval workflow and passed
  in — we require its *presence* for controlled items, not re-verify its
  authenticity (that belongs to the approval context; here it is an audited
  reference). Stock reservation and decrement are collapsed into one step at
  dispense; a two-phase reserve-then-commit is a straightforward extension using
  the same idempotent ledger. Expiry is evaluated against an injected clock;
  materializing an `EXPIRED` status is a background sweep (`markExpired`), but
  dispense/claim also check expiry live so a not-yet-swept Rx is still rejected.
- **Trade-offs.**
  - *Optimistic vs pessimistic concurrency*: chose optimistic (version CAS) —
    lock-free, scales for low per-aggregate contention; the loser simply retries.
    Pessimistic `SELECT … FOR UPDATE` would serialize but adds lock-hold latency;
    unnecessary given one-pharmacy-per-Rx.
  - *Snapshot persistence vs full event-sourcing*: chose snapshot + optimistic
    version (simpler, fits read-heavy status lookups) while still emitting domain
    events for integration. Full event sourcing would give a perfect audit log
    but is heavier than this slice needs.
  - *Idempotency store for dispense*: adds a moving part (Redis/table) purely for
    a stable *response* on retry; the correctness of *effects* does not depend on
    it, so it can be dropped in a pinch without violating exactly-once.
  - *Type-stripped TypeScript*: run directly on Node with no build step (fast,
    zero deps) at the cost of using only erasable syntax (no enums / parameter
    properties). Worth it for a self-contained, instantly-runnable slice.
