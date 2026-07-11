/**
 * Postgres repository sketch — DESIGN.md §4
 *
 * Shows version CAS + transactional outbox. Not executed in tests (no DB);
 * documents the production unit of work for exactly-once dispense.
 *
 * Schema (illustrative):
 *
 *   CREATE TABLE prescriptions (
 *     id            TEXT PRIMARY KEY,
 *     patient_id    TEXT NOT NULL,
 *     prescriber_id TEXT NOT NULL,
 *     line_items    JSONB NOT NULL,          -- encrypted at rest in prod
 *     issued_at     TIMESTAMPTZ NOT NULL,
 *     expires_at    TIMESTAMPTZ NOT NULL,
 *     status        TEXT NOT NULL,
 *     pharmacy_id   TEXT,
 *     claim_key     TEXT,
 *     pharmacist_approval_id TEXT,
 *     dispense_idempotency_key TEXT,
 *     version       INT NOT NULL DEFAULT 0,
 *     UNIQUE (id, claim_key) -- optional; idempotency lives on aggregate
 *   );
 *
 *   CREATE TABLE outbox (
 *     id          BIGSERIAL PRIMARY KEY,
 *     event_type  TEXT NOT NULL,
 *     payload     JSONB NOT NULL,
 *     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     published_at TIMESTAMPTZ
 *   );
 *
 *   CREATE TABLE processed_commands (
 *     idempotency_key TEXT PRIMARY KEY,
 *     result_rx_id    TEXT NOT NULL,
 *     created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
 *   );
 */

import type { Prescription } from "../domain/prescription.ts";
import type { DomainEvent } from "../domain/events.ts";
import type { RxId } from "../domain/value-objects.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";
import type { StockPort } from "../ports/stock-port.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";

/** Minimal SQL client surface — pg / postgres.js / etc. */
export interface SqlClient {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
}

export interface TxClient extends SqlClient {
  /** Run fn inside BEGIN…COMMIT; ROLLBACK on throw. */
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

/**
 * CAS save:
 *   UPDATE prescriptions SET …, version = version + 1
 *   WHERE id = $1 AND version = $2
 * Zero rows → ConcurrencyError (caller reloads).
 */
export class PostgresPrescriptionRepository implements PrescriptionRepository {
  private readonly db: TxClient;

  constructor(db: TxClient) {
    this.db = db;
  }

  async getById(_id: RxId): Promise<Prescription | null> {
    void this.db;
    // SELECT … WHERE id = $1 → rehydrate snapshot
    throw new Error("sketch only — wire to real driver");
  }

  async insert(_rx: Prescription): Promise<void> {
    void this.db;
    throw new Error("sketch only — wire to real driver");
  }

  async save(rx: Prescription, expectedVersion: number): Promise<void> {
    void this.db;
    void rx;
    void expectedVersion;
    // const r = await this.db.query(
    //   `UPDATE prescriptions SET
    //      status = $1, pharmacy_id = $2, claim_key = $3,
    //      pharmacist_approval_id = $4, dispense_idempotency_key = $5,
    //      version = version + 1
    //    WHERE id = $6 AND version = $7`,
    //   [rx.status, …, rx.id.value, expectedVersion],
    // );
    // if (r.rowCount === 0) throw new ConcurrencyError();
    throw new Error("sketch only — wire to real driver");
  }
}

/**
 * Outbox publisher: insert rows in the same transaction as the state change.
 * A separate relay process reads unpublished rows and pushes to the bus.
 */
export class PostgresOutboxPublisher implements EventPublisher {
  private readonly tx: SqlClient;

  constructor(tx: SqlClient) {
    this.tx = tx;
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    void this.tx;
    for (const e of events) {
      void e;
      // await this.tx.query(
      //   `INSERT INTO outbox (event_type, payload) VALUES ($1, $2)`,
      //   [e.type, JSON.stringify(e)],
      // );
    }
    throw new Error("sketch only — wire to real driver");
  }
}

/**
 * Production dispense unit of work (same transaction):
 *   BEGIN
 *     -- optional: INSERT processed_commands (idempotency_key) ON CONFLICT DO NOTHING
 *     --   if conflict → return prior result
 *     UPDATE prescriptions … WHERE id=? AND version=?  -- CAS to DISPENSED
 *     -- stock: either local inventory UPDATE … WHERE qty >= need, or
 *     --        call inventory with idempotency key = rxId (reservation model)
 *     INSERT INTO outbox … prescription.dispensed
 *   COMMIT
 *
 * Failure of stock or CAS → ROLLBACK → aggregate not advanced, no event.
 */
export async function dispenseUnitOfWorkSketch(
  db: TxClient,
  stock: StockPort,
  rx: Prescription,
  expectedVersion: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. CAS state
    const snap = rx.toSnapshot();
    const cas = await tx.query(
      `UPDATE prescriptions SET status = $1, version = version + 1,
              pharmacist_approval_id = $2, dispense_idempotency_key = $3
       WHERE id = $4 AND version = $5 AND status = 'CLAIMED'`,
      [
        snap.status,
        snap.pharmacistApprovalId ?? null,
        snap.dispenseIdempotencyKey ?? null,
        snap.id,
        expectedVersion,
      ],
    );
    if (cas.rowCount === 0) {
      throw new Error("CAS conflict or illegal status");
    }

    // 2. Stock (local table or remote idempotent by rxId)
    const ok = await stock.decrement(
      snap.id,
      snap.lineItems.map((i) => ({ drugCode: i.drugCode, qty: i.qty })),
    );
    if (!ok) throw new Error("insufficient stock");

    // 3. Outbox
    const events = rx.pullEvents();
    for (const e of events) {
      await tx.query(
        `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
        [e.type, JSON.stringify(e)],
      );
    }
  });
}
