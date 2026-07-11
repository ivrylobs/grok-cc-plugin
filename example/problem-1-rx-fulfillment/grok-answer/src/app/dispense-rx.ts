import {
  ControlledSubstanceApprovalRequiredError,
  IllegalTransitionError,
  NotFoundError,
  RxExpiredError,
} from "../domain/errors.ts";
import type { PrescriptionDispensedEvent } from "../domain/events.ts";
import type { Prescription } from "../domain/prescription.ts";
import { RxStatus } from "../domain/status.ts";
import type { Clock } from "../ports/clock.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";
import type { StockService } from "../ports/stock.ts";

export interface DispenseRxCommand {
  readonly rxId: string;
  /** Stable key for exactly-once stock decrement under retries. */
  readonly dispenseKey: string;
  readonly pharmacistApprovalId?: string | null;
}

export interface DispenseRxResult {
  readonly prescription: Prescription;
  readonly event: PrescriptionDispensedEvent;
  readonly stockNewlyApplied: boolean;
}

export class DispenseRx {
  private readonly repo: PrescriptionRepository;
  private readonly stock: StockService;
  private readonly events: EventPublisher;
  private readonly clock: Clock;

  constructor(
    repo: PrescriptionRepository,
    stock: StockService,
    events: EventPublisher,
    clock: Clock,
  ) {
    this.repo = repo;
    this.stock = stock;
    this.events = events;
    this.clock = clock;
  }

  async execute(cmd: DispenseRxCommand): Promise<DispenseRxResult> {
    const rx = await this.repo.getById(cmd.rxId);
    if (!rx) throw new NotFoundError("Prescription", cmd.rxId);

    // Idempotent path: already dispensed/shipped — never touch stock again.
    if (rx.status === RxStatus.DISPENSED || rx.status === RxStatus.SHIPPED) {
      const event = rx.reemitDispensedEvent();
      await this.events.publish([event]);
      return { prescription: rx, event, stockNewlyApplied: false };
    }

    const now = this.clock.now();

    // Preflight domain rules before any stock mutation.
    await this.assertCanDispense(rx, now, cmd.pharmacistApprovalId);

    const pharmacyId = rx.claimedByPharmacyId!;
    const stockResult = await this.stock.decrementExactlyOnce({
      pharmacyId,
      lines: rx.lineItems.map((li) => ({
        drugCode: li.drugCode,
        quantity: li.quantity,
      })),
      idempotencyKey: `dispense:${cmd.rxId}:${cmd.dispenseKey}`,
    });

    const expectedVersion = rx.version;
    const event = rx.dispense({
      now,
      pharmacistApprovalId: cmd.pharmacistApprovalId,
      stockAlreadyDecremented: true,
    });

    await this.repo.save(rx, expectedVersion);
    await this.events.publish(rx.pullDomainEvents());

    return {
      prescription: rx,
      event,
      stockNewlyApplied: stockResult.applied,
    };
  }

  private async assertCanDispense(
    rx: Prescription,
    now: Date,
    pharmacistApprovalId?: string | null,
  ): Promise<void> {
    if (rx.status !== RxStatus.CLAIMED) {
      throw new IllegalTransitionError(rx.status, RxStatus.DISPENSED);
    }
    if (rx.isExpiredAt(now)) {
      const expectedVersion = rx.version;
      try {
        rx.dispense({
          now,
          pharmacistApprovalId,
          stockAlreadyDecremented: true,
        });
      } catch (err) {
        if (rx.status === RxStatus.EXPIRED && rx.version !== expectedVersion) {
          try {
            await this.repo.save(rx, expectedVersion);
          } catch {
            // best-effort persist of EXPIRED
          }
        }
        if (err instanceof RxExpiredError) throw err;
        throw err;
      }
    }
    if (rx.hasControlledSubstances() && !pharmacistApprovalId?.trim()) {
      throw new ControlledSubstanceApprovalRequiredError(rx.id);
    }
  }
}
