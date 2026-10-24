import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessSelfServeOrderEligibility,
  assessStaffOnBehalfOrderEligibility,
  isStaffOrderableCustomer,
} from "./customer-order-eligibility";

const approved = {
  role: "CUSTOMER" as const,
  isActive: true,
  isApproved: true,
  approvalStatus: "APPROVED" as const,
  accountAction: "NONE" as const,
  createdByStaffId: null as string | null,
};

const pendingWalkIn = {
  ...approved,
  isActive: false,
  isApproved: false,
  approvalStatus: "PENDING_REVIEW" as const,
  createdByStaffId: "staff-1",
};

describe("self-serve order eligibility", () => {
  it("allows approved active customers", () => {
    assert.equal(assessSelfServeOrderEligibility(approved).ok, true);
  });

  it("blocks pending even if staff-created", () => {
    const r = assessSelfServeOrderEligibility(pendingWalkIn);
    assert.equal(r.ok, false);
  });

  it("blocks CLOSED", () => {
    const r = assessSelfServeOrderEligibility({
      ...approved,
      accountAction: "CLOSED",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "ACCOUNT_CLOSED");
  });
});

describe("staff on-behalf order eligibility", () => {
  it("allows approved active", () => {
    assert.equal(assessStaffOnBehalfOrderEligibility(approved).ok, true);
  });

  it("allows pending walk-in / admin-created", () => {
    assert.equal(assessStaffOnBehalfOrderEligibility(pendingWalkIn).ok, true);
    assert.equal(isStaffOrderableCustomer(pendingWalkIn), true);
  });

  it("blocks pending without createdByStaffId", () => {
    const r = assessStaffOnBehalfOrderEligibility({
      ...pendingWalkIn,
      createdByStaffId: null,
    });
    assert.equal(r.ok, false);
  });

  it("blocks rejected and suspended", () => {
    assert.equal(
      assessStaffOnBehalfOrderEligibility({
        ...approved,
        isActive: false,
      }).ok,
      false
    );
    assert.equal(
      assessStaffOnBehalfOrderEligibility({
        ...approved,
        isApproved: false,
        approvalStatus: "REJECTED",
        isActive: false,
      }).ok,
      false
    );
  });

  it("blocks BLOCKED", () => {
    const r = assessStaffOnBehalfOrderEligibility({
      ...approved,
      accountAction: "BLOCKED",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "ACCOUNT_BLOCKED");
  });
});
