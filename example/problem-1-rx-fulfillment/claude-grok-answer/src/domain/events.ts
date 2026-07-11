import type { LineItem } from "./value-objects.ts";

export type DomainEvent =
  | PrescriptionDispensedEvent
  | PrescriptionClaimedEvent
  | PrescriptionShippedEvent;

export interface PrescriptionDispensedEvent {
  type: "prescription.dispensed";
  rxId: string;
  pharmacyId: string;
  lineItems: Array<{ drugCode: string; qty: number; controlled: boolean }>;
  timestamp: Date;
}

export interface PrescriptionClaimedEvent {
  type: "prescription.claimed";
  rxId: string;
  pharmacyId: string;
  timestamp: Date;
}

export interface PrescriptionShippedEvent {
  type: "prescription.shipped";
  rxId: string;
  pharmacyId: string;
  timestamp: Date;
}

export function toLineItemPayload(
  items: readonly LineItem[],
): Array<{ drugCode: string; qty: number; controlled: boolean }> {
  return items.map((i) => i.toJSON());
}
