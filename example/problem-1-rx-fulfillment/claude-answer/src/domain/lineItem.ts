/**
 * LineItem value object: one drug on a prescription. Immutable and self-
 * validating — a LineItem instance is always a positive integer quantity of a
 * non-empty drug code, with an explicit `controlled` flag that drives the
 * pharmacist-approval rule in the aggregate.
 */
import { DrugCode } from "./ids.ts";
import { ValidationError } from "./errors.ts";

export type LineItemProps = {
  drugCode: string;
  qty: number;
  controlled: boolean;
};

export class LineItem {
  readonly drugCode: DrugCode;
  readonly qty: number;
  readonly controlled: boolean;

  private constructor(drugCode: DrugCode, qty: number, controlled: boolean) {
    this.drugCode = drugCode;
    this.qty = qty;
    this.controlled = controlled;
    Object.freeze(this);
  }

  static create(props: LineItemProps): LineItem {
    const drugCode = DrugCode(props.drugCode);
    if (!Number.isInteger(props.qty) || props.qty <= 0) {
      throw new ValidationError(
        `LineItem qty for ${props.drugCode} must be a positive integer`,
      );
    }
    if (typeof props.controlled !== "boolean") {
      throw new ValidationError(
        `LineItem controlled flag for ${props.drugCode} must be a boolean`,
      );
    }
    return new LineItem(drugCode, props.qty, props.controlled);
  }

  toProps(): LineItemProps {
    return { drugCode: this.drugCode, qty: this.qty, controlled: this.controlled };
  }
}
