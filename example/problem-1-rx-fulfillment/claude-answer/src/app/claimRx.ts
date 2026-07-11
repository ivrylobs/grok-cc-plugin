/**
 * ClaimRx — a pharmacy claims an issued Rx. Thin orchestration; every rule
 * (single-pharmacy binding, idempotency by claimKey, expiry, legal transition)
 * lives in the aggregate.
 */
import { RxId, PharmacyId, ClaimKey } from "../domain/ids.ts";
import { RxNotFoundError } from "../domain/errors.ts";
import type { RxRepository, EventPublisher, Clock } from "../ports/index.ts";

export type ClaimRxInput = {
  rxId: string;
  pharmacyId: string;
  claimKey: string;
};

export type ClaimRxResult = {
  rxId: string;
  status: string;
  pharmacyId: string;
  idempotentReplay: boolean;
};

export class ClaimRx {
  private readonly repo: RxRepository;
  private readonly events: EventPublisher;
  private readonly clock: Clock;

  constructor(deps: { repo: RxRepository; events: EventPublisher; clock: Clock }) {
    this.repo = deps.repo;
    this.events = deps.events;
    this.clock = deps.clock;
  }

  async execute(input: ClaimRxInput): Promise<ClaimRxResult> {
    const rxId = RxId(input.rxId);
    const pharmacyId = PharmacyId(input.pharmacyId);
    const claimKey = ClaimKey(input.claimKey);

    const rx = await this.repo.load(rxId);
    if (!rx) throw new RxNotFoundError(rxId);

    const expectedVersion = rx.version;
    const { changed } = rx.claim(pharmacyId, claimKey, this.clock.now());

    if (changed) {
      await this.repo.save(rx, expectedVersion);
      await this.events.publish(rx.pullEvents());
    }

    return {
      rxId: rx.id,
      status: rx.status,
      pharmacyId: rx.claimedByPharmacyId ?? pharmacyId,
      idempotentReplay: !changed,
    };
  }
}
