import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateProcurementQuantity,
  findDuplicatePowersInDraft,
  incomingForPowerState,
  planLineAllocations,
  reverseAllocationQuantity,
  reversePoAllocationsOnPrMap,
} from "./purchase-order-math";

describe("exact allocation planning", () => {
  it("allocates one PR to one PO line", () => {
    const plan = planLineAllocations({
      want: 40,
      candidates: [{ id: "pr1", requestedQuantity: 40, orderedQuantity: 0 }],
    });
    assert.deepEqual(plan, [
      { procurementRequestId: "pr1", quantity: 40, orderedAfter: 40 },
    ]);
  });

  it("splits one PO line across multiple PRs (FIFO)", () => {
    const plan = planLineAllocations({
      want: 70,
      candidates: [
        { id: "pr1", requestedQuantity: 50, orderedQuantity: 0 },
        { id: "pr2", requestedQuantity: 40, orderedQuantity: 0 },
      ],
    });
    assert.deepEqual(plan, [
      { procurementRequestId: "pr1", quantity: 50, orderedAfter: 50 },
      { procurementRequestId: "pr2", quantity: 20, orderedAfter: 20 },
    ]);
  });

  it("supports partial allocation of a PR", () => {
    const plan = planLineAllocations({
      want: 15,
      preferredRequestId: "pr1",
      candidates: [
        { id: "pr1", requestedQuantity: 50, orderedQuantity: 10 },
        { id: "pr2", requestedQuantity: 30, orderedQuantity: 0 },
      ],
    });
    assert.deepEqual(plan, [
      { procurementRequestId: "pr1", quantity: 15, orderedAfter: 25 },
    ]);
  });

  it("never allocates more than remaining PR eligibility", () => {
    const step = allocateProcurementQuantity(
      { requestedQuantity: 20, orderedQuantity: 18 },
      50
    );
    assert.equal(step.allocated, 2);
    assert.equal(step.orderedAfter, 20);
  });
});

describe("multi-PO allocation isolation + cancel reverse", () => {
  it("two POs allocate without cross-contamination; cancel reverses only one", () => {
    // Shared power, two open PRs.
    let pr1 = { id: "pr1", requestedQuantity: 50, orderedQuantity: 0 };
    const pr2 = { id: "pr2", requestedQuantity: 50, orderedQuantity: 0 };

    const poA = planLineAllocations({
      want: 30,
      candidates: [pr1, pr2],
      preferredRequestId: "pr1",
    });
    pr1 = { ...pr1, orderedQuantity: poA[0]!.orderedAfter };

    const poB = planLineAllocations({
      want: 40,
      candidates: [pr1, pr2],
    });
    // pr1 has 20 left → takes 20; pr2 takes 20
    assert.equal(poB[0]!.procurementRequestId, "pr1");
    assert.equal(poB[0]!.quantity, 20);
    assert.equal(poB[1]!.procurementRequestId, "pr2");
    assert.equal(poB[1]!.quantity, 20);

    const orderedById = new Map([
      ["pr1", 50], // 30 from A + 20 from B
      ["pr2", 20],
    ]);

    // Cancel PO-A: reverse only its 30 from pr1
    const afterCancelA = reversePoAllocationsOnPrMap({
      prOrderedById: orderedById,
      allocations: poA.map((a) => ({
        procurementRequestId: a.procurementRequestId,
        quantity: a.quantity,
        reversedAt: null,
      })),
    });
    assert.equal(afterCancelA.get("pr1"), 20); // B's share remains
    assert.equal(afterCancelA.get("pr2"), 20);

    // Second cancel of same rows (already reversed) must no-op
    const afterIdempotent = reversePoAllocationsOnPrMap({
      prOrderedById: afterCancelA,
      allocations: poA.map((a) => ({
        procurementRequestId: a.procurementRequestId,
        quantity: a.quantity,
        reversedAt: new Date().toISOString(),
      })),
    });
    assert.equal(afterIdempotent.get("pr1"), 20);
    assert.equal(afterIdempotent.get("pr2"), 20);
  });

  it("exact reverse restores orderedQuantity", () => {
    const result = reverseAllocationQuantity(
      { requestedQuantity: 50, orderedQuantity: 35 },
      15
    );
    assert.equal(result.reversed, 15);
    assert.equal(result.orderedAfter, 20);
  });
});

describe("incoming totals across lifecycle", () => {
  it("draft → approve → cancel keeps incoming consistent without double-count", () => {
    const prs = [{ requestedQuantity: 50, orderedQuantity: 0 }];

    const before = incomingForPowerState({
      openPoOutstanding: 0,
      prs,
    });
    assert.equal(before, 50); // draft PO does not count

    // Approve PO for 30 of the PR
    const afterApprove = incomingForPowerState({
      openPoOutstanding: 30,
      prs: [{ requestedQuantity: 50, orderedQuantity: 30 }],
    });
    assert.equal(afterApprove, 50); // 30 PO + 20 unallocated PR

    // Cancel PO — reverse allocation
    const afterCancel = incomingForPowerState({
      openPoOutstanding: 0,
      prs: [{ requestedQuantity: 50, orderedQuantity: 0 }],
    });
    assert.equal(afterCancel, 50);
  });
});

describe("concurrent same-power approval guard (draft uniqueness + lock semantics)", () => {
  it("rejects duplicate powers inside one draft payload", () => {
    assert.deepEqual(
      findDuplicatePowersInDraft([
        { lensType: "KRYPTOK", lensId: "x" },
        { lensType: "KRYPTOK", lensId: "x" },
      ]),
      ["KRYPTOK::x"]
    );
  });

  it("second approve against depleted PR eligibility cannot steal first PO qty", () => {
    const afterFirst = planLineAllocations({
      want: 40,
      candidates: [{ id: "pr1", requestedQuantity: 40, orderedQuantity: 0 }],
    });
    assert.equal(afterFirst[0]!.quantity, 40);

    const second = planLineAllocations({
      want: 40,
      candidates: [{ id: "pr1", requestedQuantity: 40, orderedQuantity: 40 }],
    });
    assert.deepEqual(second, []);
    // DB OpenPurchaseOrderPower unique PK still blocks concurrent OPEN for same power.
  });
});
