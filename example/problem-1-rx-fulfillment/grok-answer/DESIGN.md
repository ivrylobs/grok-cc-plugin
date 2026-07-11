# Prescription Fulfillment — Architecture Design

## Bounded context

**Prescription Fulfillment** owns the lifecycle of an electronic Rx from issuance
through claim, dispense, and ship. It does **not** own e-prescribing clinical
decision support, inventory master data as a system of record, billing, or last-
mile logistics — those are adjacent contexts that consume domain events.

**Why this boundary:** claim/dispense/ship share one consistency rule set (one
pharmacy, one stock decrement, controlled-substance gate, linear status machine).
Pulling inventory *levels* into this context would couple fulfillment to warehouse
ERP; instead we depend on a **Stock** port. Billing/shipping subscribe to
`prescription.dispensed` rather than sharing tables.

## Domain boundary

| Lives inside the domain (aggregate) | Lives outside (app / adapters) |
|-------------------------------------|--------------------------------|
| Status machine & illegal transitions | HTTP/RPC transport |
| Single-pharmacy claim + claimKey idempotency | Persistence, locking implementation |
| Expiry check at dispense | Wall-clock source (`Clock` port) |
| Controlled-substance approval requirement | AuthN/Z of who may supply approval |
| Emission of `prescription.dispensed` | Event bus / outbox transport |
| “Stock must be decremented before complete” flag | Actual qty mutation (`StockService`) |

Illegal states are hard to represent: status is a closed union; transitions go
through `canTransition`; value objects reject empty IDs / non-positive quantities.

## Ports

| Port | Responsibility |
|------|----------------|
| `PrescriptionRepository` | Load/save aggregate with optimistic version |
| `StockService` | Atomic multi-line decrement keyed by idempotency key |
| `EventPublisher` | Publish domain events after successful commit |
| `Clock` | Injectable time (testability + expiry) |

## Adapters (this slice)

| Port | Adapter |
|------|---------|
| Repository | `InMemoryPrescriptionRepository` (+ Postgres sketch with `UPDATE … WHERE version = $expected`) |
| Stock | `InMemoryStockService` (serialized + idempotency set) |
| Events | `InMemoryEventPublisher` |
| Clock | `SystemClock` / `FixedClock` |

## Use cases

1. **IssueRx** — create aggregate `ISSUED` (setup / doctor integration).
2. **ClaimRx** — bind `(pharmacyId, claimKey)`; domain enforces single pharmacy + idempotency.
3. **DispenseRx** — preflight domain rules → `StockService.decrementExactlyOnce` → domain `dispense` → save → publish `prescription.dispensed`.
4. **ShipRx** — `DISPENSED → SHIPPED` (idempotent re-ship).

## Event flow

```
Doctor → IssueRx → Rx(ISSUED)
Pharmacy → ClaimRx → Rx(CLAIMED)
Pharmacy → DispenseRx
   ├─ stock.decrementExactlyOnce(key=dispense:{rxId}:{dispenseKey})
   ├─ Rx.dispense() → status DISPENSED + domain event
   ├─ repo.save(expectedVersion)
   └─ publish prescription.dispensed
        ├─ Billing
        ├─ Shipping orchestration
        └─ Patient notify
Pharmacy → ShipRx → Rx(SHIPPED)
```

Prefer **transactional outbox** in production: write event row in the same DB
transaction as the Rx update; a relay publishes to the bus (at-least-once).
Consumers are idempotent on `(rxId, event type)`.

## Scalability (10k Rx/min, multi-region, read-heavy status)

### Partitioning / sharding

- **Write partition key:** `rx_id` (hash). All claim/dispense/ship for one Rx hit
  one shard → aggregate consistency without cross-shard transactions.
- **Claim fan-out:** pharmacies poll/search “open Rx” via a **read model**
  (CQRS) projected from events or CDC — not by scanning the write aggregate table.
- **Stock:** partition by `pharmacy_id` (inventory is local to a pharmacy).
  Dispense only touches the claiming pharmacy’s partition.

### Caching & invalidation

- **Hot path:** status-by-`rxId` is read-heavy. Cache snapshot
  `{status, pharmacyId, version, expiresAt}` in Redis with key `rx:{id}:status`.
- **Invalidation:** on every successful `save`, delete/overwrite cache entry
  (write-through or write-invalidate). Version in payload lets clients detect
  stale reads.
- **Do not cache PHI-heavy line items** in shared edge caches; keep drug list on
  the authoritative store or encrypt at rest with short TTL, authz-gated APIs.

### Exactly-once stock decrement under concurrency

Two cooperating mechanisms:

1. **Idempotency key** `dispense:{rxId}:{dispenseKey}` stored uniquely
   (`stock_ledger` / in-memory set). Retries with the same key are no-ops.
2. **Atomic multi-line check-and-decrement** (single mutex / single DB transaction
   with `qty >= requested` predicates). Insufficient stock fails the whole unit;
   nothing is partially decremented.
3. **Aggregate flag** `stockDecremented` + status `DISPENSED` so application
   retries after a successful stock write but failed Rx save still do not
   re-decrement (key already applied) and complete the domain transition safely.

Optimistic locking on `Prescription.version` prevents lost updates when two
workers race claim or dispense.

### Idempotency strategy

| Operation | Key | Behavior |
|-----------|-----|----------|
| Claim | `(rxId, claimKey)` | Same pharmacy+key → success no-op; other pharmacy → fail |
| Dispense | `dispenseKey` (+ rxId) | Stock ledger unique; re-entry after DISPENSED re-emits event, no stock change |
| Ship | implicit status | SHIPPED → SHIPPED no-op |

## Security

- **PHI:** `patientId`, drug list are PHI/sensitive. Encrypt at rest; TLS in
  transit; minimize logs (log `rxId` + status, never full line items in clear
  text at info level). Multi-region: keep data residency constraints in the
  repository adapter (region-pinned shards).
- **AuthZ:**
  - Doctor / eRx gateway: Issue only.
  - Pharmacist (pharmacy scope): Claim, Dispense (approval id must belong to
    authenticated pharmacist for controlled Rx), Ship.
  - Patient: read status of own Rx only (authz filter on `patientId`).
- **Input validation:** value objects at the domain edge; untrusted strings
  trimmed/non-empty; quantities positive integers.
- **Audit:** append-only audit log for claim/dispense/ship with actor id,
  pharmacy id, timestamp, correlation id (separate from domain event stream).
- **Secrets:** DB credentials, encryption keys via secret manager; never in repo.

## Trade-offs

| Choice | Benefit | Cost |
|--------|---------|------|
| Optimistic concurrency | High throughput, no long locks | Retries under contention |
| Stock outside aggregate | Clear inventory BC boundary | Distributed consistency; need idempotency keys |
| In-memory adapters for exam | Runnable tests, no infra | Not production-durable |
| At-least-once events + consumer idempotency | Simple publisher | Duplicate notifications possible without consumer keys |
| Linear status machine | Easy reasoning / audit | No partial fills / multi-pharmacy split fills |

## Assumptions

1. One dispense fulfills the entire Rx (no partial line fills in this slice).
2. `dispenseKey` is supplied by the client (or derived once per dispense intent).
3. Expiry is evaluated at dispense time against injectable `Clock` (no background
   sweeper required for correctness, though one may mark EXPIRED for UX).
4. `DISPENSED → CANCELLED` is allowed (e.g. recall before ship); `SHIPPED` and
   `EXPIRED` are terminal for cancel/expire respectively.
5. Stock service is trusted within the pharmacy’s partition; cross-pharmacy stock
   is out of scope.
