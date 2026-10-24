import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountActionUpdateData,
  isAccountAction,
  parseAdminCustomerCreateBody,
  parseAdminCustomerPatchBody,
} from "./admin-customer-write";

describe("parseAdminCustomerCreateBody", () => {
  it("requires valid mobile", () => {
    const bad = parseAdminCustomerCreateBody({ mobileNumber: "123" });
    assert.equal(bad.ok, false);
  });

  it("accepts Path B minimal create", () => {
    const ok = parseAdminCustomerCreateBody({
      mobileNumber: "9876543210",
      name: "Test",
      creditLimit: 50000,
      creditAllowed: true,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.data.mobileNumber, "9876543210");
      assert.equal(ok.data.creditLimit, 50000);
      assert.equal(ok.data.creditAllowed, true);
    }
  });
});

describe("accountActionUpdateData", () => {
  it("closes account as inactive", () => {
    const data = accountActionUpdateData("CLOSED", {
      accountAction: "NONE",
      approvalStatus: "APPROVED",
      isActive: true,
    });
    assert.equal(data.accountAction, "CLOSED");
    assert.equal(data.isActive, false);
  });

  it("clears CLOSED back to active when approved", () => {
    const data = accountActionUpdateData("NONE", {
      accountAction: "CLOSED",
      approvalStatus: "APPROVED",
      isActive: false,
    });
    assert.equal(data.accountAction, "NONE");
    assert.equal(data.isActive, true);
  });
});

describe("isAccountAction", () => {
  it("validates enum strings", () => {
    assert.equal(isAccountAction("BLOCKED"), true);
    assert.equal(isAccountAction("nope"), false);
  });
});

describe("parseAdminCustomerPatchBody pricing tier relation", () => {
  it("connects when pricingTierId is set", () => {
    const parsed = parseAdminCustomerPatchBody({
      pricingTierId: "pricing_tier_a",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.data.pricingTier, {
      connect: { id: "pricing_tier_a" },
    });
    assert.equal("pricingTierId" in parsed.data, false);
  });

  it("disconnects when pricingTierId is cleared", () => {
    const parsed = parseAdminCustomerPatchBody({ pricingTierId: null });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.data.pricingTier, { disconnect: true });
  });
});
