import { ConcurrencyError } from "../domain/errors.ts";
import { Prescription } from "../domain/prescription.ts";
import type { RxId } from "../domain/value-objects.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

/**
 * In-memory repo with optimistic version CAS (mirrors Postgres sketch).
 * Serializes save with a mutex so concurrent CAS is meaningful under
 * Promise interleaving (Node is single-threaded but await yields).
 */
export class InMemoryPrescriptionRepository implements PrescriptionRepository {
  private readonly store = new Map<string, Prescription>();
  private chain: Promise<void> = Promise.resolve();

  private exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async getById(id: RxId): Promise<Prescription | null> {
    return this.exclusive(() => {
      const existing = this.store.get(id.value);
      if (!existing) return null;
      // Return a rehydrated copy so concurrent mutators don't share identity
      return Prescription.rehydrate(existing.toSnapshot());
    });
  }

  async insert(rx: Prescription): Promise<void> {
    return this.exclusive(() => {
      if (this.store.has(rx.id.value)) {
        throw new ConcurrencyError(`Rx ${rx.id.value} already exists`);
      }
      this.store.set(rx.id.value, Prescription.rehydrate(rx.toSnapshot()));
    });
  }

  async save(rx: Prescription, expectedVersion: number): Promise<void> {
    return this.exclusive(() => {
      const current = this.store.get(rx.id.value);
      if (!current) {
        throw new ConcurrencyError(`Rx ${rx.id.value} missing on save`);
      }
      if (current.version !== expectedVersion) {
        throw new ConcurrencyError(
          `CAS failed for ${rx.id.value}: expected v${expectedVersion}, have v${current.version}`,
        );
      }
      // Aggregate already bumped version; persist the new snapshot
      this.store.set(rx.id.value, Prescription.rehydrate(rx.toSnapshot()));
    });
  }

  /** Test helper */
  async rawGet(id: string): Promise<Prescription | null> {
    const p = this.store.get(id);
    return p ? Prescription.rehydrate(p.toSnapshot()) : null;
  }
}
