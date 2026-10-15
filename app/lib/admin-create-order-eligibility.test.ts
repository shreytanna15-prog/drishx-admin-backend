import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCustomerPickerLabel,
  isEligibleCreateOrderCustomer,
  matchesCustomerSearch,
  type CreateOrderCustomerCandidate,
} from "./admin-create-order-eligibility";

const approved: CreateOrderCustomerCandidate = {
  id: "c1",
  role: "CUSTOMER",
  name: "Riya",
  email: "riya@shop.test",
  businessName: "Riya Optics",
  shopName: "Riya Store",
  mobileNumber: "9876543210",
  isActive: true,
  isApproved: true,
  approvalStatus: "APPROVED",
};

describe("admin create-order customer eligibility (RW-10 / RW-04)", () => {
  it("allows approved active customers", () => {
    assert.equal(isEligibleCreateOrderCustomer(approved), true);
  });

  it("blocks suspended, rejected, and pending customers", () => {
    assert.equal(
      isEligibleCreateOrderCustomer({ ...approved, isActive: false }),
      false
    );
    assert.equal(
      isEligibleCreateOrderCustomer({
        ...approved,
        isApproved: false,
        approvalStatus: "REJECTED",
        isActive: false,
      }),
      false
    );
    assert.equal(
      isEligibleCreateOrderCustomer({
        ...approved,
        isApproved: false,
        approvalStatus: "PENDING_REVIEW",
      }),
      false
    );
  });

  it("blocks non-customers", () => {
    assert.equal(
      isEligibleCreateOrderCustomer({ ...approved, role: "ADMIN" }),
      false
    );
  });

  it("searches name, business, email, and mobile", () => {
    assert.equal(matchesCustomerSearch(approved, "riya optics"), true);
    assert.equal(matchesCustomerSearch(approved, "98765"), true);
    assert.equal(matchesCustomerSearch(approved, "shop.test"), true);
    assert.equal(matchesCustomerSearch(approved, "zzz"), false);
  });

  it("formats picker label preferring business name", () => {
    assert.equal(formatCustomerPickerLabel(approved), "Riya Optics");
  });
});
