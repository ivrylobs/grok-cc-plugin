# Prescription Fulfillment Service

A hexagonal (ports & adapters) TypeScript slice implementing the three core use
cases — **ClaimRx**, **DispenseRx**, **ShipRx** — with every business rule
enforced inside the `Rx` aggregate.

## Run the tests

Requires **Node ≥ 22.6** (uses Node's native TypeScript type-stripping, so there
is **no build step and no dependencies**).

```bash
cd example/problem-1-rx-fulfillment/claude-answer
node --test test/*.test.ts
# or:
npm test
```

Expected: **33 tests, 0 fail.**

## Layout

```
src/
  domain/    Rx aggregate, LineItem, ids (branded), events, errors  ← all rules
  ports/     RxRepository, EventPublisher, StockPort, Clock, IdempotencyStore
  app/       IssueRx, ClaimRx, DispenseRx, ShipRx, GetRxStatus
  adapters/  InMemory* (used by tests) + adapters/postgres (SQL sketch)
test/        domain invariants + one file per use case
DESIGN.md    architecture, scalability, security, trade-offs
```

## Key decisions (5 lines)

1. **All invariants live on the `Rx` aggregate** (expiry, single-claim, controlled
   approval, legal-transition table); use cases only orchestrate — illegal states
   are unrepresentable.
2. **Exactly-once stock** = optimistic `version` compare-and-swap on the aggregate
   **+** a stock ledger idempotent by `rxId`; a concurrency test proves one winner
   and a single decrement.
3. **Idempotency**: claim by `(rxId, claimKey)` (persisted, replay = no-op);
   dispense by `(rxId, dispenseKey)` for a stable response, effects exactly-once
   regardless.
4. **Events after durable save** — `prescription.dispensed` is queued in the
   aggregate and published only post-save (transactional outbox in prod).
5. **Zero-dependency, no build** — erasable TypeScript run directly by
   `node --test`; a Postgres adapter sketch shows the SQL behind the guarantees.

## Which invariants the tests cover

- **Expiry** — cannot claim or dispense an expired Rx (`domain`, `claimRx`, `dispenseRx`).
- **Double-claim** — a second pharmacy is rejected; same `(pharmacy, claimKey)` replays as a no-op.
- **Controlled-without-approval** — rejected before stock is touched; with approval it dispenses.
- **Exactly-once stock** — retry stays decremented once; racing dispensers → one `ConcurrencyError`, stock moves once.
- **Insufficient stock** — fails the whole dispense; no transition, no persist, no event.
- **Illegal transitions** — dispense-before-claim, ship-before-dispense, claim-after-dispense, re-dispense, terminal states.
- **Use-case happy path** — full `ISSUED → CLAIMED → DISPENSED → SHIPPED` with one `prescription.dispensed` and one `prescription.shipped`.
