/**
 * Postgres sketch for RxRepository + the stock decrement. NOT exercised by the
 * test suite (no live DB); it shows exactly HOW the in-memory guarantees map to
 * SQL so the exactly-once and concurrency claims are real, not hand-waved.
 *
 * A tiny `SqlClient` abstraction stands in for `pg.Pool` / a transaction handle.
 */
import { Rx } from "../../domain/rx.ts";
import type { RxSnapshot } from "../../domain/rx.ts";
import { ConcurrencyError } from "../../domain/errors.ts";
import type {
  RxRepository,
  StockPort,
  StockDecrementResult,
} from "../../ports/index.ts";
import type { LineItemProps } from "../../domain/lineItem.ts";

export interface SqlClient {
  query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }>;
}

/*
Schema (DDL):

  CREATE TABLE rx (
    id             text PRIMARY KEY,
    patient_id     text NOT NULL,
    prescriber_id  text NOT NULL,
    status         text NOT NULL,
    issued_at      timestamptz NOT NULL,
    expires_at     timestamptz NOT NULL,
    -- PHI (line items, claim, dispense, shipping) held as an encrypted JSONB
    -- payload; only routing columns above are queried in the clear.
    doc            jsonb NOT NULL,
    version        integer NOT NULL DEFAULT 0
  );
  -- Read-heavy status lookups by patient/pharmacy:
  CREATE INDEX rx_patient_idx  ON rx (patient_id);
  CREATE INDEX rx_status_idx   ON rx (status);
  -- Partition by hash(id) across N shards for 10k Rx/min write throughput.

  CREATE TABLE stock (
    drug_code text PRIMARY KEY,
    available integer NOT NULL CHECK (available >= 0)
  );
  -- Idempotency ledger: one row per completed stock application.
  CREATE TABLE stock_application (
    idempotency_key text PRIMARY KEY,
    applied_at      timestamptz NOT NULL DEFAULT now()
  );
*/

export class PostgresRxRepository implements RxRepository {
  private readonly sql: SqlClient;
  constructor(sql: SqlClient) {
    this.sql = sql;
  }

  async load(id: string): Promise<Rx | null> {
    const { rows } = await this.sql.query<{ doc: RxSnapshot; version: number }>(
      `SELECT doc, version FROM rx WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return Rx.fromSnapshot({ ...rows[0].doc, version: rows[0].version });
  }

  /**
   * Optimistic concurrency via compare-and-swap on `version`. If a concurrent
   * transaction already advanced the row, the UPDATE matches 0 rows and we
   * raise ConcurrencyError — exactly one dispenser/claimer wins.
   */
  async save(rx: Rx, expectedVersion: number): Promise<void> {
    const snap = rx.toSnapshot();
    if (expectedVersion === 0) {
      // INSERT for a freshly issued Rx; PK collision => someone else inserted.
      await this.sql.query(
        `INSERT INTO rx (id, patient_id, prescriber_id, status, issued_at, expires_at, doc, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          snap.id, snap.patientId, snap.prescriberId, snap.status,
          snap.issuedAt, snap.expiresAt, snap, snap.version,
        ],
      );
      return;
    }
    const { rowCount } = await this.sql.query(
      `UPDATE rx SET status = $2, doc = $3, version = $4
         WHERE id = $1 AND version = $5`,
      [snap.id, snap.status, snap, snap.version, expectedVersion],
    );
    if (rowCount === 0) throw new ConcurrencyError(snap.id);
  }
}

/**
 * Postgres StockPort. The whole check-decrement-and-record runs in ONE
 * statement-group inside the caller's transaction. The idempotency ledger
 * insert (ON CONFLICT DO NOTHING) is what makes it exactly-once: a replay of the
 * same key inserts 0 rows and we short-circuit without decrementing again.
 */
export class PostgresStock implements StockPort {
  private readonly sql: SqlClient;
  constructor(sql: SqlClient) {
    this.sql = sql;
  }

  async decrement(
    idempotencyKey: string,
    lines: LineItemProps[],
  ): Promise<StockDecrementResult> {
    // 1) Claim the idempotency key. 0 rows => already applied => replay.
    const claim = await this.sql.query(
      `INSERT INTO stock_application (idempotency_key) VALUES ($1)
         ON CONFLICT (idempotency_key) DO NOTHING`,
      [idempotencyKey],
    );
    if (claim.rowCount === 0) return { ok: true, alreadyApplied: true };

    // 2) Conditional decrement per drug. `WHERE available >= $qty` guarantees we
    //    never go negative; a 0-row update means insufficient stock -> the
    //    surrounding transaction is ROLLED BACK by the caller, releasing the
    //    idempotency key too, so a later retry can succeed once restocked.
    const requested = new Map<string, number>();
    for (const l of lines) requested.set(l.drugCode, (requested.get(l.drugCode) ?? 0) + l.qty);

    const shortfalls: { drugCode: string; requested: number; available: number }[] = [];
    for (const [drug, need] of requested) {
      const upd = await this.sql.query(
        `UPDATE stock SET available = available - $2
           WHERE drug_code = $1 AND available >= $2`,
        [drug, need],
      );
      if (upd.rowCount === 0) {
        const cur = await this.sql.query<{ available: number }>(
          `SELECT available FROM stock WHERE drug_code = $1`,
          [drug],
        );
        shortfalls.push({
          drugCode: drug,
          requested: need,
          available: cur.rows[0]?.available ?? 0,
        });
      }
    }
    if (shortfalls.length > 0) {
      return { ok: false, reason: "INSUFFICIENT_STOCK", shortfalls };
    }
    return { ok: true, alreadyApplied: false };
  }
}
