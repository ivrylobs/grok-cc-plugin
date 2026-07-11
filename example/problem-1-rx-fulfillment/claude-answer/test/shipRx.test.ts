import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp, NON_CONTROLLED } from "./helpers.ts";
import { IllegalTransitionError } from "../src/domain/errors.ts";

const YEAR = 365 * 24 * 60 * 60 * 1000;

test("full happy path ISSUED -> CLAIMED -> DISPENSED -> SHIPPED via use cases", async () => {
  const app = makeApp({ "AMOX-500": 100 });
  await app.issueRx.execute({
    id: "rx-1",
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems: NON_CONTROLLED,
    validForMs: YEAR,
  });
  await app.claimRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", claimKey: "ck-1" });
  await app.dispenseRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", dispenseKey: "dk-1" });
  const res = await app.shipRx.execute({ rxId: "rx-1", carrier: "UPS", trackingId: "1Z999" });

  assert.equal(res.status, "SHIPPED");
  const shipped = app.events.ofType("prescription.shipped");
  assert.equal(shipped.length, 1);
  const snap = await app.getRxStatus.execute({ rxId: "rx-1" });
  assert.equal(snap.status, "SHIPPED");
  assert.equal(snap.shipping?.trackingId, "1Z999");
});

test("cannot ship a claimed-but-not-dispensed Rx", async () => {
  const app = makeApp({ "AMOX-500": 100 });
  await app.issueRx.execute({
    id: "rx-1",
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems: NON_CONTROLLED,
    validForMs: YEAR,
  });
  await app.claimRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", claimKey: "ck-1" });
  await assert.rejects(() => app.shipRx.execute({ rxId: "rx-1" }), IllegalTransitionError);
});
