import { NotFoundError } from "../domain/errors.ts";
import type { Prescription } from "../domain/prescription.ts";
import { RxId } from "../domain/value-objects.ts";
import type { Clock } from "../ports/clock.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

export interface ShipRxInput {
  rxId: string;
}

export class ShipRx {
  private readonly repo: PrescriptionRepository;
  private readonly clock: Clock;
  private readonly events: EventPublisher;

  constructor(
    repo: PrescriptionRepository,
    clock: Clock,
    events: EventPublisher,
  ) {
    this.repo = repo;
    this.clock = clock;
    this.events = events;
  }

  async execute(input: ShipRxInput): Promise<Prescription> {
    const id = RxId.create(input.rxId);
    const rx = await this.repo.getById(id);
    if (!rx) throw new NotFoundError(`Rx ${input.rxId} not found`);

    const expectedVersion = rx.version;
    rx.ship(this.clock.now());
    await this.repo.save(rx, expectedVersion);
    await this.events.publish(rx.pullEvents());
    return rx;
  }
}
