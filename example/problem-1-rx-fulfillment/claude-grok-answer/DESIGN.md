# Prescription Fulfillment — Design (Claude + Grok collaboration)

**Authoring split:** Claude wrote this design and the invariant strategy; Grok
implements the domain/app/adapters/tests against it; both cross-review. Sections
tagged `[review:*]` note who hardened what after the first pass.

## 1. Bounded context

**Fulfillment** is its own bounded context, distinct from *Prescribing* (how an
Rx comes to exist) and *Inventory* (the source of truth for stock) and *Shipping*
(carrier integration). We own the Rx **fulfillment lifecycle** and treat the
others as upstream/downstream via ports:

- Prescribing is upstream: we receive an already-issued Rx (an anti-corruption
  boundary maps their payload to our `Prescription` aggregate).
- Inventory is a **port** (`StockPort`) — we do not own stock rows; we *reserve/
  decrement* through it. This keeps the exactly-once concern where the data lives.
- Shipping and billing are downstream: they react to our `prescription.dispensed`
  event. We never call them synchronously.

Rationale: the invariant that actually matters here — "an Rx is dispensed at most
once, decrementing stock exactly once" — lives entirely inside Fulfillment, so it
is the aggregate boundary. Everything else is I/O behind a port.

## 2. Hexagon

```
            (driving adapters)                 (driven adapters)
  HTTP / queue handler ─▶  APPLICATION  ─▶  ports ─▶  Postgres repo
                          (use cases)              ─▶  StockPort (inventory)
                               │                   ─▶  EventPublisher (outbox)
                               ▼                   ─▶  Clock
                            DOMAIN
                     (Prescription aggregate,
                      value objects, invariants)
```

- **Domain** depends on nothing. No imports from ports/adapters/node libs beyond
  language primitives.
- **Ports** are interfaces owned by the application layer (dependency inversion):
  `PrescriptionRepository`, `StockPort`, `EventPublisher`, `Clock`,
  `ApprovalPort`.
- **Adapters** implement ports. We ship an in-memory repo + an in-memory stock/
  event bus for tests, and a **Postgres repo sketch** showing the concurrency
  control (below). Driving side: a thin use-case invoker (framework-free).

## 3. Domain model & invariants (the core)

`Prescription` is the aggregate root. State is a discriminated union on `status`
so **illegal states are unrepresentable** — e.g. only a `Claimed` prescription
exposes `dispense()`, only `Issued` exposes `claim()`.

Value objects: `RxId`, `PharmacyId`, `PatientId`, `LineItem { DrugCode, Qty,
controlled }`, `ClaimKey`. Construction validates (no negative qty, non-empty
lines) so an invalid VO cannot exist.

Invariant enforcement (all in the aggregate, returning Result/throwing domain
errors — never in a controller):

| Rule | Where enforced |
|------|----------------|
| No dispense of expired Rx | `dispense()` checks `expiresAt` vs injected `now` (Clock port passed in — domain stays pure/deterministic). |
| No dispense of non-`CLAIMED` | Only the `Claimed` state has `dispense()`; transition guard rejects others. |
| Single-pharmacy claim | `claim()` only valid from `Issued`; sets `pharmacyId`; re-claim by another pharmacy → `AlreadyClaimed`. |
| Idempotent claim by (rxId, claimKey) | Aggregate records `claimKey`; a repeat with the same key is a no-op success; a different key on a claimed Rx fails. **[review:claude]** idempotency belongs to the aggregate, not the DB, so it holds across adapters. |
| Controlled needs approval | `dispense(approval?)` — if any line `controlled` and no valid `pharmacistApprovalId`, `ApprovalRequired`. |
| Exactly-once stock decrement | See §4 — the aggregate is the single writer of `DISPENSED`; the app layer decrements stock **inside the same transaction/optimistic-version bump** that persists the DISPENSED state. Retries re-read the now-DISPENSED aggregate and short-circuit. |
| Legal transitions only | `ISSUED→CLAIMED→DISPENSED→SHIPPED`, terminal `EXPIRED`/`CANCELLED`; a central `assertTransition` + per-state methods. |

## 4. Exactly-once dispense & idempotency (the hard part) [review:claude]

Two writes must be atomic: (a) the aggregate → `DISPENSED`, (b) stock decrement.
Strategy, in order of the design we implement:

1. **Aggregate carries a `version`.** Persisting a state change is a compare-and-
   swap: `UPDATE ... WHERE id=? AND version=?`. Zero rows updated ⇒ someone else
   moved it ⇒ reload and re-evaluate (optimistic concurrency). This makes
   "dispense" safe under concurrent callers — exactly one wins the CAS.
2. **Idempotency of the *command*.** `DispenseRx` takes an idempotency key; a
   `processed_commands` unique row (or the aggregate already being `DISPENSED`)
   makes a retry a no-op returning the first result.
3. **Stock decrement in the same unit of work.** In the Postgres adapter, the
   DISPENSED CAS and `StockPort.decrement` run in one transaction; if stock is
   insufficient the tx rolls back and the aggregate is *not* advanced. With an
   external inventory service instead of a shared DB, we use a **reservation**:
   reserve at claim/queue time, commit-decrement on dispense, keyed by rxId so the
   inventory side is itself idempotent (the outbox delivers the decrement once).
4. **Event via transactional outbox.** `prescription.dispensed` is written to an
   `outbox` row in the same tx as DISPENSED, then relayed. Guarantees the event
   iff the state actually changed — no dual-write gap.

## 5. Scalability (10k Rx/min)

- **Partition/shard by `rxId`** (hash). All invariants are single-aggregate, so
  there are no cross-shard transactions — the system scales horizontally cleanly.
- **Read-heavy status lookups:** cache `rx:{id} → {status,pharmacyId,version}` in
  Redis, **invalidated by version** — a reader that sees a stale version re-reads;
  writes bump version so the cache key’s value is self-dating. TTL as a backstop.
- 10k/min ≈ 167 writes/s — trivial per shard; the design is about *correctness
  under concurrency*, not raw throughput, so the CAS + outbox matter more than
  sharding math. Stated honestly rather than inflated.
- Dispense is the only contended path; claim/ship are single-writer by lifecycle.

## 6. Security (PHI)

- **PHI minimization:** the aggregate holds `patientId` (opaque ref), not patient
  demographics; the drug list is PHI → encrypted at rest (column-level), never in
  logs or events (the event carries drug *codes* + rxId, consumed by trusted
  billing/shipping, not the patient-facing channel).
- **AuthZ at the boundary (driving adapter), coarse checks echoed in the app:**
  doctor may issue; pharmacist (of the claiming pharmacy) may claim/dispense;
  patient may only read *their own* Rx. Pharmacist approval for controlled drugs
  is a distinct capability (`ApprovalPort`), not the same as dispense rights.
- **Input validation** happens making value objects — the boundary parses into
  VOs; anything malformed never reaches the domain.
- **Audit:** every state transition appends an immutable audit record (who, what,
  when, prev→next) — required for controlled substances anyway.
- **Secrets** (DB creds, encryption keys) via env/secret manager, never in tree.
- **Replay/idempotency** (above) doubles as defense against duplicate-submit.

## 7. Assumptions

- Inventory is authoritative for stock; we reserve/decrement through it.
- One Rx = one pharmacy = one dispense event (partial dispense is out of scope,
  stated as a boundary).
- Clock is injected so the domain is deterministic and testable.
