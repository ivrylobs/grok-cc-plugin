/**
 * In-memory IdempotencyStore. In production this is Redis (with a TTL) or a
 * unique-keyed table, so a client that retries a dispense gets the same result
 * instead of a second attempt.
 */
import type { IdempotencyStore } from "../ports/index.ts";

export class InMemoryIdempotencyStore<T> implements IdempotencyStore<T> {
  private readonly store = new Map<string, T>();

  async get(key: string): Promise<T | null> {
    const v = this.store.get(key);
    return v === undefined ? null : structuredClone(v);
  }

  async put(key: string, value: T): Promise<void> {
    this.store.set(key, structuredClone(value));
  }
}
