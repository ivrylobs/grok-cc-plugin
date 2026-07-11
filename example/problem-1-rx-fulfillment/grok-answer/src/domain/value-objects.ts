import { ValidationError } from "./errors.ts";

export type RxId = string & { readonly __brand: "RxId" };
export type PatientId = string & { readonly __brand: "PatientId" };
export type PrescriberId = string & { readonly __brand: "PrescriberId" };
export type PharmacyId = string & { readonly __brand: "PharmacyId" };
export type DrugCode = string & { readonly __brand: "DrugCode" };
export type ClaimKey = string & { readonly __brand: "ClaimKey" };
export type DispenseKey = string & { readonly __brand: "DispenseKey" };
export type PharmacistApprovalId = string & {
  readonly __brand: "PharmacistApprovalId";
};

function nonEmpty(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${label} must be non-empty`);
  return trimmed;
}

export function rxId(value: string): RxId {
  return nonEmpty("rxId", value) as RxId;
}
export function patientId(value: string): PatientId {
  return nonEmpty("patientId", value) as PatientId;
}
export function prescriberId(value: string): PrescriberId {
  return nonEmpty("prescriberId", value) as PrescriberId;
}
export function pharmacyId(value: string): PharmacyId {
  return nonEmpty("pharmacyId", value) as PharmacyId;
}
export function drugCode(value: string): DrugCode {
  return nonEmpty("drugCode", value) as DrugCode;
}
export function claimKey(value: string): ClaimKey {
  return nonEmpty("claimKey", value) as ClaimKey;
}
export function dispenseKey(value: string): DispenseKey {
  return nonEmpty("dispenseKey", value) as DispenseKey;
}
export function pharmacistApprovalId(value: string): PharmacistApprovalId {
  return nonEmpty("pharmacistApprovalId", value) as PharmacistApprovalId;
}

export function positiveQuantity(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError("quantity must be a positive integer");
  }
  return value;
}
