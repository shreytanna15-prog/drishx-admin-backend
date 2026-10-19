import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveApprovedCreditDisplay } from "./admin-returns";

describe("resolveApprovedCreditDisplay", () => {
  it("hides the section for non-credit statuses", () => {
    for (const status of [
      "SUBMITTED",
      "MORE_INFO_REQUIRED",
      "ESCALATED_TO_ADMIN",
      "AWAITING_MATERIAL",
      "APPROVED_REPLACEMENT",
      "REJECTED",
      "CLOSED",
    ]) {
      assert.deepEqual(
        resolveApprovedCreditDisplay({
          status,
          approvedAmount: 500,
          creditNote: { creditNoteNumber: "CN-1", amount: 500 },
        }),
        { show: false }
      );
    }
  });

  it("shows complete persisted credit fields when APPROVED_CREDIT", () => {
    assert.deepEqual(
      resolveApprovedCreditDisplay({
        status: "APPROVED_CREDIT",
        approvedAmount: 1250.5,
        creditNote: { creditNoteNumber: "CN-2026-0042", amount: 1250.5 },
      }),
      {
        show: true,
        needsReconciliation: false,
        approvedAmount: 1250.5,
        creditNoteNumber: "CN-2026-0042",
        creditNoteAmount: 1250.5,
        allocations: [],
      }
    );
  });

  it("flags reconciliation when approvedAmount is missing", () => {
    const result = resolveApprovedCreditDisplay({
      status: "APPROVED_CREDIT",
      approvedAmount: null,
      creditNote: { creditNoteNumber: "CN-9", amount: 100 },
    });
    assert.equal(result.show, true);
    if (!result.show) return;
    assert.equal(result.needsReconciliation, true);
    assert.equal(result.approvedAmount, null);
    assert.equal(result.creditNoteNumber, "CN-9");
    assert.equal(result.creditNoteAmount, 100);
  });

  it("flags reconciliation when credit note is missing", () => {
    const result = resolveApprovedCreditDisplay({
      status: "APPROVED_CREDIT",
      approvedAmount: 200,
      creditNote: null,
    });
    assert.equal(result.show, true);
    if (!result.show) return;
    assert.equal(result.needsReconciliation, true);
    assert.equal(result.approvedAmount, 200);
    assert.equal(result.creditNoteNumber, null);
    assert.equal(result.creditNoteAmount, null);
  });

  it("flags reconciliation when credit note number or amount is blank", () => {
    const blankNumber = resolveApprovedCreditDisplay({
      status: "APPROVED_CREDIT",
      approvedAmount: 50,
      creditNote: { creditNoteNumber: "   ", amount: 50 },
    });
    assert.equal(blankNumber.show, true);
    if (!blankNumber.show) return;
    assert.equal(blankNumber.needsReconciliation, true);
    assert.equal(blankNumber.creditNoteNumber, null);
    assert.equal(blankNumber.creditNoteAmount, 50);

    const missingAmount = resolveApprovedCreditDisplay({
      status: "APPROVED_CREDIT",
      approvedAmount: 50,
      creditNote: { creditNoteNumber: "CN-2", amount: null },
    });
    assert.equal(missingAmount.show, true);
    if (!missingAmount.show) return;
    assert.equal(missingAmount.needsReconciliation, true);
    assert.equal(missingAmount.creditNoteNumber, "CN-2");
    assert.equal(missingAmount.creditNoteAmount, null);
  });

  it("does not invent amounts — only surfaces persisted values", () => {
    const result = resolveApprovedCreditDisplay({
      status: "APPROVED_CREDIT",
    });
    assert.deepEqual(result, {
      show: true,
      needsReconciliation: true,
      approvedAmount: null,
      creditNoteNumber: null,
      creditNoteAmount: null,
      allocations: [],
    });
  });
});
