/** Shared wiring for the use-case tests. */
import { InMemoryRxRepository } from "../src/adapters/inMemoryRxRepository.ts";
import { InMemoryStock } from "../src/adapters/inMemoryStock.ts";
import { InMemoryEventPublisher } from "../src/adapters/inMemoryEventPublisher.ts";
import { InMemoryIdempotencyStore } from "../src/adapters/inMemoryIdempotencyStore.ts";
import { MutableClock } from "../src/adapters/systemClock.ts";
import { IssueRx } from "../src/app/issueRx.ts";
import { ClaimRx } from "../src/app/claimRx.ts";
import { DispenseRx } from "../src/app/dispenseRx.ts";
import type { DispenseRxResult } from "../src/app/dispenseRx.ts";
import { ShipRx } from "../src/app/shipRx.ts";
import { GetRxStatus } from "../src/app/getRxStatus.ts";
import type { LineItemProps } from "../src/domain/lineItem.ts";

export const T0 = new Date("2026-01-01T00:00:00.000Z");
export const DAY = 24 * 60 * 60 * 1000;

export function makeApp(stock: Record<string, number> = {}) {
  const repo = new InMemoryRxRepository();
  const stockPort = new InMemoryStock(stock);
  const events = new InMemoryEventPublisher();
  const idempotency = new InMemoryIdempotencyStore<DispenseRxResult>();
  const clock = new MutableClock(T0);

  return {
    repo,
    stock: stockPort,
    events,
    idempotency,
    clock,
    issueRx: new IssueRx({ repo, clock }),
    claimRx: new ClaimRx({ repo, events, clock }),
    dispenseRx: new DispenseRx({ repo, stock: stockPort, events, clock, idempotency }),
    shipRx: new ShipRx({ repo, events, clock }),
    getRxStatus: new GetRxStatus({ repo }),
  };
}

export const NON_CONTROLLED: LineItemProps[] = [
  { drugCode: "AMOX-500", qty: 30, controlled: false },
];

export const CONTROLLED: LineItemProps[] = [
  { drugCode: "OXY-10", qty: 20, controlled: true },
];
