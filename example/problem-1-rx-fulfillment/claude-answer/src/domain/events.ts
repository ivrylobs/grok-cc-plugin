/**
 * Domain events. Produced inside the aggregate and drained by the use case,
 * which hands them to the EventPublisher port after the state change is durably
 * saved. `prescription.dispensed` is the contract required by the spec and is
 * consumed downstream by billing, shipping and patient-notify.
 *
 * Events carry only ids and the minimum payload; PHI-heavy detail stays behind
 * the read model. Every event is a plain JSON-serializable object.
 */
import type { LineItemProps } from "./lineItem.ts";

export type PrescriptionClaimedEvent = {
  type: "prescription.claimed";
  rxId: string;
  pharmacyId: string;
  claimKey: string;
  occurredAt: string;
};

export type PrescriptionDispensedEvent = {
  type: "prescription.dispensed";
  rxId: string;
  pharmacyId: string;
  patientId: string;
  pharmacistApprovalId: string | null;
  lineItems: LineItemProps[];
  occurredAt: string;
};

export type PrescriptionShippedEvent = {
  type: "prescription.shipped";
  rxId: string;
  pharmacyId: string;
  patientId: string;
  carrier: string | null;
  trackingId: string | null;
  occurredAt: string;
};

export type DomainEvent =
  | PrescriptionClaimedEvent
  | PrescriptionDispensedEvent
  | PrescriptionShippedEvent;
