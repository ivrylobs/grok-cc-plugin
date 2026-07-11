import type { Prescription } from "../domain/prescription.ts";
import type { RxId } from "../domain/value-objects.ts";

/**
 * Load/save with optimistic version CAS.
 * save() must fail (ConcurrencyError) when expected version does not match.
 */
export interface PrescriptionRepository {
  getById(id: RxId): Promise<Prescription | null>;
  /** Insert a newly issued Rx (version 0). */
  insert(rx: Prescription): Promise<void>;
  /**
   * Persist after a state change. expectedVersion is the version *before*
   * the aggregate bumped (or the version loaded). Implementations CAS on it.
   */
  save(rx: Prescription, expectedVersion: number): Promise<void>;
}
