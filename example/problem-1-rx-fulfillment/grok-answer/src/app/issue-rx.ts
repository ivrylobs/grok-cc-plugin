import { Prescription } from "../domain/prescription.ts";
import type { LineItemProps } from "../domain/line-item.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

export interface IssueRxCommand {
  readonly id: string;
  readonly patientId: string;
  readonly prescriberId: string;
  readonly lineItems: ReadonlyArray<LineItemProps>;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export class IssueRx {
  private readonly repo: PrescriptionRepository;

  constructor(repo: PrescriptionRepository) {
    this.repo = repo;
  }

  async execute(cmd: IssueRxCommand): Promise<Prescription> {
    const existing = await this.repo.getById(cmd.id);
    if (existing) {
      return existing;
    }
    const rx = Prescription.issue(cmd);
    await this.repo.save(rx, -1); // -1 = create
    return rx;
  }
}
