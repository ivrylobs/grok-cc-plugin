export const RxStatus = {
  ISSUED: "ISSUED",
  CLAIMED: "CLAIMED",
  DISPENSED: "DISPENSED",
  SHIPPED: "SHIPPED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;

export type RxStatus = (typeof RxStatus)[keyof typeof RxStatus];

/** Allowed transitions. Terminal states have empty target sets. */
const ALLOWED: Record<RxStatus, ReadonlySet<RxStatus>> = {
  ISSUED: new Set([RxStatus.CLAIMED, RxStatus.EXPIRED, RxStatus.CANCELLED]),
  CLAIMED: new Set([RxStatus.DISPENSED, RxStatus.EXPIRED, RxStatus.CANCELLED]),
  DISPENSED: new Set([RxStatus.SHIPPED, RxStatus.CANCELLED]),
  SHIPPED: new Set(),
  EXPIRED: new Set(),
  CANCELLED: new Set(),
};

export function canTransition(from: RxStatus, to: RxStatus): boolean {
  return ALLOWED[from].has(to);
}

export function isTerminal(status: RxStatus): boolean {
  return ALLOWED[status].size === 0;
}
