/** Domain errors — thrown by the aggregate; never by adapters/controllers for business rules. */

export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class AlreadyClaimedError extends DomainError {
  constructor(message = "Prescription already claimed by another pharmacy") {
    super("ALREADY_CLAIMED", message);
    this.name = "AlreadyClaimedError";
  }
}

export class ExpiredError extends DomainError {
  constructor(message = "Prescription is expired") {
    super("EXPIRED", message);
    this.name = "ExpiredError";
  }
}

export class ApprovalRequiredError extends DomainError {
  constructor(message = "Controlled substance requires pharmacist approval") {
    super("APPROVAL_REQUIRED", message);
    this.name = "ApprovalRequiredError";
  }
}

export class IllegalTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super("ILLEGAL_TRANSITION", `Cannot transition from ${from} to ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export class InvalidValueError extends DomainError {
  constructor(message: string) {
    super("INVALID_VALUE", message);
    this.name = "InvalidValueError";
  }
}

export class InsufficientStockError extends DomainError {
  constructor(message = "Insufficient stock for one or more line items") {
    super("INSUFFICIENT_STOCK", message);
    this.name = "InsufficientStockError";
  }
}

export class ConcurrencyError extends DomainError {
  constructor(message = "Optimistic concurrency conflict") {
    super("CONCURRENCY", message);
    this.name = "ConcurrencyError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Prescription not found") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}
