import { NotFoundError } from "../domain/errors.ts";
import type { Prescription } from "../domain/prescription.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

export interface ClaimRxCommand {
  readonly rxId: string;
  readonly pharmacyId: string;
  readonly claimKey: string;
}

export class ClaimRx {
  private readonly repo: PrescriptionRepository;

  constructor(repo: PrescriptionRepository) {
    this.repo = repo;
  }

  async execute(cmd: ClaimRxCommand): Promise<Prescription> {
    const rx = await this.repo.getById(cmd.rxId);
    if (!rx) throw new NotFoundError("Prescription", cmd.rxId);

    const expectedVersion = rx.version;
    rx.claim(cmd.pharmacyId, cmd.claimKey);
    // No-op claim (idempotent) still "succeeds"; only persist if version bumped.
    if (rx.version !== expectedVersion) {
      await this.repo.save(rx, expectedVersion);
    }
    return rx;
  }
}
