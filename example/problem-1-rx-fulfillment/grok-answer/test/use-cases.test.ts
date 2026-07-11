import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { InMemoryPrescriptionRepository } from "../src/adapters/in-memory-prescription-repository.ts";
import { InMemoryStockService } from "../src/adapters/in-memory-stock.ts";
import { InMemoryEventPublisher } from "../src/adapters/in-memory-event-publisher.ts";
import { FixedClock } from "../src/adapters/system-clock.ts";
import { IssueRx } from "../src/app/issue-rx.ts";
import { ClaimRx } from "../src/app/claim-rx.ts";
import { DispenseRx } from "../src/app/dispense-rx.ts";
import { ShipRx } from "../src/app/ship-rx.ts";
import { RxStatus } from "../src/domain/status.ts";
import {
  AlreadyClaimedError,
  ControlledSubstanceApprovalRequiredError,
  IllegalTransitionError,
  InsufficientStockError,
  RxExpiredError,
} from "../src/domain/errors.ts";

const day = 24 * 60 * 60 * 1000;

describe("Use cases: ClaimRx / DispenseRx / ShipRx", () => {
  let repo: InMemoryPrescriptionRepository;
  let stock: InMemoryStockService;
  let events: InMemoryEventPublisher;
  let clock: FixedClock;
  let issue: IssueRx;
  let claim: ClaimRx;
  let dispense: DispenseRx;
  let ship: ShipRx;

  beforeEach(() => {
    repo = new InMemoryPrescriptionRepository();
    stock = new InMemoryStockService();
    events = new InMemoryEventPublisher();
    clock = new FixedClock(new Date("2026-01-05T12:00:00Z"));
    issue = new IssueRx(repo);
    claim = new ClaimRx(repo);
    dispense = new DispenseRx(repo, stock, events, clock);
    ship = new ShipRx(repo, clock);
  });

  async function seedRx(opts: {
    id?: string;
    controlled?: boolean;
    expiresAt?: Date;
  } = {}) {
    const id = opts.id ?? "rx-100";
    await issue.execute({
      id,
      patientId: "patient-1",
      prescriberId: "doctor-1",
      lineItems: [
        {
          drugCode: "AMOX-500",
          quantity: 20,
          controlled: opts.controlled ?? false,
        },
      ],
      issuedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: opts.expiresAt ?? new Date("2026-02-01T00:00:00Z"),
    });
    return id;
  }

  it("ClaimRx binds pharmacy and is idempotent by claimKey", async () => {
    const id = await seedRx();
    const a = await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    assert.equal(a.status, RxStatus.CLAIMED);
    assert.equal(a.claimedByPharmacyId, "pharmacy-A");

    const again = await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    assert.equal(again.status, RxStatus.CLAIMED);
    assert.equal(again.version, a.version);
  });

  it("ClaimRx rejects a second pharmacy", async () => {
    const id = await seedRx();
    await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    await assert.rejects(
      () =>
        claim.execute({
          rxId: id,
          pharmacyId: "pharmacy-B",
          claimKey: "ck-2",
        }),
      AlreadyClaimedError,
    );
  });

  it("concurrent claims: only one pharmacy wins", async () => {
    const id = await seedRx();
    const results = await Promise.allSettled([
      claim.execute({ rxId: id, pharmacyId: "pharmacy-A", claimKey: "cka" }),
      claim.execute({ rxId: id, pharmacyId: "pharmacy-B", claimKey: "ckb" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ status: string }>)
      .value;
    assert.equal(winner.status, RxStatus.CLAIMED);
    const stored = await repo.getById(id);
    assert.ok(stored);
    assert.equal(stored!.status, RxStatus.CLAIMED);
  });

  it("DispenseRx decrements stock exactly once under concurrent retries", async () => {
    const id = await seedRx();
    await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    stock.seed("pharmacy-A", "AMOX-500", 100);

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        dispense.execute({
          rxId: id,
          dispenseKey: "dk-shared",
          pharmacistApprovalId: null,
        }),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled");
    assert.ok(ok.length >= 1);

    const remaining = await stock.getAvailable("pharmacy-A", "AMOX-500");
    assert.equal(remaining, 80); // 100 - 20 exactly once

    const dispensedEvents = events.ofType("prescription.dispensed");
    assert.ok(dispensedEvents.length >= 1);
    assert.equal(dispensedEvents[0]!.rxId, id);
    assert.equal(dispensedEvents[0]!.pharmacyId, "pharmacy-A");

    const stored = await repo.getById(id);
    assert.equal(stored!.status, RxStatus.DISPENSED);
    assert.equal(stored!.stockDecremented, true);
  });

  it("DispenseRx fails whole dispense on insufficient stock (no partial)", async () => {
    const id = await seedRx();
    await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    stock.seed("pharmacy-A", "AMOX-500", 5); // need 20

    await assert.rejects(
      () =>
        dispense.execute({
          rxId: id,
          dispenseKey: "dk-1",
        }),
      InsufficientStockError,
    );

    const remaining = await stock.getAvailable("pharmacy-A", "AMOX-500");
    assert.equal(remaining, 5);
    const stored = await repo.getById(id);
    assert.equal(stored!.status, RxStatus.CLAIMED);
    assert.equal(events.ofType("prescription.dispensed").length, 0);
  });

  it("DispenseRx rejects expired Rx", async () => {
    const id = await seedRx({
      expiresAt: new Date("2026-01-03T00:00:00Z"),
    });
    await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    stock.seed("pharmacy-A", "AMOX-500", 100);
    clock.set(new Date("2026-01-10T00:00:00Z"));

    await assert.rejects(
      () =>
        dispense.execute({
          rxId: id,
          dispenseKey: "dk-1",
        }),
      RxExpiredError,
    );
    assert.equal(await stock.getAvailable("pharmacy-A", "AMOX-500"), 100);
  });

  it("DispenseRx requires approval for controlled substances", async () => {
    const id = await seedRx({ controlled: true });
    await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    stock.seed("pharmacy-A", "AMOX-500", 100);

    await assert.rejects(
      () =>
        dispense.execute({
          rxId: id,
          dispenseKey: "dk-1",
        }),
      ControlledSubstanceApprovalRequiredError,
    );

    const result = await dispense.execute({
      rxId: id,
      dispenseKey: "dk-1",
      pharmacistApprovalId: "RPh-42",
    });
    assert.equal(result.prescription.status, RxStatus.DISPENSED);
    assert.equal(result.event.type, "prescription.dispensed");
  });

  it("ShipRx completes lifecycle; illegal ship before dispense fails", async () => {
    const id = await seedRx();
    await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });

    await assert.rejects(
      () => ship.execute({ rxId: id }),
      IllegalTransitionError,
    );

    stock.seed("pharmacy-A", "AMOX-500", 100);
    await dispense.execute({ rxId: id, dispenseKey: "dk-1" });
    const shipped = await ship.execute({ rxId: id });
    assert.equal(shipped.status, RxStatus.SHIPPED);

    // Idempotent re-ship
    const again = await ship.execute({ rxId: id });
    assert.equal(again.status, RxStatus.SHIPPED);
  });

  it("full happy path ISSUED → CLAIMED → DISPENSED → SHIPPED", async () => {
    const id = await seedRx();
    await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    stock.seed("pharmacy-A", "AMOX-500", 50);
    const d = await dispense.execute({ rxId: id, dispenseKey: "dk-1" });
    assert.equal(d.event.type, "prescription.dispensed");
    assert.deepEqual(d.event.lineItems, [
      { drugCode: "AMOX-500", quantity: 20 },
    ]);
    const s = await ship.execute({ rxId: id });
    assert.equal(s.status, RxStatus.SHIPPED);
    assert.equal(await stock.getAvailable("pharmacy-A", "AMOX-500"), 30);
  });

  it("DispenseRx retry after success does not double-decrement stock", async () => {
    const id = await seedRx();
    await claim.execute({
      rxId: id,
      pharmacyId: "pharmacy-A",
      claimKey: "ck-1",
    });
    stock.seed("pharmacy-A", "AMOX-500", 40);

    await dispense.execute({ rxId: id, dispenseKey: "dk-1" });
    await dispense.execute({ rxId: id, dispenseKey: "dk-1" });

    assert.equal(await stock.getAvailable("pharmacy-A", "AMOX-500"), 20);
    const stored = await repo.getById(id);
    assert.equal(stored!.status, RxStatus.DISPENSED);
  });
});
