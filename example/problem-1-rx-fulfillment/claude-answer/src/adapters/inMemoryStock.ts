/**
 * In-memory StockPort with an idempotency ledger.
 *
 * `decrement(key, lines)` is exactly-once per key:
 *  - replay of a known key returns the prior result with `alreadyApplied: true`
 *    and does NOT touch inventory again;
 *  - a first call checks availability for ALL lines and either decrements them
 *    all-or-nothing, or returns INSUFFICIENT_STOCK without changing anything.
 *
 * In production this maps to one atomic SQL statement (see the Postgres sketch)
 * so the check-and-decrement cannot interleave.
 */
import type { LineItemProps } from "../domain/lineItem.ts";
import type { StockPort, StockDecrementResult } from "../ports/index.ts";

export class InMemoryStock implements StockPort {
  private readonly available = new Map<string, number>();
  private readonly applied = new Map<string, StockDecrementResult>();

  constructor(initial: Record<string, number> = {}) {
    for (const [drug, qty] of Object.entries(initial)) {
      this.available.set(drug, qty);
    }
  }

  async decrement(
    idempotencyKey: string,
    lines: LineItemProps[],
  ): Promise<StockDecrementResult> {
    const prior = this.applied.get(idempotencyKey);
    if (prior) {
      // Idempotent replay. Only successful applications are recorded, so this is
      // always an ok result reported as alreadyApplied.
      return { ok: true, alreadyApplied: true };
    }

    // Aggregate requested qty per drug (a drug could appear on multiple lines).
    const requested = new Map<string, number>();
    for (const line of lines) {
      requested.set(line.drugCode, (requested.get(line.drugCode) ?? 0) + line.qty);
    }

    const shortfalls: { drugCode: string; requested: number; available: number }[] = [];
    for (const [drug, need] of requested) {
      const have = this.available.get(drug) ?? 0;
      if (have < need) shortfalls.push({ drugCode: drug, requested: need, available: have });
    }
    if (shortfalls.length > 0) {
      return { ok: false, reason: "INSUFFICIENT_STOCK", shortfalls };
    }

    for (const [drug, need] of requested) {
      this.available.set(drug, (this.available.get(drug) ?? 0) - need);
    }
    const result: StockDecrementResult = { ok: true, alreadyApplied: false };
    this.applied.set(idempotencyKey, result);
    return result;
  }

  /** Test helper. */
  availableFor(drugCode: string): number {
    return this.available.get(drugCode) ?? 0;
  }
}
