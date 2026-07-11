import {
  ApprovalRequiredError,
  ConcurrencyError,
  InsufficientStockError,
  NotFoundError,
} from "../domain/errors.ts";
import type { Prescription } from "../domain/prescription.ts";
import { PharmacistApprovalId, RxId } from "../domain/value-objects.ts";
import type { ApprovalPort } from "../ports/approval-port.ts";
import type { Clock } from "../ports/clock.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";
import type { StockPort } from "../ports/stock-port.ts";

export interface DispenseRxInput {
  rxId: string;
  /** Optional; same key on retry is a no-op success. */
  idempotencyKey?: string;
  pharmacistApprovalId?: string;
}

const MAX_CAS_RETRIES = 5;

/**
 * Exactly-once dispense unit of work (in-memory simulation of DESIGN §4):
 * 1. Load aggregate; short-circuit if already DISPENSED (same key or any).
 * 2. Domain transition → DISPENSED (emits event in-memory on aggregate).
 * 3. Stock decrement keyed by rxId (idempotent).
 * 4. CAS save; on conflict reload and re-evaluate.
 * 5. Publish domain events (outbox in Postgres adapter).
 *
 * If stock fails, we never save → aggregate not advanced.
 * If CAS loses, winner already decremented stock idempotently by rxId.
 */
export class DispenseRx {
  private readonly repo: PrescriptionRepository;
  private readonly stock: StockPort;
  private readonly clock: Clock;
  private readonly events: EventPublisher;
  private readonly approvals: ApprovalPort | undefined;

  constructor(
    repo: PrescriptionRepository,
    stock: StockPort,
    clock: Clock,
    events: EventPublisher,
    approvals?: ApprovalPort,
  ) {
    this.repo = repo;
    this.stock = stock;
    this.clock = clock;
    this.events = events;
    this.approvals = approvals;
  }

  async execute(input: DispenseRxInput): Promise<Prescription> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      try {
        return await this.attempt(input);
      } catch (e) {
        if (e instanceof ConcurrencyError) {
          lastError = e;
          continue;
        }
        throw e;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ConcurrencyError("Exhausted CAS retries on dispense");
  }

  private async attempt(input: DispenseRxInput): Promise<Prescription> {
    const id = RxId.create(input.rxId);
    const rx = await this.repo.getById(id);
    if (!rx) throw new NotFoundError(`Rx ${input.rxId} not found`);

    // Already dispensed → at-most-once: do not touch stock again.
    if (rx.status === "DISPENSED") {
      return rx;
    }

    const now = this.clock.now();
    const approval =
      input.pharmacistApprovalId !== undefined
        ? PharmacistApprovalId.create(input.pharmacistApprovalId)
        : undefined;

    if (approval && this.approvals) {
      const ok = await this.approvals.isValid({
        approvalId: approval.value,
        pharmacyId: rx.pharmacyId!.value,
        rxId: rx.id.value,
      });
      if (!ok) {
        throw new ApprovalRequiredError("Invalid pharmacist approval");
      }
    }

    const expectedVersion = rx.version;
    rx.dispense(now, {
      approvalId: approval,
      idempotencyKey: input.idempotencyKey,
    });

    // Domain no-op (already dispensed with same key inside mutate)
    if (rx.version === expectedVersion) {
      return rx;
    }

    // Stock BEFORE persist: if insufficient, leave aggregate unpersisted.
    // Stock is idempotent by rxId so concurrent winners don't double-decrement.
    const items = rx.lineItems.map((i) => ({
      drugCode: i.drugCode.value,
      qty: i.qty.value,
    }));
    const stockOk = await this.stock.decrement(rx.id.value, items);
    if (!stockOk) {
      throw new InsufficientStockError();
    }

    await this.repo.save(rx, expectedVersion);
    await this.events.publish(rx.pullEvents());
    return rx;
  }
}
