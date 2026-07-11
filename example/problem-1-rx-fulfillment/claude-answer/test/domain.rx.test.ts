/**
 * Pure aggregate invariant tests — no adapters, no use cases. These pin the
 * business rules directly on the Rx aggregate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Rx, RxStatus } from "../src/domain/rx.ts";
import { PharmacyId, ClaimKey, PharmacistApprovalId } from "../src/domain/ids.ts";
import {
  ValidationError,
  RxExpiredError,
  IllegalTransitionError,
  AlreadyClaimedError,
  ControlledApprovalRequiredError,
  NotClaimedByPharmacyError,
} from "../src/domain/errors.ts";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function issue(overrides: Partial<Parameters<typeof Rx.issue>[0]> = {}): Rx {
  return Rx.issue({
    id: "rx-1",
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems: [{ drugCode: "AMOX-500", qty: 30, controlled: false }],
    issuedAt: T0,
    expiresAt: new Date(T0.getTime() + 30 * DAY),
    ...overrides,
  });
}

const PH_A = PharmacyId("pharm-A");
const PH_B = PharmacyId("pharm-B");
const KEY1 = ClaimKey("ck-1");

test("issue rejects empty line items", () => {
  assert.throws(() => issue({ lineItems: [] }), ValidationError);
});

test("issue rejects expiresAt <= issuedAt", () => {
  assert.throws(() => issue({ expiresAt: T0 }), ValidationError);
});

test("issue rejects non-positive / non-integer qty", () => {
  assert.throws(
    () => issue({ lineItems: [{ drugCode: "X", qty: 0, controlled: false }] }),
    ValidationError,
  );
  assert.throws(
    () => issue({ lineItems: [{ drugCode: "X", qty: 1.5, controlled: false }] }),
    ValidationError,
  );
});

test("claim binds to one pharmacy and transitions to CLAIMED", () => {
  const rx = issue();
  const r = rx.claim(PH_A, KEY1, T0);
  assert.equal(r.changed, true);
  assert.equal(rx.status, RxStatus.Claimed);
  assert.equal(rx.claimedByPharmacyId, PH_A);
});

test("claim is idempotent by (pharmacy, claimKey) — replay is a no-op", () => {
  const rx = issue();
  rx.pullEvents(); // clear any nothing
  const first = rx.claim(PH_A, KEY1, T0);
  const events1 = rx.pullEvents();
  const second = rx.claim(PH_A, KEY1, T0);
  const events2 = rx.pullEvents();
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(events1.length, 1);
  assert.equal(events2.length, 0);
  assert.equal(rx.version, 1); // no double bump
});

test("second pharmacy claiming an already-claimed Rx fails", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  assert.throws(() => rx.claim(PH_B, ClaimKey("ck-2"), T0), AlreadyClaimedError);
});

test("cannot claim an expired Rx", () => {
  const rx = issue();
  const afterExpiry = new Date(T0.getTime() + 31 * DAY);
  assert.throws(() => rx.claim(PH_A, KEY1, afterExpiry), RxExpiredError);
});

test("cannot dispense before claim (illegal transition)", () => {
  const rx = issue();
  assert.throws(
    () => rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 }),
    IllegalTransitionError,
  );
});

test("dispense must be by the claiming pharmacy", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  assert.throws(
    () => rx.dispense({ pharmacyId: PH_B, pharmacistApprovalId: null, now: T0 }),
    NotClaimedByPharmacyError,
  );
});

test("controlled substance requires pharmacistApprovalId", () => {
  const rx = issue({ lineItems: [{ drugCode: "OXY-10", qty: 10, controlled: true }] });
  rx.claim(PH_A, KEY1, T0);
  assert.throws(
    () => rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 }),
    ControlledApprovalRequiredError,
  );
  // With approval it succeeds.
  rx.dispense({
    pharmacyId: PH_A,
    pharmacistApprovalId: PharmacistApprovalId("appr-1"),
    now: T0,
  });
  assert.equal(rx.status, RxStatus.Dispensed);
});

test("non-controlled does not require approval", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 });
  assert.equal(rx.status, RxStatus.Dispensed);
});

test("cannot dispense an expired Rx even when claimed", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  const afterExpiry = new Date(T0.getTime() + 31 * DAY);
  assert.throws(
    () => rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: afterExpiry }),
    RxExpiredError,
  );
});

test("cannot dispense twice (already dispensed)", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 });
  assert.throws(
    () => rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 }),
    IllegalTransitionError,
  );
});

test("dispense emits prescription.dispensed with line items", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  rx.pullEvents();
  rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 });
  const events = rx.pullEvents();
  const dispensed = events.filter((e) => e.type === "prescription.dispensed");
  assert.equal(dispensed.length, 1);
  const e = dispensed[0];
  assert.equal(e.type, "prescription.dispensed");
  if (e.type === "prescription.dispensed") {
    assert.equal(e.rxId, "rx-1");
    assert.equal(e.pharmacyId, PH_A);
    assert.equal(e.lineItems.length, 1);
    assert.equal(e.lineItems[0].drugCode, "AMOX-500");
  }
});

test("lifecycle ISSUED -> CLAIMED -> DISPENSED -> SHIPPED", () => {
  const rx = issue();
  assert.equal(rx.status, RxStatus.Issued);
  rx.claim(PH_A, KEY1, T0);
  assert.equal(rx.status, RxStatus.Claimed);
  rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 });
  assert.equal(rx.status, RxStatus.Dispensed);
  rx.ship({ carrier: "UPS", trackingId: "1Z", now: T0 });
  assert.equal(rx.status, RxStatus.Shipped);
});

test("cannot ship before dispense (illegal transition)", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  assert.throws(
    () => rx.ship({ carrier: null, trackingId: null, now: T0 }),
    IllegalTransitionError,
  );
});

test("cannot claim after dispense (illegal transition)", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  rx.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 });
  assert.throws(() => rx.claim(PH_B, ClaimKey("ck-9"), T0), IllegalTransitionError);
});

test("terminal states reject further transitions", () => {
  const shipped = issue();
  shipped.claim(PH_A, KEY1, T0);
  shipped.dispense({ pharmacyId: PH_A, pharmacistApprovalId: null, now: T0 });
  shipped.ship({ carrier: null, trackingId: null, now: T0 });
  assert.throws(
    () => shipped.ship({ carrier: null, trackingId: null, now: T0 }),
    IllegalTransitionError,
  );

  const cancelled = issue();
  cancelled.cancel();
  assert.throws(() => cancelled.claim(PH_A, KEY1, T0), IllegalTransitionError);
});

test("snapshot round-trips through fromSnapshot", () => {
  const rx = issue();
  rx.claim(PH_A, KEY1, T0);
  const back = Rx.fromSnapshot(rx.toSnapshot());
  assert.equal(back.status, RxStatus.Claimed);
  assert.equal(back.version, rx.version);
  assert.equal(back.claimedByPharmacyId, PH_A);
});
