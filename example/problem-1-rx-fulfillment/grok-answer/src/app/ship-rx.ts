import { NotFoundError } from "../domain/errors.ts";
import type { Prescription } from "../domain/prescription.ts";
import type { Clock } from "../ports/clock.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

export interface ShipRxCommand {
  readonly rxId: string;
}

export class ShipRx {
  private readonly repo: PrescriptionRepository;
  private readonly clock: Clock;

  constructor(repo: PrescriptionRepository, clock: Clock) {
    this.repo = repo;
    this.clock = clock;
  }

  async execute(cmd: ShipRxCommand): Promise<Prescription> {
    const rx = await this.repo.getById(cmd.rxId);
    if (!rx) throw new NotFoundError("Prescription", cmd.rxId);

    const expectedVersion = rx.version;
    rx.ship(this.clock.now());
    if (rx.version !== expectedVersion) {
      await this.repo.save(rx, expectedVersion);
    }
    return rx;
  }
}
