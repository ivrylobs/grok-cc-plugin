import type { StockPort } from "../ports/stock-port.ts";

/**
 * In-memory stock. Decrement is exactly-once per rxId: concurrent callers
 * with the same rxId only subtract inventory on the first successful apply.
 */
export class InMemoryStock implements StockPort {
  private readonly levels = new Map<string, number>();
  private readonly appliedRx = new Set<string>();
  private chain: Promise<void> = Promise.resolve();
  /** Count of actual inventory mutations (for exactly-once tests). */
  applyCount = 0;

  private exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  seed(drugCode: string, qty: number): void {
    this.levels.set(drugCode, qty);
  }

  async available(drugCode: string): Promise<number> {
    return this.levels.get(drugCode) ?? 0;
  }

  async decrement(
    rxId: string,
    items: Array<{ drugCode: string; qty: number }>,
  ): Promise<boolean> {
    return this.exclusive(() => {
      if (this.appliedRx.has(rxId)) {
        return true; // already applied — exactly once
      }
      for (const item of items) {
        const have = this.levels.get(item.drugCode) ?? 0;
        if (have < item.qty) return false;
      }
      for (const item of items) {
        const have = this.levels.get(item.drugCode) ?? 0;
        this.levels.set(item.drugCode, have - item.qty);
      }
      this.appliedRx.add(rxId);
      this.applyCount += 1;
      return true;
    });
  }

  wasApplied(rxId: string): boolean {
    return this.appliedRx.has(rxId);
  }
}
