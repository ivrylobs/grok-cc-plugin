import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Prescription } from "../src/domain/prescription.ts";
import { RxStatus } from "../src/domain/status.ts";
import {
  AlreadyClaimedError,
  AlreadyDispensedError,
  ControlledSubstanceApprovalRequiredError,
  IllegalTransitionError,
  RxExpiredError,
  ValidationError,
} from "../src/domain/errors.ts";

const day = 24 * 60 * 60 * 1000;

function issuedRx(overrides: Partial<{
  id: string;
  controlled: boolean;
  issuedAt: Date;
  expiresAt: Date;
}> = {}) {
  const issuedAt = overrides.issuedAt ?? new Date("2026-01-01T00:00:00Z");
  const expiresAt =
    overrides.expiresAt ?? new Date(issuedAt.getTime() + 30 * day);
  return Prescription.issue({
    id: overrides.id ?? "rx-1",
    patientId: "pat-1",
    prescriberId: "doc-1",
    lineItems: [
      {
        drugCode: "DRUG-A",
        quantity: 30,
        controlled: overrides.controlled ?? false,
      },
    ],
    issuedAt,
    expiresAt,
  });
}

describe("Prescription domain invariants", () => {
  it("issues with ISSUED status and required fields", () => {
    const rx = issuedRx();
    assert.equal(rx.status, RxStatus.ISSUED);
    assert.equal(rx.lineItems.length, 1);
    assert.equal(rx.version, 0);
  });

  it("rejects empty line items", () => {
    assert.throws(
      () =>
        Prescription.issue({
          id: "rx-x",
          patientId: "p",
          prescriberId: "d",
          lineItems: [],
          issuedAt: new Date("2026-01-01"),
          expiresAt: new Date("2026-02-01"),
        }),
      ValidationError,
    );
  });

  it("claims ISSUED → CLAIMED and binds one pharmacy", () => {
    const rx = issuedRx();
    rx.claim("pharm-1", "claim-key-1");
    assert.equal(rx.status, RxStatus.CLAIMED);
    assert.equal(rx.claimedByPharmacyId, "pharm-1");
    assert.equal(rx.claimKey, "claim-key-1");
  });

  it("claim is idempotent for same pharmacy + claimKey", () => {
    const rx = issuedRx();
    rx.claim("pharm-1", "claim-key-1");
    const v = rx.version;
    rx.claim("pharm-1", "claim-key-1");
    assert.equal(rx.version, v);
    assert.equal(rx.status, RxStatus.CLAIMED);
  });

  it("rejects second pharmacy claiming an already-claimed Rx", () => {
    const rx = issuedRx();
    rx.claim("pharm-1", "claim-key-1");
    assert.throws(() => rx.claim("pharm-2", "claim-key-2"), AlreadyClaimedError);
  });

  it("rejects different pharmacy with same claimKey", () => {
    const rx = issuedRx();
    rx.claim("pharm-1", "claim-key-1");
    assert.throws(() => rx.claim("pharm-2", "claim-key-1"), AlreadyClaimedError);
  });

  it("rejects dispense when not CLAIMED", () => {
    const rx = issuedRx();
    assert.throws(
      () =>
        rx.dispense({
          now: new Date("2026-01-02"),
          stockAlreadyDecremented: true,
        }),
      IllegalTransitionError,
    );
  });

  it("rejects dispense of expired Rx and transitions to EXPIRED", () => {
    const issuedAt = new Date("2026-01-01T00:00:00Z");
    const expiresAt = new Date("2026-01-10T00:00:00Z");
    const rx = issuedRx({ issuedAt, expiresAt });
    rx.claim("pharm-1", "k1");
    assert.throws(
      () =>
        rx.dispense({
          now: new Date("2026-01-11T00:00:00Z"),
          stockAlreadyDecremented: true,
        }),
      RxExpiredError,
    );
    assert.equal(rx.status, RxStatus.EXPIRED);
  });

  it("rejects already-dispensed Rx", () => {
    const rx = issuedRx();
    rx.claim("pharm-1", "k1");
    rx.dispense({
      now: new Date("2026-01-02"),
      stockAlreadyDecremented: true,
    });
    assert.throws(
      () =>
        rx.dispense({
          now: new Date("2026-01-03"),
          stockAlreadyDecremented: true,
        }),
      AlreadyDispensedError,
    );
  });

  it("requires pharmacistApprovalId for controlled substances", () => {
    const rx = issuedRx({ controlled: true });
    rx.claim("pharm-1", "k1");
    assert.throws(
      () =>
        rx.dispense({
          now: new Date("2026-01-02"),
          stockAlreadyDecremented: true,
        }),
      ControlledSubstanceApprovalRequiredError,
    );
  });

  it("dispenses controlled substance with approval and emits event", () => {
    const rx = issuedRx({ controlled: true });
    rx.claim("pharm-1", "k1");
    const event = rx.dispense({
      now: new Date("2026-01-02T12:00:00Z"),
      pharmacistApprovalId: "approval-9",
      stockAlreadyDecremented: true,
    });
    assert.equal(rx.status, RxStatus.DISPENSED);
    assert.equal(event.type, "prescription.dispensed");
    assert.equal(event.rxId, "rx-1");
    assert.equal(event.pharmacyId, "pharm-1");
    assert.equal(event.lineItems[0]!.drugCode, "DRUG-A");
    assert.equal(event.lineItems[0]!.quantity, 30);
    const pending = rx.pullDomainEvents();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.type, "prescription.dispensed");
  });

  it("dispenses non-controlled without approval", () => {
    const rx = issuedRx({ controlled: false });
    rx.claim("pharm-1", "k1");
    const event = rx.dispense({
      now: new Date("2026-01-02"),
      stockAlreadyDecremented: true,
    });
    assert.equal(event.type, "prescription.dispensed");
    assert.equal(rx.status, RxStatus.DISPENSED);
  });

  it("ships DISPENSED → SHIPPED", () => {
    const rx = issuedRx();
    rx.claim("pharm-1", "k1");
    rx.dispense({
      now: new Date("2026-01-02"),
      stockAlreadyDecremented: true,
    });
    rx.ship(new Date("2026-01-03"));
    assert.equal(rx.status, RxStatus.SHIPPED);
  });

  it("rejects illegal transition ISSUED → DISPENSED", () => {
    const rx = issuedRx();
    assert.throws(
      () =>
        rx.dispense({
          now: new Date("2026-01-02"),
          stockAlreadyDecremented: true,
        }),
      IllegalTransitionError,
    );
  });

  it("rejects ship before dispense", () => {
    const rx = issuedRx();
    rx.claim("pharm-1", "k1");
    assert.throws(
      () => rx.ship(new Date("2026-01-02")),
      IllegalTransitionError,
    );
  });

  it("rejects claim after dispense (illegal)", () => {
    const rx = issuedRx();
    rx.claim("pharm-1", "k1");
    rx.dispense({
      now: new Date("2026-01-02"),
      stockAlreadyDecremented: true,
    });
    assert.throws(() => rx.claim("pharm-2", "k2"), IllegalTransitionError);
  });
});
