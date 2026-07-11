import {
  AlreadyClaimedError,
  ApprovalRequiredError,
  ExpiredError,
  IllegalTransitionError,
  InvalidValueError,
} from "./errors.ts";
import type { DomainEvent } from "./events.ts";
import { toLineItemPayload } from "./events.ts";
import {
  ClaimKey,
  LineItem,
  PatientId,
  PharmacistApprovalId,
  PharmacyId,
  PrescriberId,
  RxId,
} from "./value-objects.ts";

export type RxStatus =
  | "ISSUED"
  | "CLAIMED"
  | "DISPENSED"
  | "SHIPPED"
  | "EXPIRED"
  | "CANCELLED";

const LEGAL: Record<RxStatus, readonly RxStatus[]> = {
  ISSUED: ["CLAIMED", "EXPIRED", "CANCELLED"],
  CLAIMED: ["DISPENSED", "EXPIRED", "CANCELLED"],
  DISPENSED: ["SHIPPED"],
  SHIPPED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export interface PrescriptionSnapshot {
  id: string;
  patientId: string;
  prescriberId: string;
  lineItems: Array<{ drugCode: string; qty: number; controlled: boolean }>;
  issuedAt: Date;
  expiresAt: Date;
  status: RxStatus;
  pharmacyId?: string;
  claimKey?: string;
  pharmacistApprovalId?: string;
  version: number;
  dispenseIdempotencyKey?: string;
}

/**
 * Prescription aggregate root.
 * Status is a discriminated field; methods assert legal state so illegal
 * transitions cannot succeed. Prefer rehydrate() + mutators over free mutation.
 *
 * Note: TypeScript cannot encode methods only on some statuses without a
 * family of classes; we use a single class + status guards so the *data*
 * model stays a clean discriminated union via status, while behaviour is
 * gated. Illegal transitions always throw.
 */
export class Prescription {
  readonly id: RxId;
  readonly patientId: PatientId;
  readonly prescriberId: PrescriberId;
  readonly lineItems: readonly LineItem[];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  private _status: RxStatus;
  private _pharmacyId?: PharmacyId;
  private _claimKey?: ClaimKey;
  private _pharmacistApprovalId?: PharmacistApprovalId;
  private _version: number;
  private _dispenseIdempotencyKey?: string;
  private _pendingEvents: DomainEvent[] = [];

  private constructor(init: {
    id: RxId;
    patientId: PatientId;
    prescriberId: PrescriberId;
    lineItems: readonly LineItem[];
    issuedAt: Date;
    expiresAt: Date;
    status: RxStatus;
    pharmacyId?: PharmacyId;
    claimKey?: ClaimKey;
    pharmacistApprovalId?: PharmacistApprovalId;
    version: number;
    dispenseIdempotencyKey?: string;
  }) {
    this.id = init.id;
    this.patientId = init.patientId;
    this.prescriberId = init.prescriberId;
    this.lineItems = init.lineItems;
    this.issuedAt = init.issuedAt;
    this.expiresAt = init.expiresAt;
    this._status = init.status;
    this._pharmacyId = init.pharmacyId;
    this._claimKey = init.claimKey;
    this._pharmacistApprovalId = init.pharmacistApprovalId;
    this._version = init.version;
    this._dispenseIdempotencyKey = init.dispenseIdempotencyKey;
  }

  get status(): RxStatus {
    return this._status;
  }
  get pharmacyId(): PharmacyId | undefined {
    return this._pharmacyId;
  }
  get claimKey(): ClaimKey | undefined {
    return this._claimKey;
  }
  get version(): number {
    return this._version;
  }
  get dispenseIdempotencyKey(): string | undefined {
    return this._dispenseIdempotencyKey;
  }

  static issue(input: {
    id: string;
    patientId: string;
    prescriberId: string;
    lineItems: Array<{ drugCode: string; qty: number; controlled: boolean }>;
    issuedAt: Date;
    expiresAt: Date;
  }): Prescription {
    if (!input.lineItems?.length) {
      throw new InvalidValueError("Prescription must have at least one line item");
    }
    if (!(input.expiresAt > input.issuedAt)) {
      throw new InvalidValueError("expiresAt must be after issuedAt");
    }
    return new Prescription({
      id: RxId.create(input.id),
      patientId: PatientId.create(input.patientId),
      prescriberId: PrescriberId.create(input.prescriberId),
      lineItems: input.lineItems.map(LineItem.create),
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      status: "ISSUED",
      version: 0,
    });
  }

  static rehydrate(snap: PrescriptionSnapshot): Prescription {
    return new Prescription({
      id: RxId.create(snap.id),
      patientId: PatientId.create(snap.patientId),
      prescriberId: PrescriberId.create(snap.prescriberId),
      lineItems: snap.lineItems.map(LineItem.create),
      issuedAt: new Date(snap.issuedAt),
      expiresAt: new Date(snap.expiresAt),
      status: snap.status,
      pharmacyId: snap.pharmacyId
        ? PharmacyId.create(snap.pharmacyId)
        : undefined,
      claimKey: snap.claimKey ? ClaimKey.create(snap.claimKey) : undefined,
      pharmacistApprovalId: snap.pharmacistApprovalId
        ? PharmacistApprovalId.create(snap.pharmacistApprovalId)
        : undefined,
      version: snap.version,
      dispenseIdempotencyKey: snap.dispenseIdempotencyKey,
    });
  }

  toSnapshot(): PrescriptionSnapshot {
    return {
      id: this.id.value,
      patientId: this.patientId.value,
      prescriberId: this.prescriberId.value,
      lineItems: this.lineItems.map((i) => i.toJSON()),
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      status: this._status,
      pharmacyId: this._pharmacyId?.value,
      claimKey: this._claimKey?.value,
      pharmacistApprovalId: this._pharmacistApprovalId?.value,
      version: this._version,
      dispenseIdempotencyKey: this._dispenseIdempotencyKey,
    };
  }

  private assertTransition(to: RxStatus): void {
    if (!LEGAL[this._status].includes(to)) {
      throw new IllegalTransitionError(this._status, to);
    }
  }

  private bump(): void {
    this._version += 1;
  }

  /**
   * Claim binds this Rx to one pharmacy. Idempotent for the same claimKey;
   * fails if already claimed with a different key or by another pharmacy.
   */
  claim(pharmacyId: PharmacyId, claimKey: ClaimKey, now: Date): void {
    if (this.isExpired(now) && this._status === "ISSUED") {
      throw new ExpiredError();
    }

    if (this._status === "CLAIMED") {
      if (
        this._claimKey?.equals(claimKey) &&
        this._pharmacyId?.equals(pharmacyId)
      ) {
        return; // idempotent no-op
      }
      throw new AlreadyClaimedError();
    }

    if (this._status !== "ISSUED") {
      throw new IllegalTransitionError(this._status, "CLAIMED");
    }

    this.assertTransition("CLAIMED");
    this._pharmacyId = pharmacyId;
    this._claimKey = claimKey;
    this._status = "CLAIMED";
    this.bump();
    this._pendingEvents.push({
      type: "prescription.claimed",
      rxId: this.id.value,
      pharmacyId: pharmacyId.value,
      timestamp: now,
    });
  }

  /**
   * Dispense: only from CLAIMED, not expired, controlled lines need approval.
   * Idempotent when the same dispenseIdempotencyKey is replayed on DISPENSED.
   */
  dispense(
    now: Date,
    opts: {
      approvalId?: PharmacistApprovalId;
      idempotencyKey?: string;
    } = {},
  ): void {
    if (
      this._status === "DISPENSED" &&
      opts.idempotencyKey &&
      this._dispenseIdempotencyKey === opts.idempotencyKey
    ) {
      return; // command-level idempotency short-circuit
    }

    if (this._status === "DISPENSED") {
      // Already dispensed under a different key (or no key) — still at-most-once.
      // Treat as success for stock/use-case short-circuit; use case checks status.
      if (!opts.idempotencyKey) return;
      throw new IllegalTransitionError(this._status, "DISPENSED");
    }

    if (this._status !== "CLAIMED") {
      throw new IllegalTransitionError(this._status, "DISPENSED");
    }

    if (this.isExpired(now)) {
      throw new ExpiredError();
    }

    const needsApproval = this.lineItems.some((i) => i.controlled);
    if (needsApproval && !opts.approvalId) {
      throw new ApprovalRequiredError();
    }

    this.assertTransition("DISPENSED");
    if (opts.approvalId) this._pharmacistApprovalId = opts.approvalId;
    if (opts.idempotencyKey) this._dispenseIdempotencyKey = opts.idempotencyKey;
    this._status = "DISPENSED";
    this.bump();
    this._pendingEvents.push({
      type: "prescription.dispensed",
      rxId: this.id.value,
      pharmacyId: this._pharmacyId!.value,
      lineItems: toLineItemPayload(this.lineItems),
      timestamp: now,
    });
  }

  ship(now: Date): void {
    if (this._status !== "DISPENSED") {
      throw new IllegalTransitionError(this._status, "SHIPPED");
    }
    this.assertTransition("SHIPPED");
    this._status = "SHIPPED";
    this.bump();
    this._pendingEvents.push({
      type: "prescription.shipped",
      rxId: this.id.value,
      pharmacyId: this._pharmacyId!.value,
      timestamp: now,
    });
  }

  cancel(now: Date): void {
    if (this._status !== "ISSUED" && this._status !== "CLAIMED") {
      throw new IllegalTransitionError(this._status, "CANCELLED");
    }
    this.assertTransition("CANCELLED");
    this._status = "CANCELLED";
    this.bump();
    void now;
  }

  markExpired(now: Date): void {
    if (this._status !== "ISSUED" && this._status !== "CLAIMED") {
      throw new IllegalTransitionError(this._status, "EXPIRED");
    }
    if (!this.isExpired(now)) {
      throw new InvalidValueError("Cannot mark EXPIRED before expiresAt");
    }
    this.assertTransition("EXPIRED");
    this._status = "EXPIRED";
    this.bump();
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  hasControlledItems(): boolean {
    return this.lineItems.some((i) => i.controlled);
  }

  pullEvents(): DomainEvent[] {
    const ev = this._pendingEvents;
    this._pendingEvents = [];
    return ev;
  }

  peekEvents(): readonly DomainEvent[] {
    return this._pendingEvents;
  }
}
