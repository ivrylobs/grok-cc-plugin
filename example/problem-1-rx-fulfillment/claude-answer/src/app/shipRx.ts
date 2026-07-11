/**
 * ShipRx — the pharmacy ships a dispensed Rx to the patient. Only a DISPENSED
 * Rx can ship; the aggregate rejects any other source state.
 */
import { RxId } from "../domain/ids.ts";
import { RxNotFoundError } from "../domain/errors.ts";
import type { RxRepository, EventPublisher, Clock } from "../ports/index.ts";

export type ShipRxInput = {
  rxId: string;
  carrier?: string;
  trackingId?: string;
};

export type ShipRxResult = { rxId: string; status: string };

export class ShipRx {
  private readonly repo: RxRepository;
  private readonly events: EventPublisher;
  private readonly clock: Clock;

  constructor(deps: { repo: RxRepository; events: EventPublisher; clock: Clock }) {
    this.repo = deps.repo;
    this.events = deps.events;
    this.clock = deps.clock;
  }

  async execute(input: ShipRxInput): Promise<ShipRxResult> {
    const rxId = RxId(input.rxId);
    const rx = await this.repo.load(rxId);
    if (!rx) throw new RxNotFoundError(rxId);

    const expectedVersion = rx.version;
    rx.ship({
      carrier: input.carrier ?? null,
      trackingId: input.trackingId ?? null,
      now: this.clock.now(),
    });

    await this.repo.save(rx, expectedVersion);
    await this.events.publish(rx.pullEvents());
    return { rxId: rx.id, status: rx.status };
  }
}
