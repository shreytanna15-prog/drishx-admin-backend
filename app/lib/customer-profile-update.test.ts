import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCustomerProfilePatch } from "./customer-profile-update";

const existing = {
  businessName: "Old Shop",
  addressLine1: "Line 1",
  addressLine2: null,
  city: "Ahmedabad",
  state: "Gujarat",
  pincode: "380001",
};

describe("parseCustomerProfilePatch", () => {
  it("requires at least one field", () => {
    const r = parseCustomerProfilePatch({}, existing);
    assert.equal(r.ok, false);
  });

  it("flips approval to pending on any update", () => {
    const r = parseCustomerProfilePatch({ shopName: "New Shop" }, existing);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.data.approvalStatus, "PENDING_REVIEW");
      assert.equal(r.data.isApproved, false);
      assert.equal(r.data.isActive, false);
      assert.equal(r.data.rejectionReason, null);
      assert.equal(r.data.shopName, "New Shop");
    }
  });

  it("validates GSTIN when provided", () => {
    const r = parseCustomerProfilePatch({ gstNumber: "BAD" }, existing);
    assert.equal(r.ok, false);
  });
});
