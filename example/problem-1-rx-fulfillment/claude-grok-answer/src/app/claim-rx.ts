import { NotFoundError } from "../domain/errors.ts";
import type { Prescription } from "../domain/prescription.ts";
import { ClaimKey, PharmacyId, RxId } from "../domain/value-objects.ts";
import type { Clock } from "../ports/clock.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

export interface ClaimRxInput {
  rxId: string;
  pharmacyId: string;
  claimKey: string;
}

export class ClaimRx {
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

  async execute(input: ClaimRxInput): Promise<Prescription> {
    const id = RxId.create(input.rxId);
    const rx = await this.repo.getById(id);
    if (!rx) throw new NotFoundError(`Rx ${input.rxId} not found`);

    const expectedVersion = rx.version;
    rx.claim(
      PharmacyId.create(input.pharmacyId),
      ClaimKey.create(input.claimKey),
      this.clock.now(),
    );

    // Idempotent claim: no version bump → no save needed
    if (rx.version === expectedVersion) {
      return rx;
    }

    await this.repo.save(rx, expectedVersion);
    await this.events.publish(rx.pullEvents());
    return rx;
  }
}
