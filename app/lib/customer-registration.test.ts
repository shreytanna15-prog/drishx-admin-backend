import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeBusinessAddress,
  isLegacyGstPayload,
  isValidGstin,
  isValidPan,
  optionalTrim,
  parseSparseRegistrationBody,
  registrationApprovalBucket,
  resolveBusinessName,
  validateOptionalGstinPan,
} from "./customer-registration";
import { isIncompleteSignup, isPendingReady } from "./admin-customers";

describe("optionalTrim", () => {
  it("treats omitted, null, and blank as null", () => {
    assert.equal(optionalTrim(undefined), null);
    assert.equal(optionalTrim(null), null);
    assert.equal(optionalTrim(""), null);
    assert.equal(optionalTrim("  "), null);
    assert.equal(optionalTrim(" Shop "), "Shop");
  });
});

describe("GSTIN / PAN validation", () => {
  const validGstin = "22AAAAA0000A1Z5";
  const validPan = "ABCDE1234F";

  it("accepts valid formats", () => {
    assert.equal(isValidGstin(validGstin), true);
    assert.equal(isValidPan(validPan), true);
  });

  it("rejects invalid formats when provided", () => {
    assert.equal(isValidGstin("INVALID"), false);
    assert.equal(isValidPan("123"), false);
    const badGst = validateOptionalGstinPan({ gstNumber: "bad", panNumber: "" });
    assert.equal(badGst.ok, false);
    const badPan = validateOptionalGstinPan({
      gstNumber: "",
      panNumber: "NOTAPAN",
    });
    assert.equal(badPan.ok, false);
  });

  it("allows omitted GSTIN and PAN", () => {
    const empty = validateOptionalGstinPan({});
    assert.equal(empty.ok, true);
    if (empty.ok) {
      assert.equal(empty.gstNumber, null);
      assert.equal(empty.panNumber, null);
    }
    const blanks = validateOptionalGstinPan({ gstNumber: "  ", panNumber: null });
    assert.equal(blanks.ok, true);
  });

  it("normalizes and accepts valid GSTIN + PAN together", () => {
    const ok = validateOptionalGstinPan({
      gstNumber: validGstin.toLowerCase(),
      panNumber: validPan.toLowerCase(),
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.gstNumber, validGstin);
      assert.equal(ok.panNumber, validPan);
    }
  });
});

describe("sparse registration parsing", () => {
  it("parses mandatory-only payload with all optionals null", () => {
    const fields = parseSparseRegistrationBody({ userId: "u1" });
    assert.equal(fields.shopName, null);
    assert.equal(fields.gstNumber, null);
    assert.equal(fields.panNumber, null);
    assert.equal(fields.billingAddress, null);
    assert.equal(fields.shippingCity, null);
  });

  it("parses full registration payload", () => {
    const fields = parseSparseRegistrationBody({
      shopName: "My Shop",
      businessType: "Retail",
      addressLine1: "Line 1",
      city: "Pune",
      state: "MH",
      pincode: "411001",
      businessEmail: "shop@example.com",
      shopPhoneNumber: "9876543210",
      gstNumber: "22AAAAA0000A1Z5",
      legalBusinessName: "Legal Co",
      gstRegistrationState: "Maharashtra",
      panNumber: "ABCDE1234F",
      billingLegalName: "Bill Co",
      billingAddress: "Bill addr",
      billingCity: "Pune",
      billingState: "MH",
      billingPincode: "411001",
      billingGstState: "MH",
      shippingLegalName: "Ship Co",
      shippingAddress: "Ship addr",
      shippingCity: "Pune",
      shippingState: "MH",
      shippingPincode: "411001",
    });
    assert.equal(fields.shopName, "My Shop");
    assert.equal(fields.gstNumber, "22AAAAA0000A1Z5");
    assert.equal(fields.panNumber, "ABCDE1234F");
    assert.equal(fields.billingLegalName, "Bill Co");
  });

  it("detects legacy GST payload shape", () => {
    assert.equal(
      isLegacyGstPayload({
        ...parseSparseRegistrationBody({}),
        legacyBusinessName: "Biz",
        legacyBusinessAddress: "Addr",
        gstNumber: "22AAAAA0000A1Z5",
      }),
      true
    );
    assert.equal(
      isLegacyGstPayload(
        parseSparseRegistrationBody({
          shopName: "Shop",
          businessName: "Biz",
          businessAddress: "Addr",
          gstNumber: "22AAAAA0000A1Z5",
        })
      ),
      false
    );
  });
});

describe("address + business name helpers", () => {
  it("composes address only from provided parts", () => {
    assert.equal(composeBusinessAddress({}), null);
    assert.equal(
      composeBusinessAddress({
        addressLine1: "A",
        city: "Pune",
        state: "MH",
        pincode: "411001",
      }),
      "A, Pune, MH, 411001"
    );
  });

  it("resolves business name without placeholders", () => {
    assert.equal(
      resolveBusinessName({
        shopName: null,
        legalBusinessName: null,
        legacyBusinessName: null,
        existingBusinessName: null,
      }),
      null
    );
    assert.equal(
      resolveBusinessName({
        shopName: "Shop",
        legalBusinessName: "Legal",
        legacyBusinessName: null,
      }),
      "Shop"
    );
  });
});

describe("RW-04 approval buckets preserved", () => {
  it("no GST → incomplete; with GST → pending-ready", () => {
    assert.deepEqual(registrationApprovalBucket(null), {
      hasGst: false,
      bucket: "incomplete",
    });
    assert.deepEqual(registrationApprovalBucket("22AAAAA0000A1Z5"), {
      hasGst: true,
      bucket: "pending-ready",
    });

    assert.equal(
      isIncompleteSignup({
        approvalStatus: "PENDING_REVIEW",
        gstNumber: null,
      }),
      true
    );
    assert.equal(
      isPendingReady({
        approvalStatus: "PENDING_REVIEW",
        gstNumber: "22AAAAA0000A1Z5",
      }),
      true
    );
    assert.equal(
      isPendingReady({
        approvalStatus: "PENDING_REVIEW",
        gstNumber: null,
      }),
      false
    );
  });
});

describe("signup required-field contract (structural)", () => {
  it("signup no longer requires businessName; gst accepts sparse bodies", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const signup = readFileSync(
      join(process.cwd(), "app/api/auth/signup/route.ts"),
      "utf8"
    );
    assert.equal(signup.includes("Business name is required"), false);
    assert.match(signup, /business name is optional/i);

    const gst = readFileSync(
      join(process.cwd(), "app/api/auth/gst/route.ts"),
      "utf8"
    );
    assert.equal(
      gst.includes("Please complete all required business, GST, billing, and shipping fields."),
      false
    );
    assert.match(gst, /validateOptionalGstinPan/);
  });
});
