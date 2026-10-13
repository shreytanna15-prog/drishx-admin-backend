import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateProcurementQuantity,
  combineIncomingQuantities,
  findDuplicatePowersInDraft,
  lineAmount,
  openPoLineOutstanding,
  unallocatedProcurementQuantity,
} from "./purchase-order-math";
import { PO_DOCUMENT_STATUS_LABELS } from "./purchase-order-document";
import { poDispatchState } from "./purchase-order-sent";

describe("openPoLineOutstanding", () => {
  it("subtracts received and cancelled", () => {
    assert.equal(
      openPoLineOutstanding({
        poQuantity: 100,
        receivedQuantity: 40,
        cancelledQuantity: 10,
      }),
      50
    );
  });

  it("never goes negative", () => {
    assert.equal(
      openPoLineOutstanding({
        poQuantity: 10,
        receivedQuantity: 12,
        cancelledQuantity: 0,
      }),
      0
    );
  });
});

describe("PR allocation + incoming (no double count)", () => {
  it("allocates partial PR quantities", () => {
    const first = allocateProcurementQuantity(
      { requestedQuantity: 50, orderedQuantity: 0 },
      30
    );
    assert.equal(first.allocated, 30);
    assert.equal(first.orderedAfter, 30);

    const second = allocateProcurementQuantity(
      { requestedQuantity: 50, orderedQuantity: 30 },
      40
    );
    assert.equal(second.allocated, 20);
    assert.equal(second.orderedAfter, 50);
  });

  it("incoming = open PO outstanding + unallocated PR only", () => {
    // PO covers 30 of a 50 PR → unallocated PR 20; open PO outstanding 30.
    const unallocated = unallocatedProcurementQuantity({
      requestedQuantity: 50,
      orderedQuantity: 30,
    });
    assert.equal(unallocated, 20);
    assert.equal(
      combineIncomingQuantities({
        openPoOutstanding: 30,
        unallocatedPrOutstanding: unallocated,
      }),
      50
    );
    // Draft PO must not inflate incoming — callers pass 0 for drafts.
    assert.equal(
      combineIncomingQuantities({
        openPoOutstanding: 0,
        unallocatedPrOutstanding: 50,
      }),
      50
    );
  });
});

describe("draft power uniqueness", () => {
  it("flags duplicate lensType+lensId in one draft", () => {
    const dupes = findDuplicatePowersInDraft([
      { lensType: "SINGLE_VISION", lensId: "a" },
      { lensType: "SINGLE_VISION", lensId: "b" },
      { lensType: "SINGLE_VISION", lensId: "a" },
    ]);
    assert.deepEqual(dupes, ["SINGLE_VISION::a"]);
  });
});

describe("lineAmount", () => {
  it("rounds money to 2 decimals", () => {
    assert.equal(lineAmount(3, 10.333), 31);
  });

  it("returns 0 when rate missing", () => {
    assert.equal(lineAmount(5, null), 0);
  });
});

describe("PO status labels keep approved/open distinct from sent", () => {
  it("never labels an approved-but-unsent PO as sent", () => {
    assert.equal(PO_DOCUMENT_STATUS_LABELS.OPEN.toLowerCase().includes("sent"), false);
    assert.match(PO_DOCUMENT_STATUS_LABELS.SENT, /sent/i);
    assert.equal(poDispatchState("OPEN", null), "NOT_SENT");
    assert.equal(poDispatchState("OPEN", "2026-10-13T00:00:00.000Z"), "SENT");
    assert.equal(poDispatchState("PENDING_APPROVAL", null), "NOT_APPROVED");
  });
});
