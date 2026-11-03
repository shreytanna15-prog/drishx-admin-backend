import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountActionUpdateData,
  applyAdminCustomerPatchSideEffects,
  clearGstVerificationData,
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

describe("applyAdminCustomerPatchSideEffects", () => {
  const base = {
    email: "shop@example.com",
    mobileNumber: "9876543210",
    gstNumber: "22AAAAA0000A1Z5",
    panNumber: "AAAAA0000A",
    gstinVerifyStatus: "UNKNOWN" as const,
  };

  it("clears mobileVerifiedAt when mobile changes", () => {
    const result = applyAdminCustomerPatchSideEffects(base, {
      mobileNumber: "9123456789",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.mobileVerifiedAt, null);
    assert.equal(result.effects.clearedMobileVerified, true);
  });

  it("does not clear mobileVerifiedAt when mobile unchanged", () => {
    const result = applyAdminCustomerPatchSideEffects(base, {
      mobileNumber: "9876543210",
      name: "Same phone",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.effects.clearedMobileVerified, false);
    assert.equal("mobileVerifiedAt" in result.data, false);
  });

  it("clears emailVerifiedAt when email changes", () => {
    const result = applyAdminCustomerPatchSideEffects(base, {
      email: "new@example.com",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.emailVerifiedAt, null);
    assert.equal(result.effects.clearedEmailVerified, true);
  });

  it("rejects GSTIN change when ACTIVE", () => {
    const result = applyAdminCustomerPatchSideEffects(
      { ...base, gstinVerifyStatus: "ACTIVE" },
      { gstNumber: "27AAAAA0000A1Z5" }
    );
    assert.equal(result.ok, false);
  });

  it("allows same GSTIN when ACTIVE", () => {
    const result = applyAdminCustomerPatchSideEffects(
      { ...base, gstinVerifyStatus: "ACTIVE" },
      { gstNumber: "22AAAAA0000A1Z5", name: "Ok" }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.effects.resetGstVerification, false);
  });

  it("resets GST verify when GSTIN changes while unlocked", () => {
    const result = applyAdminCustomerPatchSideEffects(base, {
      gstNumber: "27AAAAA0000A1Z5",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.gstinVerifyStatus, "UNKNOWN");
    assert.equal(result.data.gstinVerifiedAt, null);
    assert.equal(result.effects.resetGstVerification, true);
  });

  it("clears addressVerifiedAt when address fields change", () => {
    const result = applyAdminCustomerPatchSideEffects(
      { ...base, addressVerifiedAt: new Date("2026-01-01") },
      { city: "Pune" }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.addressVerifiedAt, null);
    assert.equal(result.effects.clearedAddressVerified, true);
  });
});

describe("clearGstVerificationData", () => {
  it("returns UNKNOWN and nulls", () => {
    const data = clearGstVerificationData();
    assert.equal(data.gstinVerifyStatus, "UNKNOWN");
    assert.equal(data.gstinVerifiedAt, null);
    assert.equal(data.gstinVerifiedById, null);
  });
});
