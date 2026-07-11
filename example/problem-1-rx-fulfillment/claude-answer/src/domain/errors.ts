/**
 * Domain errors. Every rule violation surfaces as a typed error with a stable
 * `code`, so adapters (HTTP, gRPC) can map to status codes without string-matching
 * messages. These are the ONLY way the domain rejects an operation.
 */

export type DomainErrorCode =
  | "VALIDATION"
  | "RX_NOT_FOUND"
  | "RX_EXPIRED"
  | "ILLEGAL_TRANSITION"
  | "ALREADY_CLAIMED"
  | "NOT_CLAIMED_BY_PHARMACY"
  | "CONTROLLED_APPROVAL_REQUIRED"
  | "INSUFFICIENT_STOCK"
  | "CONCURRENCY_CONFLICT";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super("VALIDATION", message);
  }
}

export class RxNotFoundError extends DomainError {
  constructor(rxId: string) {
    super("RX_NOT_FOUND", `Rx ${rxId} not found`);
  }
}

export class RxExpiredError extends DomainError {
  constructor(rxId: string, expiresAt: Date) {
    super("RX_EXPIRED", `Rx ${rxId} expired at ${expiresAt.toISOString()}`);
  }
}

export class IllegalTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super("ILLEGAL_TRANSITION", `Illegal transition ${from} -> ${to}`);
  }
}

export class AlreadyClaimedError extends DomainError {
  constructor(rxId: string) {
    super("ALREADY_CLAIMED", `Rx ${rxId} is already claimed by another pharmacy`);
  }
}

export class NotClaimedByPharmacyError extends DomainError {
  constructor(rxId: string) {
    super(
      "NOT_CLAIMED_BY_PHARMACY",
      `Rx ${rxId} was not claimed by the dispensing pharmacy`,
    );
  }
}

export class ControlledApprovalRequiredError extends DomainError {
  constructor(rxId: string) {
    super(
      "CONTROLLED_APPROVAL_REQUIRED",
      `Rx ${rxId} contains a controlled substance and needs a pharmacistApprovalId`,
    );
  }
}

export type StockShortfall = {
  drugCode: string;
  requested: number;
  available: number;
};

export class InsufficientStockError extends DomainError {
  readonly shortfalls: StockShortfall[];
  constructor(rxId: string, shortfalls: StockShortfall[]) {
    super("INSUFFICIENT_STOCK", `Insufficient stock to dispense Rx ${rxId}`);
    this.shortfalls = shortfalls;
  }
}

export class ConcurrencyError extends DomainError {
  constructor(rxId: string) {
    super(
      "CONCURRENCY_CONFLICT",
      `Rx ${rxId} was modified concurrently; retry with a fresh read`,
    );
  }
}
