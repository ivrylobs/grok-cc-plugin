/**
 * Branded identifier value objects.
 *
 * A raw `string` can be passed anywhere a string is expected; a branded id
 * cannot. `PharmacyId` and `PatientId` are structurally different types even
 * though both are strings at runtime, so the compiler stops you from, say,
 * claiming an Rx with a patient id. Smart constructors validate non-emptiness.
 */
import { ValidationError } from "./errors.ts";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type RxId = Brand<string, "RxId">;
export type PatientId = Brand<string, "PatientId">;
export type PrescriberId = Brand<string, "PrescriberId">;
export type PharmacyId = Brand<string, "PharmacyId">;
export type PharmacistApprovalId = Brand<string, "PharmacistApprovalId">;
export type ClaimKey = Brand<string, "ClaimKey">;
export type DispenseKey = Brand<string, "DispenseKey">;
export type DrugCode = Brand<string, "DrugCode">;

function requireNonEmpty(kind: string, value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${kind} must be a non-empty string`);
  }
  return value.trim();
}

export const RxId = (v: string): RxId => requireNonEmpty("RxId", v) as RxId;
export const PatientId = (v: string): PatientId =>
  requireNonEmpty("PatientId", v) as PatientId;
export const PrescriberId = (v: string): PrescriberId =>
  requireNonEmpty("PrescriberId", v) as PrescriberId;
export const PharmacyId = (v: string): PharmacyId =>
  requireNonEmpty("PharmacyId", v) as PharmacyId;
export const PharmacistApprovalId = (v: string): PharmacistApprovalId =>
  requireNonEmpty("PharmacistApprovalId", v) as PharmacistApprovalId;
export const ClaimKey = (v: string): ClaimKey =>
  requireNonEmpty("ClaimKey", v) as ClaimKey;
export const DispenseKey = (v: string): DispenseKey =>
  requireNonEmpty("DispenseKey", v) as DispenseKey;
export const DrugCode = (v: string): DrugCode =>
  requireNonEmpty("DrugCode", v) as DrugCode;
