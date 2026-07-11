# Prescription Fulfillment (exam answer)

Hexagonal TypeScript slice: domain-enforced Rx lifecycle (claim → dispense → ship),
in-memory adapters, and `node --test` coverage of every invariant.

## Run tests

Requires **Node ≥ 20** (developed on Node 22; uses native TypeScript strip-types).

```bash
cd example/problem-1-rx-fulfillment/grok-answer
node --experimental-strip-types --test test/**/*.test.ts
```

Or: `npm test`

**Verification (this submission):**  
Command: `node --experimental-strip-types --test test/**/*.test.ts`  
Result: `# tests 26 # pass 26 # fail 0` (domain 16 + use cases 10).

## Key decisions (5 lines)

1. **Prescription aggregate** owns status transitions, claim idempotency, expiry, controlled approval, and `prescription.dispensed` emission — not controllers.
2. **Stock is a port** with `decrementExactlyOnce(idempotencyKey)` so retries never double-decrement; multi-line is all-or-nothing.
3. **Optimistic `version`** on the repository prevents lost updates under concurrent claim/dispense.
4. **DispenseRx** preflights domain rules, then stock, then domain transition + event publish (idempotent if already DISPENSED).
5. **In-memory adapters** for runnable tests; Postgres sketch documents `UPDATE … WHERE version = $expected` and stock ledger uniqueness.
