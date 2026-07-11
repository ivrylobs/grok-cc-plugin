/**
 * GetRxStatus — read-side query. In production this reads a denormalized,
 * cached read model (see DESIGN.md); here it reads the same repository.
 */
import { RxId } from "../domain/ids.ts";
import { RxNotFoundError } from "../domain/errors.ts";
import type { RxRepository } from "../ports/index.ts";
import type { RxSnapshot } from "../domain/rx.ts";

export class GetRxStatus {
  private readonly repo: RxRepository;
  constructor(deps: { repo: RxRepository }) {
    this.repo = deps.repo;
  }

  async execute(input: { rxId: string }): Promise<RxSnapshot> {
    const rx = await this.repo.load(RxId(input.rxId));
    if (!rx) throw new RxNotFoundError(input.rxId);
    return rx.toSnapshot();
  }
}
