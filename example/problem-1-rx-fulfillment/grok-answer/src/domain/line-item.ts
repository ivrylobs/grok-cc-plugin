import { ValidationError } from "./errors.ts";
import { drugCode, positiveQuantity, type DrugCode } from "./value-objects.ts";

export interface LineItemProps {
  readonly drugCode: string;
  readonly quantity: number;
  readonly controlled: boolean;
}

export interface LineItem {
  readonly drugCode: DrugCode;
  readonly quantity: number;
  readonly controlled: boolean;
}

export function createLineItem(props: LineItemProps): LineItem {
  if (typeof props.controlled !== "boolean") {
    throw new ValidationError("controlled must be a boolean");
  }
  return Object.freeze({
    drugCode: drugCode(props.drugCode),
    quantity: positiveQuantity(props.quantity),
    controlled: props.controlled,
  });
}

export function createLineItems(
  items: ReadonlyArray<LineItemProps>,
): ReadonlyArray<LineItem> {
  if (!items || items.length === 0) {
    throw new ValidationError("prescription must have at least one line item");
  }
  return Object.freeze(items.map(createLineItem));
}
