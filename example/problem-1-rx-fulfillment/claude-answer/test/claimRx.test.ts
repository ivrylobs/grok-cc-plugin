import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp, NON_CONTROLLED } from "./helpers.ts";
import { AlreadyClaimedError, RxNotFoundError, RxExpiredError } from "../src/domain/errors.ts";

async function issued(app: ReturnType<typeof makeApp>, id = "rx-1") {
  await app.issueRx.execute({
    id,
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems: NON_CONTROLLED,
    validForMs: 30 * 24 * 60 * 60 * 1000,
  });
}

test("ClaimRx claims an issued Rx", async () => {
  const app = makeApp();
  await issued(app);
  const res = await app.claimRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", claimKey: "ck-1" });
  assert.equal(res.status, "CLAIMED");
  assert.equal(res.pharmacyId, "ph-A");
  assert.equal(res.idempotentReplay, false);
  assert.equal(app.events.ofType("prescription.claimed").length, 1);
});

test("ClaimRx is idempotent — same (pharmacy, claimKey) replays without a second event", async () => {
  const app = makeApp();
  await issued(app);
  await app.claimRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", claimKey: "ck-1" });
  const replay = await app.claimRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", claimKey: "ck-1" });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(app.events.ofType("prescription.claimed").length, 1);
});

test("ClaimRx rejects a second pharmacy", async () => {
  const app = makeApp();
  await issued(app);
  await app.claimRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", claimKey: "ck-1" });
  await assert.rejects(
    () => app.claimRx.execute({ rxId: "rx-1", pharmacyId: "ph-B", claimKey: "ck-2" }),
    AlreadyClaimedError,
  );
});

test("ClaimRx rejects an expired Rx", async () => {
  const app = makeApp();
  await issued(app);
  app.clock.advanceMs(31 * 24 * 60 * 60 * 1000);
  await assert.rejects(
    () => app.claimRx.execute({ rxId: "rx-1", pharmacyId: "ph-A", claimKey: "ck-1" }),
    RxExpiredError,
  );
});

test("ClaimRx rejects unknown Rx", async () => {
  const app = makeApp();
  await assert.rejects(
    () => app.claimRx.execute({ rxId: "nope", pharmacyId: "ph-A", claimKey: "ck-1" }),
    RxNotFoundError,
  );
});
