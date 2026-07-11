/**
 * In-memory RxRepository with optimistic concurrency.
 *
 * Stores immutable snapshots keyed by id and rehydrates a fresh aggregate on
 * every load, so two concurrent callers get independent objects (mirroring two
 * DB transactions). `save` is a compare-and-swap on `version`; a stale write
 * throws ConcurrencyError — the in-memory analogue of
 * `UPDATE rx SET ... WHERE id = $id AND version = $expected` affecting 0 rows.
 */
import { Rx } from "../domain/rx.ts";
import type { RxSnapshot } from "../domain/rx.ts";
import { ConcurrencyError } from "../domain/errors.ts";
import type { RxRepository } from "../ports/index.ts";

export class InMemoryRxRepository implements RxRepository {
  private readonly store = new Map<string, RxSnapshot>();

  async load(id: string): Promise<Rx | null> {
    const snap = this.store.get(id);
    if (!snap) return null;
    // Deep copy so mutations to the returned aggregate never leak into the store
    // before an explicit save.
    return Rx.fromSnapshot(structuredClone(snap));
  }

  async save(rx: Rx, expectedVersion: number): Promise<void> {
    const snap = rx.toSnapshot();
    const existing = this.store.get(snap.id);
    const currentVersion = existing ? existing.version : 0;
    const exists = existing !== undefined;

    if (!exists) {
      // Insert: only valid when nothing is stored and we expected version 0.
      if (expectedVersion !== 0) throw new ConcurrencyError(snap.id);
    } else if (currentVersion !== expectedVersion) {
      throw new ConcurrencyError(snap.id);
    }
    this.store.set(snap.id, structuredClone(snap));
  }

  /** Test helper. */
  size(): number {
    return this.store.size;
  }
}
