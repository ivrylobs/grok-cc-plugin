/**
 * IssueRx — a doctor issues a new prescription. Supporting use case so the
 * three core ones have something to act on.
 */
import { Rx } from "../domain/rx.ts";
import type { LineItemProps } from "../domain/lineItem.ts";
import type { RxRepository, Clock } from "../ports/index.ts";

export type IssueRxInput = {
  id: string;
  patientId: string;
  prescriberId: string;
  lineItems: LineItemProps[];
  /** Validity window in milliseconds from now. */
  validForMs: number;
};

export class IssueRx {
  private readonly repo: RxRepository;
  private readonly clock: Clock;

  constructor(deps: { repo: RxRepository; clock: Clock }) {
    this.repo = deps.repo;
    this.clock = deps.clock;
  }

  async execute(input: IssueRxInput): Promise<{ rxId: string; status: string }> {
    const now = this.clock.now();
    const rx = Rx.issue({
      id: input.id,
      patientId: input.patientId,
      prescriberId: input.prescriberId,
      lineItems: input.lineItems,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + input.validForMs),
    });
    await this.repo.save(rx, 0);
    return { rxId: rx.id, status: rx.status };
  }
}
