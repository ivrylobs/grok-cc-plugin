/**
 * Ports — the interfaces the application core depends on. Adapters implement
 * them (in-memory here; Postgres / Kafka / Redis in production). The domain and
 * use cases never import an adapter, only these types.
 */
import type { Rx } from "../domain/rx.ts";
import type { DomainEvent } from "../domain/events.ts";
import type { LineItemProps } from "../domain/lineItem.ts";

/** Clock is a port so time is injectable and tests are deterministic. */
export interface Clock {
  now(): Date;
}

/**
 * RxRepository with optimistic concurrency. `save` must reject with
 * ConcurrencyError when `expectedVersion` does not match the stored version.
 * This is the primitive that gives us exactly-once state transitions.
 */
export interface RxRepository {
  load(id: string): Promise<Rx | null>;
  /**
   * Persist `rx`. `expectedVersion` is the version the aggregate had when it
   * was loaded (0 for a brand-new Rx). Implementations use it as a compare-and-
   * swap: `UPDATE ... WHERE id = $id AND version = $expectedVersion`.
   */
  save(rx: Rx, expectedVersion: number): Promise<void>;
}

export interface EventPublisher {
  publish(events: DomainEvent[]): Promise<void>;
}

export type StockDecrementResult =
  | { ok: true; alreadyApplied: boolean }
  | {
      ok: false;
      reason: "INSUFFICIENT_STOCK";
      shortfalls: { drugCode: string; requested: number; available: number }[];
    };

/**
 * StockPort decrements inventory. It MUST be idempotent by `idempotencyKey`
 * (we pass the rxId): calling it twice for the same key decrements at most once
 * and reports `alreadyApplied: true` on the replay. This is the exactly-once
 * guarantee for stock even across retries, crashes and concurrent callers.
 */
export interface StockPort {
  decrement(
    idempotencyKey: string,
    lines: LineItemProps[],
  ): Promise<StockDecrementResult>;
}

/**
 * IdempotencyStore lets a use case dedupe an entire operation by a client-
 * supplied key and return the previously computed result. Used by DispenseRx
 * for request-level idempotency (the domain state + stock ledger already make
 * the effects exactly-once; this makes the *response* stable too).
 */
export interface IdempotencyStore<T> {
  get(key: string): Promise<T | null>;
  put(key: string, value: T): Promise<void>;
}
