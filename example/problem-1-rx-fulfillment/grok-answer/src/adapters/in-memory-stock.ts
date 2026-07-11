import { InsufficientStockError } from "../domain/errors.ts";
import type { StockLine, StockService } from "../ports/stock.ts";

/**
 * In-memory stock with:
 * - per-pharmacy mutex (serialized decrements)
 * - idempotency key set so the same key never double-decrements
 * - all-or-nothing multi-line decrement
 */
export class InMemoryStockService implements StockService {
  /** pharmacyId -> drugCode -> qty */
  private readonly levels = new Map<string, Map<string, number>>();
  private readonly appliedKeys = new Set<string>();
  private chain: Promise<void> = Promise.resolve();

  seed(pharmacyId: string, drugCode: string, quantity: number): void {
    let byDrug = this.levels.get(pharmacyId);
    if (!byDrug) {
      byDrug = new Map();
      this.levels.set(pharmacyId, byDrug);
    }
    byDrug.set(drugCode, quantity);
  }

  async getAvailable(pharmacyId: string, drugCode: string): Promise<number> {
    return this.levels.get(pharmacyId)?.get(drugCode) ?? 0;
  }

  async decrementExactlyOnce(params: {
    pharmacyId: string;
    lines: ReadonlyArray<StockLine>;
    idempotencyKey: string;
  }): Promise<{ applied: boolean; alreadyApplied: boolean }> {
    return this.#serialized(async () => {
      if (this.appliedKeys.has(params.idempotencyKey)) {
        return { applied: false, alreadyApplied: true };
      }

      // Validate all lines first (all-or-nothing).
      for (const line of params.lines) {
        const available =
          this.levels.get(params.pharmacyId)?.get(String(line.drugCode)) ?? 0;
        if (available < line.quantity) {
          throw new InsufficientStockError(
            String(line.drugCode),
            line.quantity,
            available,
          );
        }
      }

      for (const line of params.lines) {
        const byDrug = this.levels.get(params.pharmacyId)!;
        const code = String(line.drugCode);
        byDrug.set(code, byDrug.get(code)! - line.quantity);
      }

      this.appliedKeys.add(params.idempotencyKey);
      return { applied: true, alreadyApplied: false };
    });
  }

  /** Test helper: how many times a key was recorded (0 or 1). */
  wasApplied(idempotencyKey: string): boolean {
    return this.appliedKeys.has(idempotencyKey);
  }

  clear(): void {
    this.levels.clear();
    this.appliedKeys.clear();
  }

  #serialized<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.chain.then(() => fn());
    // Keep chain alive even if fn rejects.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
