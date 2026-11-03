/**
 * Admin client edit — DB integration (PATCH side effects + clear GST).
 *
 * Opt-in:
 *   DATABASE_URL=postgresql://...
 *   DRISHX_ADMIN_CLIENT_EDIT_INTEGRATION=1
 *
 * Creates a temporary CUSTOMER, applies side effects via prisma updates
 * mirroring the Admin PATCH / clear-gst-verification routes, then deletes it.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import {
  applyAdminCustomerPatchSideEffects,
  clearGstVerificationData,
} from "./admin-customer-write";
import { normalizeIndianMobile } from "./otp/mobile-normalize";

const RUN =
  Boolean(process.env.DATABASE_URL) &&
  process.env.DRISHX_ADMIN_CLIENT_EDIT_INTEGRATION === "1";

const TAG = Date.now().toString(36);
const SUFFIX = String(Date.now()).slice(-5);
const MOBILE_A = normalizeIndianMobile("90000" + SUFFIX);
const MOBILE_B = normalizeIndianMobile("90001" + SUFFIX);
/** Unique valid-format GSTIN for this run (checksum not enforced by DB). */
const GSTIN_A = `22AAAAA${SUFFIX.slice(0, 4)}A1Z5`;
const GSTIN_B = `27AAAAA${SUFFIX.slice(0, 4)}A1Z5`;
const PAN_A = `AAAAA${SUFFIX.slice(0, 4)}A`;

let customerId: string | null = null;

function placeholderEmail(mobile: string) {
  return `e2e-edit-${mobile}@drishx.test`;
}

describe("admin client edit integration", { skip: !RUN }, () => {
  before(async () => {
    const { prisma } = await import("@/app/lib/prisma");
    const mobile = MOBILE_A!;
    assert.ok(mobile, "test mobile normalize failed");

    // Clean leftovers from prior failed runs
    await prisma.user.deleteMany({
      where: {
        role: "CUSTOMER",
        email: { startsWith: "e2e-edit-" },
      },
    });

    const passwordHash = createHash("sha256")
      .update(randomBytes(16))
      .digest("hex");

    const created = await prisma.user.create({
      data: {
        email: placeholderEmail(mobile),
        password: passwordHash,
        role: "CUSTOMER",
        name: "E2E Edit Customer",
        mobileNumber: mobile,
        mobileVerifiedAt: new Date(),
        emailVerifiedAt: new Date(),
        gstNumber: GSTIN_A,
        panNumber: PAN_A,
        gstinVerifyStatus: "ACTIVE",
        gstinVerifiedAt: new Date(),
        approvalStatus: "APPROVED",
        isApproved: true,
        isActive: true,
        addressLine1: "Old Street",
        city: "Ahmedabad",
        state: "Gujarat",
        pincode: "380001",
      },
    });
    customerId = created.id;
  });

  after(async () => {
    if (!customerId) return;
    const { prisma } = await import("@/app/lib/prisma");
    await prisma.user.deleteMany({ where: { id: customerId } });
    customerId = null;
  });

  it("rejects GSTIN change while ACTIVE via side-effect helper", async () => {
    const { prisma } = await import("@/app/lib/prisma");
    assert.ok(customerId);
    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: customerId },
    });

    const blocked = applyAdminCustomerPatchSideEffects(existing, {
      gstNumber: GSTIN_B,
    });
    assert.equal(blocked.ok, false);
  });

  it("clears GST verification then allows GSTIN change + resets status", async () => {
    const { prisma } = await import("@/app/lib/prisma");
    assert.ok(customerId);

    await prisma.user.update({
      where: { id: customerId },
      data: clearGstVerificationData(),
    });

    let existing = await prisma.user.findUniqueOrThrow({
      where: { id: customerId },
    });
    assert.equal(existing.gstinVerifyStatus, "UNKNOWN");
    assert.equal(existing.gstinVerifiedAt, null);

    const applied = applyAdminCustomerPatchSideEffects(existing, {
      gstNumber: GSTIN_B,
      addressLine1: "New Street",
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const updated = await prisma.user.update({
      where: { id: customerId },
      data: applied.data,
    });
    assert.equal(updated.gstNumber, GSTIN_B);
    assert.equal(updated.addressLine1, "New Street");
    assert.equal(updated.gstinVerifyStatus, "UNKNOWN");
    assert.equal(applied.effects.resetGstVerification, true);

    existing = updated;
  });

  it("clears mobileVerifiedAt when mobile changes", async () => {
    const { prisma } = await import("@/app/lib/prisma");
    assert.ok(customerId);
    assert.ok(MOBILE_B);

    // Ensure verified before change
    await prisma.user.update({
      where: { id: customerId },
      data: { mobileVerifiedAt: new Date() },
    });

    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: customerId },
    });

    const applied = applyAdminCustomerPatchSideEffects(existing, {
      mobileNumber: MOBILE_B,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.effects.clearedMobileVerified, true);

    const updated = await prisma.user.update({
      where: { id: customerId },
      data: applied.data,
    });
    assert.equal(updated.mobileNumber, MOBILE_B);
    assert.equal(updated.mobileVerifiedAt, null);
  });

  it("clears emailVerifiedAt when email changes", async () => {
    const { prisma } = await import("@/app/lib/prisma");
    assert.ok(customerId);
    assert.ok(MOBILE_B);

    await prisma.user.update({
      where: { id: customerId },
      data: { emailVerifiedAt: new Date() },
    });

    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: customerId },
    });
    const newEmail = `e2e-edit-changed-${TAG}@drishx.test`;

    const applied = applyAdminCustomerPatchSideEffects(existing, {
      email: newEmail,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.effects.clearedEmailVerified, true);

    const updated = await prisma.user.update({
      where: { id: customerId },
      data: applied.data,
    });
    assert.equal(updated.email, newEmail);
    assert.equal(updated.emailVerifiedAt, null);
  });
});
