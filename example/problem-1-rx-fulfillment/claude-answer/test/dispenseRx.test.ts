import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp, NON_CONTROLLED, CONTROLLED } from "./helpers.ts";
import { PharmacyId } from "../src/domain/ids.ts";
import {
  InsufficientStockError,
  ControlledApprovalRequiredError,
  ConcurrencyError,
} from "../src/domain/errors.ts";

const YEAR = 365 * 24 * 60 * 60 * 1000;

async function claimed(
  app: ReturnType<typeof makeApp>,
  lineItems = NON_CONTROLLED,
  id = "rx-1",
) {
  await app.issueRx.execute({
    id,
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems,
    validForMs: YEAR,
  });
  await app.claimRx.execute({ rxId: id, pharmacyId: "ph-A", claimKey: "ck-1" });
}

test("DispenseRx dispenses, decrements stock once, emits event once", async () => {
  const app = makeApp({ "AMOX-500": 100 });
  await claimed(app);
  const res = await app.dispenseRx.execute({
    rxId: "rx-1",
    pharmacyId: "ph-A",
    dispenseKey: "dk-1",
  });
  assert.equal(res.status, "DISPENSED");
  assert.equal(res.idempotentReplay, false);
  assert.equal(app.stock.availableFor("AMOX-500"), 70); // 100 - 30
  assert.equal(app.events.ofType("prescription.dispensed").length, 1);
});

test("DispenseRx retry with same dispenseKey is idempotent — stock stays decremented once", async () => {
  const app = makeApp({ "AMOX-500": 100 });
  await claimed(app);
  await app.dispenseRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", dispenseKey: "dk-1" });
  const replay = await app.dispenseRx.execute({
    rxId: "rx-1",
    pharmacyId: "ph-A",
    dispenseKey: "dk-1",
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(app.stock.availableFor("AMOX-500"), 70); // still once
  assert.equal(app.events.ofType("prescription.dispensed").length, 1);
});

test("insufficient stock fails the whole dispense — no transition, no persist, no event", async () => {
  const app = makeApp({ "AMOX-500": 10 }); // need 30
  await claimed(app);
  await assert.rejects(
    () => app.dispenseRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", dispenseKey: "dk-1" }),
    InsufficientStockError,
  );
  const snap = await app.getRxStatus.execute({ rxId: "rx-1" });
  assert.equal(snap.status, "CLAIMED"); // unchanged
  assert.equal(app.stock.availableFor("AMOX-500"), 10); // untouched
  assert.equal(app.events.ofType("prescription.dispensed").length, 0);
});

test("controlled substance without approval is rejected before stock is touched", async () => {
  const app = makeApp({ "OXY-10": 100 });
  await claimed(app, CONTROLLED);
  await assert.rejects(
    () => app.dispenseRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", dispenseKey: "dk-1" }),
    ControlledApprovalRequiredError,
  );
  assert.equal(app.stock.availableFor("OXY-10"), 100); // not decremented
});

test("controlled substance with approval dispenses", async () => {
  const app = makeApp({ "OXY-10": 100 });
  await claimed(app, CONTROLLED);
  const res = await app.dispenseRx.execute({
    rxId: "rx-1",
    pharmacyId: "ph-A",
    pharmacistApprovalId: "appr-1",
    dispenseKey: "dk-1",
  });
  assert.equal(res.status, "DISPENSED");
  assert.equal(app.stock.availableFor("OXY-10"), 80);
});

test("exactly-once under concurrency: two racing dispensers -> one wins, one ConcurrencyError, stock decremented once", async () => {
  const app = makeApp({ "AMOX-500": 100 });
  await claimed(app);

  // Two transactions load the same CLAIMED Rx (same version) — a real race.
  const a = await app.repo.load("rx-1");
  const b = await app.repo.load("rx-1");
  assert.ok(a && b);
  const vA = a.version;
  const vB = b.version;
  const PH_A = PharmacyId("ph-A");

  a.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: app.clock.now() });
  b.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: app.clock.now() });

  // Both hit the idempotent stock port with the same key (rxId).
  const sA = await app.stock.decrement("rx-1", a.lineItems.map((l) => l.toProps()));
  const sB = await app.stock.decrement("rx-1", b.lineItems.map((l) => l.toProps()));
  assert.equal(sA.ok && sA.alreadyApplied, false);
  assert.equal(sB.ok && sB.alreadyApplied, true); // second is a no-op

  // Both try to persist; optimistic version lets exactly one win.
  await app.repo.save(a, vA);
  await assert.rejects(() => app.repo.save(b, vB), ConcurrencyError);

  assert.equal(app.stock.availableFor("AMOX-500"), 70); // decremented exactly once
});

test("DispenseRx rejects dispensing an unclaimed Rx", async () => {
  const app = makeApp({ "AMOX-500": 100 });
  await app.issueRx.execute({
    id: "rx-2",
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems: NON_CONTROLLED,
    validForMs: YEAR,
  });
  await assert.rejects(
    () => app.dispenseRx.execute({ rxId: "rx-2", pharmacyId: "ph-A", dispenseKey: "dk-1" }),
  );
});
