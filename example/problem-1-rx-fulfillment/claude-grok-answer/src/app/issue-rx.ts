import { Prescription } from "../domain/prescription.ts";
import type { Clock } from "../ports/clock.ts";
import type { PrescriptionRepository } from "../ports/prescription-repository.ts";

export interface IssueRxInput {
  id: string;
  patientId: string;
  prescriberId: string;
  lineItems: Array<{ drugCode: string; qty: number; controlled: boolean }>;
  /** Defaults to now; expiresAt required or defaults to +30d. */
  issuedAt?: Date;
  expiresAt?: Date;
  expiresInMs?: number;
}

export class IssueRx {
  private readonly repo: PrescriptionRepository;
  private readonly clock: Clock;

  constructor(repo: PrescriptionRepository, clock: Clock) {
    this.repo = repo;
    this.clock = clock;
  }

  async execute(input: IssueRxInput): Promise<Prescription> {
    const issuedAt = input.issuedAt ?? this.clock.now();
    const expiresAt =
      input.expiresAt ??
      new Date(issuedAt.getTime() + (input.expiresInMs ?? 30 * 24 * 60 * 60 * 1000));

    const rx = Prescription.issue({
      id: input.id,
      patientId: input.patientId,
      prescriberId: input.prescriberId,
      lineItems: input.lineItems,
      issuedAt,
      expiresAt,
    });
    await this.repo.insert(rx);
    return rx;
  }
}
