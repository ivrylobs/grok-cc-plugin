/**
 * DispenseRx — the pharmacy dispenses a claimed Rx. This is where exactly-once
 * stock decrement is coordinated.
 *
 * Ordering and why:
 *  1. Optional request-level idempotency: if we've already completed this
 *     (rxId, dispenseKey), return the stored result — stable response on retry.
 *  2. Load the aggregate.
 *  3. `rx.dispense(...)` validates and transitions IN MEMORY. If any rule fails
 *     (not claimed, wrong pharmacy, expired, controlled-without-approval,
 *     already dispensed) it throws BEFORE we touch stock — no partial effects.
 *  4. Decrement stock, idempotent by rxId. Insufficient stock fails the whole
 *     dispense (nothing persisted). A retry after a crash re-decrements with the
 *     same key -> `alreadyApplied`, so stock moves exactly once.
 *  5. Persist with optimistic version (compare-and-swap). Concurrent dispensers
 *     race here; exactly one save wins, the loser gets ConcurrencyError. Because
 *     the stock key is the rxId, the losing attempt did not double-spend stock.
 *  6. Publish `prescription.dispensed` only after the durable save.
 */
import { RxId, PharmacyId, DispenseKey, PharmacistApprovalId } from "../domain/ids.ts";
import { RxNotFoundError, InsufficientStockError } from "../domain/errors.ts";
import type {
  RxRepository,
  EventPublisher,
  StockPort,
  Clock,
  IdempotencyStore,
} from "../ports/index.ts";

export type DispenseRxInput = {
  rxId: string;
  pharmacyId: string;
  /** Required only when the Rx contains a controlled substance. */
  pharmacistApprovalId?: string;
  /** Client-supplied key for request-level idempotency. */
  dispenseKey: string;
};

export type DispenseRxResult = {
  rxId: string;
  status: string;
  dispensedLineItems: { drugCode: string; qty: number; controlled: boolean }[];
  idempotentReplay: boolean;
};

export class DispenseRx {
  private readonly repo: RxRepository;
  private readonly stock: StockPort;
  private readonly events: EventPublisher;
  private readonly clock: Clock;
  private readonly idempotency: IdempotencyStore<DispenseRxResult>;

  constructor(deps: {
    repo: RxRepository;
    stock: StockPort;
    events: EventPublisher;
    clock: Clock;
    idempotency: IdempotencyStore<DispenseRxResult>;
  }) {
    this.repo = deps.repo;
    this.stock = deps.stock;
    this.events = deps.events;
    this.clock = deps.clock;
    this.idempotency = deps.idempotency;
  }

  async execute(input: DispenseRxInput): Promise<DispenseRxResult> {
    const rxId = RxId(input.rxId);
    const pharmacyId = PharmacyId(input.pharmacyId);
    const dispenseKey = DispenseKey(input.dispenseKey);
    const approval =
      input.pharmacistApprovalId != null
        ? PharmacistApprovalId(input.pharmacistApprovalId)
        : null;

    const idemKey = `${rxId}:${dispenseKey}`;
    const cached = await this.idempotency.get(idemKey);
    if (cached) return { ...cached, idempotentReplay: true };

    const rx = await this.repo.load(rxId);
    if (!rx) throw new RxNotFoundError(rxId);

    const expectedVersion = rx.version;

    // Validate + transition in memory (throws on any rule violation).
    rx.dispense({ pharmacyId, pharmacistApprovalId: approval, now: this.clock.now() });

    // Exactly-once stock decrement, idempotent by rxId.
    const lines = rx.lineItems.map((li) => li.toProps());
    const stockResult = await this.stock.decrement(rxId, lines);
    if (!stockResult.ok) {
      // Nothing persisted; the in-memory transition is discarded.
      throw new InsufficientStockError(rxId, stockResult.shortfalls);
    }

    await this.repo.save(rx, expectedVersion);
    await this.events.publish(rx.pullEvents());

    const result: DispenseRxResult = {
      rxId: rx.id,
      status: rx.status,
      dispensedLineItems: lines,
      idempotentReplay: false,
    };
    await this.idempotency.put(idemKey, result);
    return result;
  }
}
