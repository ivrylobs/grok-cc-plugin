import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AlreadyClaimedError,
  ApprovalRequiredError,
  ExpiredError,
  IllegalTransitionError,
  InvalidValueError,
} from "../src/domain/errors.ts";
import { Prescription } from "../src/domain/prescription.ts";
import {
  ClaimKey,
  LineItem,
  PharmacistApprovalId,
  PharmacyId,
  Qty,
  RxId,
} from "../src/domain/value-objects.ts";

const issuedAt = new Date("2026-01-01T00:00:00Z");
const expiresAt = new Date("2026-02-01T00:00:00Z");
const now = new Date("2026-01-15T00:00:00Z");
const afterExpiry = new Date("2026-03-01T00:00:00Z");

function issued(overrides: Partial<Parameters<typeof Prescription.issue>[0]> = {}) {
  return Prescription.issue({
    id: "rx-1",
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems: [{ drugCode: "DRUG-A", qty: 30, controlled: false }],
    issuedAt,
    expiresAt,
    ...overrides,
  });
}

function claimed(
  overrides: Partial<Parameters<typeof Prescription.issue>[0]> = {},
) {
  const rx = issued(overrides);
  rx.claim(PharmacyId.create("pharm-1"), ClaimKey.create("ck-1"), now);
  return rx;
}

describe("value objects", () => {
  it("rejects empty ids and non-positive qty", () => {
    assert.throws(() => RxId.create(""), InvalidValueError);
    assert.throws(() => Qty.create(0), InvalidValueError);
    assert.throws(() => Qty.create(-1), InvalidValueError);
    assert.throws(() => LineItem.create({ drugCode: "X", qty: 0, controlled: false }), InvalidValueError);
  });

  it("rejects empty line list on issue", () => {
    assert.throws(
      () =>
        Prescription.issue({
          id: "rx",
          patientId: "p",
          prescriberId: "d",
          lineItems: [],
          issuedAt,
          expiresAt,
        }),
      InvalidValueError,
    );
  });
});

describe("claim invariants", () => {
  it("claims from ISSUED and binds pharmacy", () => {
    const rx = issued();
    rx.claim(PharmacyId.create("pharm-1"), ClaimKey.create("ck-1"), now);
    assert.equal(rx.status, "CLAIMED");
    assert.equal(rx.pharmacyId?.value, "pharm-1");
    assert.equal(rx.claimKey?.value, "ck-1");
    assert.equal(rx.version, 1);
  });

  it("is idempotent for same (rxId, claimKey, pharmacy)", () => {
    const rx = issued();
    const ph = PharmacyId.create("pharm-1");
    const ck = ClaimKey.create("ck-1");
    rx.claim(ph, ck, now);
    const v = rx.version;
    rx.claim(ph, ck, now);
    assert.equal(rx.status, "CLAIMED");
    assert.equal(rx.version, v); // no-op
  });

  it("rejects double-claim by another pharmacy", () => {
    const rx = claimed();
    assert.throws(
      () =>
        rx.claim(
          PharmacyId.create("pharm-2"),
          ClaimKey.create("ck-other"),
          now,
        ),
      AlreadyClaimedError,
    );
  });

  it("rejects same pharmacy with different claimKey", () => {
    const rx = claimed();
    assert.throws(
      () =>
        rx.claim(
          PharmacyId.create("pharm-1"),
          ClaimKey.create("ck-other"),
          now,
        ),
      AlreadyClaimedError,
    );
  });
});

describe("dispense invariants", () => {
  it("rejects expired Rx", () => {
    const rx = claimed();
    assert.throws(() => rx.dispense(afterExpiry), ExpiredError);
  });

  it("rejects controlled without approval", () => {
    const rx = claimed({
      lineItems: [{ drugCode: "CTRL-1", qty: 10, controlled: true }],
    });
    assert.throws(() => rx.dispense(now), ApprovalRequiredError);
  });

  it("allows controlled with approval", () => {
    const rx = claimed({
      lineItems: [{ drugCode: "CTRL-1", qty: 10, controlled: true }],
    });
    rx.dispense(now, {
      approvalId: PharmacistApprovalId.create("appr-1"),
    });
    assert.equal(rx.status, "DISPENSED");
    const events = rx.pullEvents();
    assert.equal(events.some((e) => e.type === "prescription.dispensed"), true);
  });

  it("idempotent dispense with same idempotency key", () => {
    const rx = claimed();
    rx.dispense(now, { idempotencyKey: "disp-1" });
    const v = rx.version;
    rx.dispense(now, { idempotencyKey: "disp-1" });
    assert.equal(rx.version, v);
    assert.equal(rx.status, "DISPENSED");
  });

  it("rejects dispense from ISSUED (illegal transition)", () => {
    const rx = issued();
    assert.throws(() => rx.dispense(now), IllegalTransitionError);
  });
});

describe("lifecycle transitions", () => {
  it("ISSUED → CLAIMED → DISPENSED → SHIPPED", () => {
    const rx = issued();
    rx.claim(PharmacyId.create("pharm-1"), ClaimKey.create("ck"), now);
    rx.dispense(now);
    rx.ship(now);
    assert.equal(rx.status, "SHIPPED");
  });

  it("rejects ship from CLAIMED", () => {
    const rx = claimed();
    assert.throws(() => rx.ship(now), IllegalTransitionError);
  });

  it("rejects claim from DISPENSED", () => {
    const rx = claimed();
    rx.dispense(now);
    assert.throws(
      () =>
        rx.claim(PharmacyId.create("pharm-1"), ClaimKey.create("ck-1"), now),
      IllegalTransitionError,
    );
  });

  it("allows cancel from ISSUED and CLAIMED only", () => {
    const a = issued();
    a.cancel(now);
    assert.equal(a.status, "CANCELLED");

    const b = claimed();
    b.cancel(now);
    assert.equal(b.status, "CANCELLED");

    const c = claimed();
    c.dispense(now);
    assert.throws(() => c.cancel(now), IllegalTransitionError);
  });

  it("markExpired only when past expiresAt", () => {
    const rx = issued();
    assert.throws(() => rx.markExpired(now), InvalidValueError);
    rx.markExpired(afterExpiry);
    assert.equal(rx.status, "EXPIRED");
  });
});
