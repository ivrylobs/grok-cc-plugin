import {
  AlreadyClaimedError,
  AlreadyDispensedError,
  ControlledSubstanceApprovalRequiredError,
  IllegalTransitionError,
  RxExpiredError,
  ValidationError,
} from "./errors.ts";
import {
  prescriptionDispensed,
  type DomainEvent,
  type PrescriptionDispensedEvent,
} from "./events.ts";
import {
  createLineItems,
  type LineItem,
  type LineItemProps,
} from "./line-item.ts";
import { canTransition, RxStatus } from "./status.ts";
import {
  claimKey as toClaimKey,
  patientId as toPatientId,
  pharmacyId as toPharmacyId,
  prescriberId as toPrescriberId,
  rxId as toRxId,
  type ClaimKey,
  type PatientId,
  type PharmacistApprovalId,
  type PharmacyId,
  type PrescriberId,
  type RxId,
} from "./value-objects.ts";

export interface IssuePrescriptionProps {
  readonly id: string;
  readonly patientId: string;
  readonly prescriberId: string;
  readonly lineItems: ReadonlyArray<LineItemProps>;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface PrescriptionSnapshot {
  readonly id: RxId;
  readonly patientId: PatientId;
  readonly prescriberId: PrescriberId;
  readonly lineItems: ReadonlyArray<LineItem>;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: RxStatus;
  readonly claimedByPharmacyId: PharmacyId | null;
  readonly claimKey: ClaimKey | null;
  readonly pharmacistApprovalId: PharmacistApprovalId | null;
  readonly dispensedAt: Date | null;
  readonly shippedAt: Date | null;
  readonly stockDecremented: boolean;
  readonly version: number;
}

/**
 * Prescription aggregate root.
 * All lifecycle invariants are enforced here — adapters must not bypass this.
 */
export class Prescription {
  readonly id: RxId;
  readonly patientId: PatientId;
  readonly prescriberId: PrescriberId;
  readonly lineItems: ReadonlyArray<LineItem>;
  readonly issuedAt: Date;
  readonly expiresAt: Date;

  #status: RxStatus;
  #claimedByPharmacyId: PharmacyId | null;
  #claimKey: ClaimKey | null;
  #pharmacistApprovalId: PharmacistApprovalId | null;
  #dispensedAt: Date | null;
  #shippedAt: Date | null;
  #stockDecremented: boolean;
  #version: number;
  #pendingEvents: DomainEvent[] = [];

  private constructor(snapshot: PrescriptionSnapshot) {
    this.id = snapshot.id;
    this.patientId = snapshot.patientId;
    this.prescriberId = snapshot.prescriberId;
    this.lineItems = snapshot.lineItems;
    this.issuedAt = snapshot.issuedAt;
    this.expiresAt = snapshot.expiresAt;
    this.#status = snapshot.status;
    this.#claimedByPharmacyId = snapshot.claimedByPharmacyId;
    this.#claimKey = snapshot.claimKey;
    this.#pharmacistApprovalId = snapshot.pharmacistApprovalId;
    this.#dispensedAt = snapshot.dispensedAt;
    this.#shippedAt = snapshot.shippedAt;
    this.#stockDecremented = snapshot.stockDecremented;
    this.#version = snapshot.version;
  }

  static issue(props: IssuePrescriptionProps): Prescription {
    if (!(props.issuedAt instanceof Date) || Number.isNaN(props.issuedAt.getTime())) {
      throw new ValidationError("issuedAt must be a valid Date");
    }
    if (!(props.expiresAt instanceof Date) || Number.isNaN(props.expiresAt.getTime())) {
      throw new ValidationError("expiresAt must be a valid Date");
    }
    if (props.expiresAt.getTime() <= props.issuedAt.getTime()) {
      throw new ValidationError("expiresAt must be after issuedAt");
    }

    return new Prescription({
      id: toRxId(props.id),
      patientId: toPatientId(props.patientId),
      prescriberId: toPrescriberId(props.prescriberId),
      lineItems: createLineItems(props.lineItems),
      issuedAt: new Date(props.issuedAt.getTime()),
      expiresAt: new Date(props.expiresAt.getTime()),
      status: RxStatus.ISSUED,
      claimedByPharmacyId: null,
      claimKey: null,
      pharmacistApprovalId: null,
      dispensedAt: null,
      shippedAt: null,
      stockDecremented: false,
      version: 0,
    });
  }

  static rehydrate(snapshot: PrescriptionSnapshot): Prescription {
    return new Prescription({
      ...snapshot,
      lineItems: Object.freeze([...snapshot.lineItems]),
      issuedAt: new Date(snapshot.issuedAt.getTime()),
      expiresAt: new Date(snapshot.expiresAt.getTime()),
      dispensedAt: snapshot.dispensedAt
        ? new Date(snapshot.dispensedAt.getTime())
        : null,
      shippedAt: snapshot.shippedAt
        ? new Date(snapshot.shippedAt.getTime())
        : null,
    });
  }

  get status(): RxStatus {
    return this.#status;
  }
  get claimedByPharmacyId(): PharmacyId | null {
    return this.#claimedByPharmacyId;
  }
  get claimKey(): ClaimKey | null {
    return this.#claimKey;
  }
  get pharmacistApprovalId(): PharmacistApprovalId | null {
    return this.#pharmacistApprovalId;
  }
  get dispensedAt(): Date | null {
    return this.#dispensedAt;
  }
  get shippedAt(): Date | null {
    return this.#shippedAt;
  }
  get stockDecremented(): boolean {
    return this.#stockDecremented;
  }
  get version(): number {
    return this.#version;
  }

  hasControlledSubstances(): boolean {
    return this.lineItems.some((li) => li.controlled);
  }

  isExpiredAt(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  /**
   * Bind Rx to exactly one pharmacy.
   * Idempotent when (rxId, claimKey) matches an existing claim by the same pharmacy.
   */
  claim(pharmacyIdValue: string, claimKeyValue: string): void {
    const pharmacy = toPharmacyId(pharmacyIdValue);
    const key = toClaimKey(claimKeyValue);

    if (this.#status === RxStatus.CLAIMED) {
      if (this.#claimKey === key && this.#claimedByPharmacyId === pharmacy) {
        // Idempotent retry — same pharmacy, same claim key.
        return;
      }
      if (this.#claimKey === key && this.#claimedByPharmacyId !== pharmacy) {
        throw new AlreadyClaimedError(this.id, this.#claimedByPharmacyId!);
      }
      throw new AlreadyClaimedError(this.id, this.#claimedByPharmacyId!);
    }

    this.#transitionTo(RxStatus.CLAIMED);
    this.#claimedByPharmacyId = pharmacy;
    this.#claimKey = key;
    this.#bumpVersion();
  }

  /**
   * Dispense after stock has been reserved/decremented by the application layer.
   * Domain rules: must be CLAIMED, not expired, not already dispensed,
   * controlled substances require pharmacistApprovalId.
   */
  dispense(params: {
    now: Date;
    pharmacistApprovalId?: string | null;
    stockAlreadyDecremented: boolean;
  }): PrescriptionDispensedEvent {
    if (this.#status === RxStatus.DISPENSED || this.#status === RxStatus.SHIPPED) {
      throw new AlreadyDispensedError(this.id);
    }

    if (this.#status !== RxStatus.CLAIMED) {
      throw new IllegalTransitionError(this.#status, RxStatus.DISPENSED);
    }

    if (this.isExpiredAt(params.now)) {
      // Mark expired when observed at dispense time.
      this.#transitionTo(RxStatus.EXPIRED);
      this.#bumpVersion();
      throw new RxExpiredError(this.id);
    }

    if (this.hasControlledSubstances()) {
      const approval = params.pharmacistApprovalId?.trim();
      if (!approval) {
        throw new ControlledSubstanceApprovalRequiredError(this.id);
      }
      this.#pharmacistApprovalId = approval as PharmacistApprovalId;
    }

    if (!params.stockAlreadyDecremented && !this.#stockDecremented) {
      throw new ValidationError(
        "stock must be decremented before completing dispense",
      );
    }

    this.#transitionTo(RxStatus.DISPENSED);
    this.#dispensedAt = new Date(params.now.getTime());
    this.#stockDecremented = true;
    this.#bumpVersion();

    const event = prescriptionDispensed({
      rxId: this.id,
      pharmacyId: this.#claimedByPharmacyId!,
      lineItems: this.lineItems.map((li) => ({
        drugCode: li.drugCode,
        quantity: li.quantity,
      })),
      occurredAt: this.#dispensedAt,
    });
    this.#pendingEvents.push(event);
    return event;
  }

  /**
   * Idempotent dispense completion: if already DISPENSED with stock flagged,
   * re-emit the domain event payload for downstream (without re-decrementing stock).
   */
  reemitDispensedEvent(): PrescriptionDispensedEvent {
    if (this.#status !== RxStatus.DISPENSED && this.#status !== RxStatus.SHIPPED) {
      throw new IllegalTransitionError(this.#status, RxStatus.DISPENSED);
    }
    if (!this.#claimedByPharmacyId || !this.#dispensedAt) {
      throw new ValidationError("dispense metadata missing on dispensed Rx");
    }
    return prescriptionDispensed({
      rxId: this.id,
      pharmacyId: this.#claimedByPharmacyId,
      lineItems: this.lineItems.map((li) => ({
        drugCode: li.drugCode,
        quantity: li.quantity,
      })),
      occurredAt: this.#dispensedAt,
    });
  }

  ship(now: Date): void {
    if (this.#status === RxStatus.SHIPPED) {
      // Idempotent ship.
      return;
    }
    if (this.#status !== RxStatus.DISPENSED) {
      throw new IllegalTransitionError(this.#status, RxStatus.SHIPPED);
    }
    this.#transitionTo(RxStatus.SHIPPED);
    this.#shippedAt = new Date(now.getTime());
    this.#bumpVersion();
  }

  cancel(): void {
    if (this.#status === RxStatus.CANCELLED) return;
    if (this.#status === RxStatus.SHIPPED || this.#status === RxStatus.EXPIRED) {
      throw new IllegalTransitionError(this.#status, RxStatus.CANCELLED);
    }
    // DISPENSED → CANCELLED is allowed (e.g. recall before ship) per status map.
    this.#transitionTo(RxStatus.CANCELLED);
    this.#bumpVersion();
  }

  markExpired(now: Date): void {
    if (this.#status === RxStatus.EXPIRED) return;
    if (
      this.#status === RxStatus.DISPENSED ||
      this.#status === RxStatus.SHIPPED ||
      this.#status === RxStatus.CANCELLED
    ) {
      throw new IllegalTransitionError(this.#status, RxStatus.EXPIRED);
    }
    if (!this.isExpiredAt(now)) {
      throw new ValidationError("cannot mark expired before expiresAt");
    }
    this.#transitionTo(RxStatus.EXPIRED);
    this.#bumpVersion();
  }

  pullDomainEvents(): DomainEvent[] {
    const events = this.#pendingEvents;
    this.#pendingEvents = [];
    return events;
  }

  toSnapshot(): PrescriptionSnapshot {
    return {
      id: this.id,
      patientId: this.patientId,
      prescriberId: this.prescriberId,
      lineItems: this.lineItems,
      issuedAt: new Date(this.issuedAt.getTime()),
      expiresAt: new Date(this.expiresAt.getTime()),
      status: this.#status,
      claimedByPharmacyId: this.#claimedByPharmacyId,
      claimKey: this.#claimKey,
      pharmacistApprovalId: this.#pharmacistApprovalId,
      dispensedAt: this.#dispensedAt
        ? new Date(this.#dispensedAt.getTime())
        : null,
      shippedAt: this.#shippedAt ? new Date(this.#shippedAt.getTime()) : null,
      stockDecremented: this.#stockDecremented,
      version: this.#version,
    };
  }

  #transitionTo(to: RxStatus): void {
    if (!canTransition(this.#status, to)) {
      throw new IllegalTransitionError(this.#status, to);
    }
    this.#status = to;
  }

  #bumpVersion(): void {
    this.#version += 1;
  }
}
