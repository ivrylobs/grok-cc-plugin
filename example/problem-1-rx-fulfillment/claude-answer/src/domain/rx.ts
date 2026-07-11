/**
 * The Rx aggregate root — the single place every business rule is enforced.
 *
 * Design choices that make illegal states hard to represent:
 *  - `status` is a closed union, and `claim` / `dispense` / `shippedAt` sub-
 *    records only exist once the matching transition has happened. You cannot
 *    construct an Rx that is DISPENSED but has no claim.
 *  - All mutators are guarded by an explicit transition table plus rule checks.
 *  - Time is injected (`now`) so expiry is deterministic and testable; the
 *    aggregate never reads a clock itself.
 *  - Mutators queue domain events internally; the use case drains them with
 *    `pullEvents()` only after a successful save.
 *  - `version` supports optimistic concurrency in the repository (exactly-once).
 */
import {
  RxId,
  PatientId,
  PrescriberId,
  PharmacyId,
  PharmacistApprovalId,
  ClaimKey,
} from "./ids.ts";
import { LineItem } from "./lineItem.ts";
import type { LineItemProps } from "./lineItem.ts";
import type { DomainEvent } from "./events.ts";
import {
  ValidationError,
  RxExpiredError,
  IllegalTransitionError,
  AlreadyClaimedError,
  NotClaimedByPharmacyError,
  ControlledApprovalRequiredError,
} from "./errors.ts";

export const RxStatus = {
  Issued: "ISSUED",
  Claimed: "CLAIMED",
  Dispensed: "DISPENSED",
  Shipped: "SHIPPED",
  Expired: "EXPIRED",
  Cancelled: "CANCELLED",
} as const;
export type RxStatus = (typeof RxStatus)[keyof typeof RxStatus];

/** Allowed forward transitions. Anything not listed is rejected. */
const ALLOWED: Record<RxStatus, ReadonlyArray<RxStatus>> = {
  ISSUED: ["CLAIMED", "EXPIRED", "CANCELLED"],
  CLAIMED: ["DISPENSED", "EXPIRED", "CANCELLED"],
  DISPENSED: ["SHIPPED"],
  SHIPPED: [],
  EXPIRED: [],
  CANCELLED: [],
};

type ClaimRecord = { pharmacyId: PharmacyId; claimKey: ClaimKey; claimedAt: Date };
type DispenseRecord = {
  pharmacistApprovalId: PharmacistApprovalId | null;
  dispensedAt: Date;
};

export type RxSnapshot = {
  id: string;
  patientId: string;
  prescriberId: string;
  lineItems: LineItemProps[];
  issuedAt: string;
  expiresAt: string;
  status: RxStatus;
  claim: { pharmacyId: string; claimKey: string; claimedAt: string } | null;
  dispense: { pharmacistApprovalId: string | null; dispensedAt: string } | null;
  shipping: { carrier: string | null; trackingId: string | null; shippedAt: string } | null;
  version: number;
};

export type IssueRxProps = {
  id: string;
  patientId: string;
  prescriberId: string;
  lineItems: LineItemProps[];
  issuedAt: Date;
  expiresAt: Date;
};

export class Rx {
  readonly id: RxId;
  readonly patientId: PatientId;
  readonly prescriberId: PrescriberId;
  readonly lineItems: ReadonlyArray<LineItem>;
  readonly issuedAt: Date;
  readonly expiresAt: Date;

  private _status: RxStatus;
  private _claim: ClaimRecord | null;
  private _dispense: DispenseRecord | null;
  private _shipping: { carrier: string | null; trackingId: string | null; shippedAt: Date } | null;
  private _version: number;
  private _events: DomainEvent[] = [];

  private constructor(init: {
    id: RxId;
    patientId: PatientId;
    prescriberId: PrescriberId;
    lineItems: LineItem[];
    issuedAt: Date;
    expiresAt: Date;
    status: RxStatus;
    claim: ClaimRecord | null;
    dispense: DispenseRecord | null;
    shipping: { carrier: string | null; trackingId: string | null; shippedAt: Date } | null;
    version: number;
  }) {
    this.id = init.id;
    this.patientId = init.patientId;
    this.prescriberId = init.prescriberId;
    this.lineItems = init.lineItems;
    this.issuedAt = init.issuedAt;
    this.expiresAt = init.expiresAt;
    this._status = init.status;
    this._claim = init.claim;
    this._dispense = init.dispense;
    this._shipping = init.shipping;
    this._version = init.version;
  }

  // ---- Construction ------------------------------------------------------

  /** Doctor issues a new Rx. Enforces non-empty line items and a sane window. */
  static issue(props: IssueRxProps): Rx {
    const lineItems = props.lineItems.map(LineItem.create);
    if (lineItems.length === 0) {
      throw new ValidationError("Rx must have at least one line item");
    }
    if (!(props.expiresAt.getTime() > props.issuedAt.getTime())) {
      throw new ValidationError("Rx expiresAt must be after issuedAt");
    }
    return new Rx({
      id: RxId(props.id),
      patientId: PatientId(props.patientId),
      prescriberId: PrescriberId(props.prescriberId),
      lineItems,
      issuedAt: props.issuedAt,
      expiresAt: props.expiresAt,
      status: RxStatus.Issued,
      claim: null,
      dispense: null,
      shipping: null,
      version: 0,
    });
  }

  /** Rehydrate from persistence. No rules re-run; the store is trusted. */
  static fromSnapshot(s: RxSnapshot): Rx {
    return new Rx({
      id: RxId(s.id),
      patientId: PatientId(s.patientId),
      prescriberId: PrescriberId(s.prescriberId),
      lineItems: s.lineItems.map(LineItem.create),
      issuedAt: new Date(s.issuedAt),
      expiresAt: new Date(s.expiresAt),
      status: s.status,
      claim: s.claim
        ? {
            pharmacyId: PharmacyId(s.claim.pharmacyId),
            claimKey: ClaimKey(s.claim.claimKey),
            claimedAt: new Date(s.claim.claimedAt),
          }
        : null,
      dispense: s.dispense
        ? {
            pharmacistApprovalId: s.dispense.pharmacistApprovalId
              ? PharmacistApprovalId(s.dispense.pharmacistApprovalId)
              : null,
            dispensedAt: new Date(s.dispense.dispensedAt),
          }
        : null,
      shipping: s.shipping
        ? {
            carrier: s.shipping.carrier,
            trackingId: s.shipping.trackingId,
            shippedAt: new Date(s.shipping.shippedAt),
          }
        : null,
      version: s.version,
    });
  }

  // ---- Accessors ---------------------------------------------------------

  get status(): RxStatus {
    return this._status;
  }
  get version(): number {
    return this._version;
  }
  get claimedByPharmacyId(): PharmacyId | null {
    return this._claim ? this._claim.pharmacyId : null;
  }
  get hasControlledItem(): boolean {
    return this.lineItems.some((li) => li.controlled);
  }
  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  /** Drain queued events (call after a successful save). */
  pullEvents(): DomainEvent[] {
    const out = this._events;
    this._events = [];
    return out;
  }

  // ---- Behaviour ---------------------------------------------------------

  /**
   * Claim binds the Rx to exactly one pharmacy.
   * - Idempotent by (rxId, claimKey): a retry with the same pharmacy + claimKey
   *   is a no-op success (no event, no version bump).
   * - A different pharmacy, or the same pharmacy with a different claimKey,
   *   claiming an already-claimed Rx fails.
   * Returns whether this call actually changed state.
   */
  claim(pharmacyId: PharmacyId, claimKey: ClaimKey, now: Date): { changed: boolean } {
    if (this._status === RxStatus.Claimed && this._claim) {
      const sameKey = this._claim.claimKey === claimKey;
      const samePharmacy = this._claim.pharmacyId === pharmacyId;
      if (sameKey && samePharmacy) return { changed: false }; // idempotent replay
      throw new AlreadyClaimedError(this.id);
    }
    this.assertNotExpired(now);
    this.assertTransition(RxStatus.Claimed);

    this._claim = { pharmacyId, claimKey, claimedAt: now };
    this._status = RxStatus.Claimed;
    this._version += 1;
    this._events.push({
      type: "prescription.claimed",
      rxId: this.id,
      pharmacyId,
      claimKey,
      occurredAt: now.toISOString(),
    });
    return { changed: true };
  }

  /**
   * Dispense. Validates and transitions IN MEMORY only; the use case performs
   * the external stock decrement and persists afterwards. Rules enforced here:
   *  - must be CLAIMED (else illegal transition: covers not-yet-claimed and
   *    already-dispensed),
   *  - must be dispensed by the pharmacy that claimed it,
   *  - must be unexpired,
   *  - if any line item is controlled, a pharmacistApprovalId is required.
   */
  dispense(params: {
    pharmacyId: PharmacyId;
    pharmacistApprovalId: PharmacistApprovalId | null;
    now: Date;
  }): void {
    this.assertTransition(RxStatus.Dispensed); // rejects non-CLAIMED states
    if (!this._claim || this._claim.pharmacyId !== params.pharmacyId) {
      throw new NotClaimedByPharmacyError(this.id);
    }
    this.assertNotExpired(params.now);
    if (this.hasControlledItem && params.pharmacistApprovalId === null) {
      throw new ControlledApprovalRequiredError(this.id);
    }

    this._dispense = {
      pharmacistApprovalId: params.pharmacistApprovalId,
      dispensedAt: params.now,
    };
    this._status = RxStatus.Dispensed;
    this._version += 1;
    this._events.push({
      type: "prescription.dispensed",
      rxId: this.id,
      pharmacyId: params.pharmacyId,
      patientId: this.patientId,
      pharmacistApprovalId: params.pharmacistApprovalId,
      lineItems: this.lineItems.map((li) => li.toProps()),
      occurredAt: params.now.toISOString(),
    });
  }

  /** Ship a dispensed Rx to the patient. */
  ship(
    params: { carrier: string | null; trackingId: string | null; now: Date },
  ): void {
    this.assertTransition(RxStatus.Shipped);
    this._shipping = {
      carrier: params.carrier,
      trackingId: params.trackingId,
      shippedAt: params.now,
    };
    this._status = RxStatus.Shipped;
    this._version += 1;
    this._events.push({
      type: "prescription.shipped",
      rxId: this.id,
      pharmacyId: this._claim ? this._claim.pharmacyId : "",
      patientId: this.patientId,
      carrier: params.carrier,
      trackingId: params.trackingId,
      occurredAt: params.now.toISOString(),
    });
  }

  /** Mark expired (terminal). Only meaningful while not yet dispensed/shipped. */
  markExpired(now: Date): void {
    this.assertTransition(RxStatus.Expired);
    if (!this.isExpired(now)) {
      throw new ValidationError(`Rx ${this.id} is not past its expiry`);
    }
    this._status = RxStatus.Expired;
    this._version += 1;
  }

  /** Cancel (terminal). Allowed before dispense. */
  cancel(): void {
    this.assertTransition(RxStatus.Cancelled);
    this._status = RxStatus.Cancelled;
    this._version += 1;
  }

  // ---- Snapshot ----------------------------------------------------------

  toSnapshot(): RxSnapshot {
    return {
      id: this.id,
      patientId: this.patientId,
      prescriberId: this.prescriberId,
      lineItems: this.lineItems.map((li) => li.toProps()),
      issuedAt: this.issuedAt.toISOString(),
      expiresAt: this.expiresAt.toISOString(),
      status: this._status,
      claim: this._claim
        ? {
            pharmacyId: this._claim.pharmacyId,
            claimKey: this._claim.claimKey,
            claimedAt: this._claim.claimedAt.toISOString(),
          }
        : null,
      dispense: this._dispense
        ? {
            pharmacistApprovalId: this._dispense.pharmacistApprovalId,
            dispensedAt: this._dispense.dispensedAt.toISOString(),
          }
        : null,
      shipping: this._shipping
        ? {
            carrier: this._shipping.carrier,
            trackingId: this._shipping.trackingId,
            shippedAt: this._shipping.shippedAt.toISOString(),
          }
        : null,
      version: this._version,
    };
  }

  // ---- Guards ------------------------------------------------------------

  private assertTransition(to: RxStatus): void {
    if (!ALLOWED[this._status].includes(to)) {
      throw new IllegalTransitionError(this._status, to);
    }
  }

  private assertNotExpired(now: Date): void {
    if (this.isExpired(now)) {
      throw new RxExpiredError(this.id, this.expiresAt);
    }
  }
}
