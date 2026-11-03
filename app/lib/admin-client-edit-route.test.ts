/**
 * Route-level contract tests for Admin client edit (no live DB).
 * Exercises parse + side-effect composition the PATCH handler uses.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAdminCustomerPatchSideEffects,
  parseAdminCustomerPatchBody,
} from "./admin-customer-write";
import { composeBusinessAddress } from "./customer-registration";

describe("PATCH customer composition (admin client edit)", () => {
  const existing = {
    email: "old@example.com",
    mobileNumber: "9876543210",
    gstNumber: "22AAAAA0000A1Z5",
    panNumber: "AAAAA0000A",
    gstinVerifyStatus: "ACTIVE" as const,
    addressLine1: "Line 1",
    addressLine2: null as string | null,
    city: "Surat",
    state: "Gujarat",
    pincode: "395001",
  };

  it("composes businessAddress when address lines change", () => {
    const body = {
      addressLine1: "New Line",
      city: "Surat",
      state: "Gujarat",
      pincode: "395001",
    };
    const parsed = parseAdminCustomerPatchBody(body);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const data = { ...parsed.data };
    data.businessAddress = composeBusinessAddress({
      addressLine1: data.addressLine1 as string,
      addressLine2: existing.addressLine2,
      city: data.city as string,
      state: data.state as string,
      pincode: data.pincode as string,
    });

    const withEffects = applyAdminCustomerPatchSideEffects(existing, data);
    assert.equal(withEffects.ok, true);
    if (!withEffects.ok) return;
    assert.match(String(withEffects.data.businessAddress), /New Line/);
    assert.equal(withEffects.effects.clearedMobileVerified, false);
  });

  it("blocks PAN change while GST ACTIVE", () => {
    const parsed = parseAdminCustomerPatchBody({ panNumber: "BBBBB1111B" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const withEffects = applyAdminCustomerPatchSideEffects(
      existing,
      parsed.data
    );
    assert.equal(withEffects.ok, false);
  });

  it("clears both verified flags when mobile and email change together", () => {
    const parsed = parseAdminCustomerPatchBody({
      mobileNumber: "9123456780",
      email: "new@example.com",
      shopName: "Updated Shop",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const withEffects = applyAdminCustomerPatchSideEffects(
      { ...existing, gstinVerifyStatus: "UNKNOWN" },
      parsed.data
    );
    assert.equal(withEffects.ok, true);
    if (!withEffects.ok) return;
    assert.equal(withEffects.effects.clearedMobileVerified, true);
    assert.equal(withEffects.effects.clearedEmailVerified, true);
    assert.equal(withEffects.data.mobileVerifiedAt, null);
    assert.equal(withEffects.data.emailVerifiedAt, null);
  });
});
