import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdminCustomer } from "./admin-customers";
import {
  payloadFromProfileDraft,
  profileDraftFromCustomer,
} from "./admin-client-profile-draft";

function sampleCustomer(
  overrides: Partial<AdminCustomer> = {}
): AdminCustomer {
  return {
    id: "c1",
    email: "shop@example.com",
    name: "Owner",
    role: "CUSTOMER",
    isActive: true,
    isApproved: true,
    approvalStatus: "APPROVED",
    gstNumber: "22AAAAA0000A1Z5",
    panNumber: "AAAAA0000A",
    businessName: "Shop Co",
    businessAddress: null,
    state: "Gujarat",
    pincode: "380001",
    mobileNumber: "9876543210",
    mobileVerifiedAt: new Date().toISOString(),
    emailVerifiedAt: new Date().toISOString(),
    gstinVerifyStatus: "ACTIVE",
    approvedAt: null,
    rejectionReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("profileDraftFromCustomer / payloadFromProfileDraft", () => {
  it("round-trips core fields", () => {
    const draft = profileDraftFromCustomer(sampleCustomer());
    assert.equal(draft.email, "shop@example.com");
    assert.equal(draft.mobileNumber, "9876543210");
    assert.equal(draft.gstNumber, "22AAAAA0000A1Z5");
  });

  it("omits GSTIN/PAN from payload when taxLocked", () => {
    const draft = profileDraftFromCustomer(sampleCustomer());
    draft.gstNumber = "27AAAAA0000A1Z5";
    draft.panNumber = "BBBBB0000B";
    draft.addressLine1 = "New Addr";

    const locked = payloadFromProfileDraft(draft, true);
    assert.equal("gstNumber" in locked, false);
    assert.equal("panNumber" in locked, false);
    assert.equal(locked.addressLine1, "New Addr");

    const unlocked = payloadFromProfileDraft(draft, false);
    assert.equal(unlocked.gstNumber, "27AAAAA0000A1Z5");
    assert.equal(unlocked.panNumber, "BBBBB0000B");
  });
});
