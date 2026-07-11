# Prescription Fulfillment (Claude + Grok collaboration)

## Run tests

```bash
cd example/problem-1-rx-fulfillment/claude-grok-answer
npm test
# equivalent:
node --experimental-strip-types --test test/**/*.test.ts
```

Requires **Node ≥ 20** (tested on Node 22). No install step — stdlib + `node:test` only.

## Key decisions (5 lines)

1. **Hexagonal slice:** pure domain aggregate; ports for repo/stock/events/clock/approvals; in-memory adapters for tests + Postgres CAS/outbox sketch.
2. **Illegal states hard:** lifecycle methods guard `status`; claim idempotent on `(pharmacyId, claimKey)`; controlled lines require approval id.
3. **Exactly-once stock:** aggregate is single writer of `DISPENSED` via version CAS; stock decrement is keyed by `rxId` so concurrent retries never double-subtract.
4. **Clock injected** (`FixedClock` in tests) — domain never calls `Date.now()`.
5. **Events:** `prescription.dispensed` (and claim/ship) raised on the aggregate, published after successful persist (outbox in Postgres sketch).
