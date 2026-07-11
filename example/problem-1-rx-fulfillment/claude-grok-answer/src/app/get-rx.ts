import { NotFoundError } from "../domain/errors.ts";
import type { PrescriptionSnapshot } from "../domain/prescription.ts";
import { RxId } from "../domain/value-objects.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

export class GetRxStatus {
  private readonly repo: PrescriptionRepository;

  constructor(repo: PrescriptionRepository) {
    this.repo = repo;
  }

  async execute(rxId: string): Promise<PrescriptionSnapshot> {
    const rx = await this.repo.getById(RxId.create(rxId));
    if (!rx) throw new NotFoundError(`Rx ${rxId} not found`);
    return rx.toSnapshot();
  }
}
