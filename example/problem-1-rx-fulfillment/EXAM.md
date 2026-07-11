# Exam — Problem 1: Prescription Fulfillment Service (substantial)

You are designing and implementing a **Prescription Fulfillment** service for a
telehealth platform. Deliver both an architecture design and a working
implementation slice. Stack: **TypeScript (Node ≥ 20), hexagonal / ports-and-
adapters**, stdlib + minimal deps (a test runner is fine; no framework required).

## The domain

A doctor issues an electronic prescription (Rx) for a patient. A pharmacy then
**claims** it, **dispenses** it, and **ships** it to the patient.

Business rules (enforce these in the domain, not in controllers):
1. An Rx has: id, patientId, prescriberId, list of line items (drug code, qty,
   whether the drug is **controlled**), issuedAt, expiresAt, status.
2. **No dispense without a valid, unexpired Rx.** An expired or already-dispensed
   Rx cannot be dispensed.
3. A **claim** binds an Rx to exactly one pharmacy. A second pharmacy claiming an
   already-claimed Rx must fail. Claims are **idempotent** by (rxId, claimKey).
4. **Controlled substances** require an extra `pharmacistApprovalId` before
   dispense; non-controlled do not.
5. On dispense, **stock for each line item is decremented exactly once**, even
   under retries/concurrency. Insufficient stock fails the whole dispense.
6. Dispensing emits a **`prescription.dispensed`** domain event (rxId, pharmacyId,
   line items, timestamp) for downstream (billing, shipping, patient notify).
7. Lifecycle: `ISSUED → CLAIMED → DISPENSED → SHIPPED` (plus terminal `EXPIRED`,
   `CANCELLED`). Illegal transitions must be rejected.

## Scale & non-functionals

- Peak **10,000 Rx/min**, many pharmacies, read-heavy status lookups.
- Multi-region patients; PHI (patient identity, drug list) is sensitive.

## Required deliverables (all of them)

Write everything under **the answer directory you are told to use**:

1. `DESIGN.md` — the architecture: bounded context & why; the ports and adapters;
   where the domain boundary is; the event flow; **scalability** (what you shard/
   partition, what you cache + how you invalidate, how you get exactly-once stock
   decrement under concurrency, idempotency strategy for claim & dispense); and
   **security** (PHI protection, authz for doctor/pharmacist/patient, input
   validation, audit, secrets). Reason about trade-offs.
2. `src/domain/` — entities, value objects, the Rx aggregate enforcing every rule
   above; illegal states hard to represent.
3. `src/ports/` — the interfaces (repositories, event publisher, stock, clock).
4. `src/app/` — use cases. Implement **all 3 core use cases**: `ClaimRx`,
   `DispenseRx`, `ShipRx` (plus whatever issuing/query you need).
5. `src/adapters/` — at least one real adapter per port (in-memory repo is fine;
   a Postgres sketch for the repo + how concurrency/locking works earns more).
6. `test/` — tests for the invariants (expiry, double-claim, controlled-without-
   approval, exactly-once stock, illegal transitions) AND the use cases. They must
   run with `node --test` (or state the exact command).
7. `README.md` — how to run the tests, and a 5-line summary of your key decisions.

## Rules of the exam

- Work **alone** unless told otherwise. Do not read any sibling answer directory.
- Prefer correctness and clarity over volume. A smaller thing that runs and
  enforces the invariants beats a large thing that doesn't.
- State assumptions explicitly in DESIGN.md.
- When done, ensure your tests actually run and say so in the README.
