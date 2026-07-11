import { ConcurrentModificationError } from "../domain/errors.ts";
import {
  Prescription,
  type PrescriptionSnapshot,
} from "../domain/prescription.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

/**
 * In-memory repo with optimistic concurrency on `version`.
 * Production Postgres sketch: see postgres-prescription-repository.sketch.ts
 */
export class InMemoryPrescriptionRepository implements PrescriptionRepository {
  private readonly store = new Map<string, PrescriptionSnapshot>();
  /** Per-id mutex chain for concurrent save/get serialization in tests. */
  private readonly locks = new Map<string, Promise<void>>();

  async getById(id: string): Promise<Prescription | null> {
    const snap = this.store.get(id);
    if (!snap) return null;
    return Prescription.rehydrate(structuredClone(snap));
  }

  async save(rx: Prescription, expectedVersion: number): Promise<void> {
    const id = rx.id as string;
    await this.#withLock(id, async () => {
      const existing = this.store.get(id);
      if (expectedVersion === -1) {
        if (existing) {
          throw new ConcurrentModificationError(id);
        }
      } else {
        if (!existing) {
          throw new ConcurrentModificationError(id);
        }
        if (existing.version !== expectedVersion) {
          throw new ConcurrentModificationError(id);
        }
      }
      this.store.set(id, structuredClone(rx.toSnapshot()));
    });
  }

  /** Test helper */
  clear(): void {
    this.store.clear();
  }

  async #withLock(id: string, fn: () => Promise<void> | void): Promise<void> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    this.locks.set(
      id,
      prev.then(() => gate),
    );
    await prev;
    try {
      await fn();
    } finally {
      release();
    }
  }
}
