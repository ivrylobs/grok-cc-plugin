import { InvalidValueError } from "./errors.ts";

/** Opaque branded string ids — construction validates non-empty. */
function nonEmpty(name: string, value: string): string {
  const v = value?.trim();
  if (!v) throw new InvalidValueError(`${name} must be non-empty`);
  return v;
}

export class RxId {
  readonly value: string;
  private constructor(value: string) {
    this.value = value;
  }
  static create(value: string): RxId {
    return new RxId(nonEmpty("RxId", value));
  }
  equals(other: RxId): boolean {
    return this.value === other.value;
  }
}

export class PharmacyId {
  readonly value: string;
  private constructor(value: string) {
    this.value = value;
  }
  static create(value: string): PharmacyId {
    return new PharmacyId(nonEmpty("PharmacyId", value));
  }
  equals(other: PharmacyId): boolean {
    return this.value === other.value;
  }
}

export class PatientId {
  readonly value: string;
  private constructor(value: string) {
    this.value = value;
  }
  static create(value: string): PatientId {
    return new PatientId(nonEmpty("PatientId", value));
  }
}

export class PrescriberId {
  readonly value: string;
  private constructor(value: string) {
    this.value = value;
  }
  static create(value: string): PrescriberId {
    return new PrescriberId(nonEmpty("PrescriberId", value));
  }
}

export class ClaimKey {
  readonly value: string;
  private constructor(value: string) {
    this.value = value;
  }
  static create(value: string): ClaimKey {
    return new ClaimKey(nonEmpty("ClaimKey", value));
  }
  equals(other: ClaimKey): boolean {
    return this.value === other.value;
  }
}

export class PharmacistApprovalId {
  readonly value: string;
  private constructor(value: string) {
    this.value = value;
  }
  static create(value: string): PharmacistApprovalId {
    return new PharmacistApprovalId(nonEmpty("PharmacistApprovalId", value));
  }
}

export class DrugCode {
  readonly value: string;
  private constructor(value: string) {
    this.value = value;
  }
  static create(value: string): DrugCode {
    return new DrugCode(nonEmpty("DrugCode", value));
  }
}

export class Qty {
  readonly value: number;
  private constructor(value: number) {
    this.value = value;
  }
  static create(value: number): Qty {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidValueError("Qty must be a positive integer");
    }
    return new Qty(value);
  }
}

export class LineItem {
  readonly drugCode: DrugCode;
  readonly qty: Qty;
  readonly controlled: boolean;

  private constructor(drugCode: DrugCode, qty: Qty, controlled: boolean) {
    this.drugCode = drugCode;
    this.qty = qty;
    this.controlled = controlled;
  }

  static create(input: {
    drugCode: string;
    qty: number;
    controlled: boolean;
  }): LineItem {
    return new LineItem(
      DrugCode.create(input.drugCode),
      Qty.create(input.qty),
      Boolean(input.controlled),
    );
  }

  toJSON(): { drugCode: string; qty: number; controlled: boolean } {
    return {
      drugCode: this.drugCode.value,
      qty: this.qty.value,
      controlled: this.controlled,
    };
  }
}
