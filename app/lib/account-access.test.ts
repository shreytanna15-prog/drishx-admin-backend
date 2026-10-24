import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessAccountAccess,
  isCustomerApprovedAndActive,
  isInactiveStaff,
  isRejectedCustomer,
  isSuspendedCustomer,
} from "./account-access";

const baseCustomer = {
  role: "CUSTOMER" as const,
  isActive: true,
  isApproved: true,
  approvalStatus: "APPROVED" as const,
  accountAction: "NONE" as const,
};

describe("customer suspension (RW-04)", () => {
  it("detects suspended approved inactive customers", () => {
    assert.equal(
      isSuspendedCustomer({
        ...baseCustomer,
        isActive: false,
      }),
      true
    );
    assert.equal(isSuspendedCustomer(baseCustomer), false);
  });

  it("incomplete pending customers are not suspended", () => {
    assert.equal(
      isSuspendedCustomer({
        role: "CUSTOMER",
        isActive: false,
        isApproved: false,
        approvalStatus: "PENDING_REVIEW",
        accountAction: "NONE",
      }),
      false
    );
  });

  it("rejects login/refresh for suspended customers only", () => {
    const suspended = assessAccountAccess({
      ...baseCustomer,
      isActive: false,
    });
    assert.equal(suspended.ok, false);
    if (!suspended.ok) {
      assert.equal(suspended.code, "ACCOUNT_INACTIVE");
    }
  });

  it("allows pending, rejected, and approved active customers", () => {
    assert.equal(
      assessAccountAccess({
        role: "CUSTOMER",
        isActive: false,
        isApproved: false,
        approvalStatus: "PENDING_REVIEW",
        accountAction: "NONE",
      }).ok,
      true
    );
    assert.equal(
      assessAccountAccess({
        role: "CUSTOMER",
        isActive: false,
        isApproved: false,
        approvalStatus: "REJECTED",
        accountAction: "NONE",
      }).ok,
      true
    );
    assert.equal(assessAccountAccess(baseCustomer).ok, true);
    const closed = assessAccountAccess({
      ...baseCustomer,
      accountAction: "CLOSED",
    });
    assert.equal(closed.ok, false);
    if (!closed.ok) assert.equal(closed.code, "ACCOUNT_CLOSED");
  });

  it("reactivated customers pass approved+active check", () => {
    assert.equal(isCustomerApprovedAndActive(baseCustomer), true);
    assert.equal(
      isCustomerApprovedAndActive({ ...baseCustomer, isActive: false }),
      false
    );
  });
});

describe("staff inactivity", () => {
  it("blocks inactive employees/admins", () => {
    assert.equal(
      isInactiveStaff({
        role: "EMPLOYEE",
        isActive: false,
        isApproved: true,
        approvalStatus: "APPROVED",
        accountAction: "NONE",
      }),
      true
    );
    const denied = assessAccountAccess({
      role: "ADMIN",
      isActive: false,
      isApproved: true,
      approvalStatus: "APPROVED",
      accountAction: "NONE",
    });
    assert.equal(denied.ok, false);
  });
});

describe("rejected helper", () => {
  it("detects rejected customers", () => {
    assert.equal(
      isRejectedCustomer({
        role: "CUSTOMER",
        isActive: false,
        isApproved: false,
        approvalStatus: "REJECTED",
        accountAction: "NONE",
      }),
      true
    );
  });
});
