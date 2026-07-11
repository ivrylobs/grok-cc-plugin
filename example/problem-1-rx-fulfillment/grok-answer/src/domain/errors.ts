export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class IllegalTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Illegal status transition: ${from} → ${to}`);
  }
}

export class RxExpiredError extends DomainError {
  constructor(rxId: string) {
    super(`Prescription ${rxId} is expired and cannot be dispensed`);
  }
}

export class AlreadyDispensedError extends DomainError {
  constructor(rxId: string) {
    super(`Prescription ${rxId} has already been dispensed`);
  }
}

export class AlreadyClaimedError extends DomainError {
  constructor(rxId: string, pharmacyId: string) {
    super(`Prescription ${rxId} is already claimed by pharmacy ${pharmacyId}`);
  }
}

export class ControlledSubstanceApprovalRequiredError extends DomainError {
  constructor(rxId: string) {
    super(
      `Prescription ${rxId} contains controlled substances and requires pharmacistApprovalId`,
    );
  }
}

export class InsufficientStockError extends DomainError {
  constructor(drugCode: string, requested: number, available: number) {
    super(
      `Insufficient stock for ${drugCode}: requested ${requested}, available ${available}`,
    );
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
  }
}

export class ConcurrentModificationError extends DomainError {
  constructor(rxId: string) {
    super(`Concurrent modification of prescription ${rxId}; retry required`);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
