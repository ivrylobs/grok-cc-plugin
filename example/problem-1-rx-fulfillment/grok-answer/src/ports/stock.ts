import type { DrugCode, PharmacyId } from "../domain/value-objects.ts";

export interface StockLine {
  readonly drugCode: DrugCode | string;
  readonly quantity: number;
}

/**
 * Stock port. Decrement is keyed by idempotencyKey so retries never double-decrement.
 * Implementations must make the whole multi-line decrement atomic (all-or-nothing).
 */
export interface StockService {
  getAvailable(
    pharmacyId: PharmacyId | string,
    drugCode: DrugCode | string,
  ): Promise<number>;

  /**
   * Atomically decrement all lines if every line has enough stock.
   * If idempotencyKey was already applied, return { applied: false, alreadyApplied: true }
   * without changing stock again.
   * If stock is insufficient, throw InsufficientStockError and change nothing.
   */
  decrementExactlyOnce(params: {
    pharmacyId: PharmacyId | string;
    lines: ReadonlyArray<StockLine>;
    idempotencyKey: string;
  }): Promise<{ applied: boolean; alreadyApplied: boolean }>;
}
