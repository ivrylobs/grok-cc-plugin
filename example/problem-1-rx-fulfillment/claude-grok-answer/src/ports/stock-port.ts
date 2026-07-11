/**
 * Inventory is authoritative. Decrement is idempotent by rxId so retries
 * never double-decrement. Returns false / throws if insufficient stock.
 */
export interface StockPort {
  /**
   * Decrement stock for each line once per rxId.
   * @returns true if applied or already applied for this rxId; false if
   * insufficient (and no partial apply).
   */
  decrement(
    rxId: string,
    items: Array<{ drugCode: string; qty: number }>,
  ): Promise<boolean>;

  /** Test/ops helper — not required for production inventory. */
  available?(drugCode: string): Promise<number>;
}
