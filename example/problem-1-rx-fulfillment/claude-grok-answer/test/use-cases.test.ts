import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AlreadyClaimedError,
  ApprovalRequiredError,
  ExpiredError,
  IllegalTransitionError,
  InsufficientStockError,
} from "../src/domain/errors.ts";
import { ClaimRx } from "../src/app/claim-rx.ts";
import { DispenseRx } from "../src/app/dispense-rx.ts";
import { GetRxStatus } from "../src/app/get-rx.ts";
import { IssueRx } from "../src/app/issue-rx.ts";
import { ShipRx } from "../src/app/ship-rx.ts";
import {
  FixedClock,
  InMemoryApprovalPort,
  InMemoryEventBus,
  InMemoryPrescriptionRepository,
  InMemoryStock,
} from "../src/adapters/index.ts";

function harness(now = new Date("2026-01-15T12:00:00Z")) {
  const clock = new FixedClock(now);
  const repo = new InMemoryPrescriptionRepository();
  const stock = new InMemoryStock();
  const events = new InMemoryEventBus();
  const approvals = new InMemoryApprovalPort();
  stock.seed("DRUG-A", 100);
  stock.seed("CTRL-1", 50);

  const issue = new IssueRx(repo, clock);
  const claim = new ClaimRx(repo, clock, events);
  const dispense = new DispenseRx(repo, stock, clock, events, approvals);
  const ship = new ShipRx(repo, clock, events);
  const get = new GetRxStatus(repo);

  return { clock, repo, stock, events, approvals, issue, claim, dispense, ship, get };
}

async function issuedClaimed(
  h: ReturnType<typeof harness>,
  opts: {
    id?: string;
    controlled?: boolean;
    drugCode?: string;
    qty?: number;
  } = {},
) {
  const id = opts.id ?? "rx-1";
  await h.issue.execute({
    id,
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems: [
      {
        drugCode: opts.drugCode ?? (opts.controlled ? "CTRL-1" : "DRUG-A"),
        qty: opts.qty ?? 10,
        controlled: opts.controlled ?? false,
      },
    ],
    issuedAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2026-02-01T00:00:00Z"),
  });
  await h.claim.execute({
    rxId: id,
    pharmacyId: "pharm-1",
    claimKey: `ck-${id}`,
  });
  return id;
}

describe("IssueRx / GetRxStatus", () => {
  it("issues and returns status snapshot", async () => {
    const h = harness();
    await h.issue.execute({
      id: "rx-q",
      patientId: "pat-1",
      prescriberId: "doc-1",
      lineItems: [{ drugCode: "DRUG-A", qty: 5, controlled: false }],
      issuedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-02-01T00:00:00Z"),
    });
    const snap = await h.get.execute("rx-q");
    assert.equal(snap.status, "ISSUED");
    assert.equal(snap.patientId, "pat-1");
  });
});

describe("ClaimRx use case", () => {
  it("claims successfully and publishes event", async () => {
    const h = harness();
    await h.issue.execute({
      id: "rx-c",
      patientId: "pat-1",
      prescriberId: "doc-1",
      lineItems: [{ drugCode: "DRUG-A", qty: 5, controlled: false }],
      issuedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-02-01T00:00:00Z"),
    });
    const rx = await h.claim.execute({
      rxId: "rx-c",
      pharmacyId: "pharm-1",
      claimKey: "ck-1",
    });
    assert.equal(rx.status, "CLAIMED");
    assert.equal(h.events.ofType("prescription.claimed").length, 1);
  });

  it("idempotent claim by (rxId, claimKey)", async () => {
    const h = harness();
    await h.issue.execute({
      id: "rx-idem",
      patientId: "pat-1",
      prescriberId: "doc-1",
      lineItems: [{ drugCode: "DRUG-A", qty: 5, controlled: false }],
      issuedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-02-01T00:00:00Z"),
    });
    await h.claim.execute({
      rxId: "rx-idem",
      pharmacyId: "pharm-1",
      claimKey: "ck-same",
    });
    const again = await h.claim.execute({
      rxId: "rx-idem",
      pharmacyId: "pharm-1",
      claimKey: "ck-same",
    });
    assert.equal(again.status, "CLAIMED");
    assert.equal(h.events.ofType("prescription.claimed").length, 1);
  });

  it("rejects double-claim by second pharmacy", async () => {
    const h = harness();
    await issuedClaimed(h, { id: "rx-dbl" });
    await assert.rejects(
      () =>
        h.claim.execute({
          rxId: "rx-dbl",
          pharmacyId: "pharm-2",
          claimKey: "ck-other",
        }),
      AlreadyClaimedError,
    );
  });
});

describe("DispenseRx use case", () => {
  it("dispenses, decrements stock once, emits event", async () => {
    const h = harness();
    await issuedClaimed(h, { id: "rx-d", qty: 10 });
    const before = await h.stock.available!("DRUG-A");
    const rx = await h.dispense.execute({
      rxId: "rx-d",
      idempotencyKey: "d-1",
    });
    assert.equal(rx.status, "DISPENSED");
    assert.equal(await h.stock.available!("DRUG-A"), before - 10);
    assert.equal(h.stock.applyCount, 1);
    assert.equal(h.events.ofType("prescription.dispensed").length, 1);
  });

  it("idempotent dispense retry does not re-decrement stock", async () => {
    const h = harness();
    await issuedClaimed(h, { id: "rx-retry", qty: 10 });
    await h.dispense.execute({ rxId: "rx-retry", idempotencyKey: "k1" });
    await h.dispense.execute({ rxId: "rx-retry", idempotencyKey: "k1" });
    assert.equal(h.stock.applyCount, 1);
    assert.equal(await h.stock.available!("DRUG-A"), 90);
    assert.equal(h.events.ofType("prescription.dispensed").length, 1);
  });

  it("rejects expired", async () => {
    const h = harness(new Date("2026-03-01T00:00:00Z"));
    // issue/claim with fixed past dates while clock is already past expiry
    await h.issue.execute({
      id: "rx-exp",
      patientId: "pat-1",
      prescriberId: "doc-1",
      lineItems: [{ drugCode: "DRUG-A", qty: 5, controlled: false }],
      issuedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-02-01T00:00:00Z"),
    });
    // claim also checks expiry on ISSUED — so claim first at valid time
    h.clock.set(new Date("2026-01-15T00:00:00Z"));
    await h.claim.execute({
      rxId: "rx-exp",
      pharmacyId: "pharm-1",
      claimKey: "ck",
    });
    h.clock.set(new Date("2026-03-01T00:00:00Z"));
    await assert.rejects(
      () => h.dispense.execute({ rxId: "rx-exp" }),
      ExpiredError,
    );
  });

  it("rejects controlled without approval", async () => {
    const h = harness();
    await issuedClaimed(h, { id: "rx-ctrl", controlled: true });
    await assert.rejects(
      () => h.dispense.execute({ rxId: "rx-ctrl" }),
      ApprovalRequiredError,
    );
  });

  it("accepts controlled with valid approval", async () => {
    const h = harness();
    await issuedClaimed(h, { id: "rx-ctrl-ok", controlled: true });
    h.approvals.grant("appr-9");
    const rx = await h.dispense.execute({
      rxId: "rx-ctrl-ok",
      pharmacistApprovalId: "appr-9",
    });
    assert.equal(rx.status, "DISPENSED");
  });

  it("fails whole dispense on insufficient stock", async () => {
    const h = harness();
    h.stock.seed("DRUG-A", 2);
    await issuedClaimed(h, { id: "rx-nostock", qty: 10 });
    await assert.rejects(
      () => h.dispense.execute({ rxId: "rx-nostock" }),
      InsufficientStockError,
    );
    const snap = await h.get.execute("rx-nostock");
    assert.equal(snap.status, "CLAIMED"); // not advanced
    assert.equal(h.stock.applyCount, 0);
  });

  it("exactly-once stock under concurrent dispense", async () => {
    const h = harness();
    await issuedClaimed(h, { id: "rx-conc", qty: 10 });
    const before = await h.stock.available!("DRUG-A");

    const results = await Promise.allSettled([
      h.dispense.execute({ rxId: "rx-conc", idempotencyKey: "c-a" }),
      h.dispense.execute({ rxId: "rx-conc", idempotencyKey: "c-b" }),
      h.dispense.execute({ rxId: "rx-conc", idempotencyKey: "c-c" }),
      h.dispense.execute({ rxId: "rx-conc", idempotencyKey: "c-d" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.ok(fulfilled.length >= 1);

    // All successes must report DISPENSED; stock applied exactly once
    for (const r of fulfilled) {
      if (r.status === "fulfilled") {
        assert.equal(r.value.status, "DISPENSED");
      }
    }
    assert.equal(h.stock.applyCount, 1);
    assert.equal(await h.stock.available!("DRUG-A"), before - 10);
    assert.equal(h.events.ofType("prescription.dispensed").length, 1);

    const final = await h.get.execute("rx-conc");
    assert.equal(final.status, "DISPENSED");
  });
});

describe("ShipRx use case", () => {
  it("ships after dispense", async () => {
    const h = harness();
    await issuedClaimed(h, { id: "rx-ship" });
    await h.dispense.execute({ rxId: "rx-ship" });
    const rx = await h.ship.execute({ rxId: "rx-ship" });
    assert.equal(rx.status, "SHIPPED");
    assert.equal(h.events.ofType("prescription.shipped").length, 1);
  });

  it("rejects ship before dispense", async () => {
    const h = harness();
    await issuedClaimed(h, { id: "rx-noship" });
    await assert.rejects(
      () => h.ship.execute({ rxId: "rx-noship" }),
      IllegalTransitionError,
    );
  });
});
