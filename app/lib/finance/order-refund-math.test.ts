import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeRefundAmountDue,
  refundStatusAfterPayout,
  remainingRefundDue,
} from "./order-refund-math";

describe("order-refund-math", () => {
  it("computes amountDue from invoice amountPaid", () => {
    assert.equal(computeRefundAmountDue(0), 0);
    assert.equal(computeRefundAmountDue(0.001), 0);
    assert.equal(computeRefundAmountDue(540.5), 540.5);
  });

  it("derives status from paid vs due", () => {
    assert.equal(refundStatusAfterPayout(100, 0), "DUE");
    assert.equal(refundStatusAfterPayout(100, 40), "PARTIAL");
    assert.equal(refundStatusAfterPayout(100, 100), "PAID");
    assert.equal(refundStatusAfterPayout(100, 100.005), "PAID");
  });

  it("remaining due floors tiny leftovers", () => {
    assert.equal(remainingRefundDue(100, 40), 60);
    assert.equal(remainingRefundDue(100, 99.995), 0);
  });
});
