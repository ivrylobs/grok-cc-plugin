/**
 * Postgres adapter sketch (not executed in tests).
 *
 * Schema (partition / shard key = rx_id for write locality; optional
 * hash-partition of prescriptions by rx_id for 10k Rx/min write fan-out):
 *
 *   CREATE TABLE prescriptions (
 *     id              TEXT PRIMARY KEY,
 *     patient_id      TEXT NOT NULL,
 *     prescriber_id   TEXT NOT NULL,
 *     line_items      JSONB NOT NULL,
 *     issued_at       TIMESTAMPTZ NOT NULL,
 *     expires_at      TIMESTAMPTZ NOT NULL,
 *     status          TEXT NOT NULL,
 *     pharmacy_id     TEXT,
 *     claim_key       TEXT,
 *     pharmacist_approval_id TEXT,
 *     dispensed_at    TIMESTAMPTZ,
 *     shipped_at      TIMESTAMPTZ,
 *     stock_decremented BOOLEAN NOT NULL DEFAULT FALSE,
 *     version         INT NOT NULL DEFAULT 0,
 *     UNIQUE (id, claim_key) -- supports claim idempotency lookups
 *   );
 *
 *   -- Secondary uniqueness: only one claim_key per rx when claimed
 *   CREATE UNIQUE INDEX ux_rx_claim_key ON prescriptions (id, claim_key)
 *     WHERE claim_key IS NOT NULL;
 *
 * Optimistic concurrency (exactly-once transition under concurrent claim/dispense):
 *
 *   UPDATE prescriptions
 *      SET status = $1, pharmacy_id = $2, claim_key = $3, version = version + 1, ...
 *    WHERE id = $id AND version = $expectedVersion;
 *   -- rowCount === 0 → ConcurrentModificationError → retry/reload
 *
 * Claim race (two pharmacies):
 *   - Both load ISSUED version=0
 *   - First UPDATE wins (version 0→1, status CLAIMED)
 *   - Second UPDATE matches 0 rows → ConcurrentModificationError
 *   - On retry, reloaded row is CLAIMED → domain throws AlreadyClaimedError
 *
 * Stock (separate service / table), exactly-once decrement:
 *
 *   BEGIN;
 *   INSERT INTO stock_ledger (idempotency_key, pharmacy_id, payload)
 *     VALUES ($key, $pharmacy, $lines)
 *     ON CONFLICT (idempotency_key) DO NOTHING;
 *   -- if insert happened:
 *   UPDATE pharmacy_stock SET qty = qty - line.qty
 *     WHERE pharmacy_id = $p AND drug_code = $d AND qty >= line.qty;
 *   -- if any line fails: ROLLBACK
 *   COMMIT;
 *
 * PHI: patient_id / line_items encrypted at rest (column encryption or app-level
 * envelope); access via row-level security / service authz, never log line_items.
 */

export const POSTGRES_SKETCH = true;
