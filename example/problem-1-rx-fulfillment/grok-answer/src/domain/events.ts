import type { DrugCode, PharmacyId, RxId } from "./value-objects.ts";

export type DomainEvent = PrescriptionDispensedEvent;

export interface PrescriptionDispensedEvent {
  readonly type: "prescription.dispensed";
  readonly rxId: RxId;
  readonly pharmacyId: PharmacyId;
  readonly lineItems: ReadonlyArray<{
    readonly drugCode: DrugCode;
    readonly quantity: number;
  }>;
  readonly occurredAt: Date;
}

export function prescriptionDispensed(params: {
  rxId: RxId;
  pharmacyId: PharmacyId;
  lineItems: ReadonlyArray<{ drugCode: DrugCode; quantity: number }>;
  occurredAt: Date;
}): PrescriptionDispensedEvent {
  return {
    type: "prescription.dispensed",
    rxId: params.rxId,
    pharmacyId: params.pharmacyId,
    lineItems: params.lineItems.map((li) => ({
      drugCode: li.drugCode,
      quantity: li.quantity,
    })),
    occurredAt: params.occurredAt,
  };
}
