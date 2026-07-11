import type { Prescription } from "../domain/prescription.ts";
import type { RxId } from "../domain/value-objects.ts";

export interface PrescriptionRepository {
  getById(id: RxId | string): Promise<Prescription | null>;
  /**
   * Persist with optimistic concurrency: expected version must match.
   * Implementations must reject concurrent writes (version mismatch).
   */
  save(rx: Prescription, expectedVersion: number): Promise<void>;
}
