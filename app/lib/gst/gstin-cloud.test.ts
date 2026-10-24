import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidGstinFormat, verifyGstinCloud } from "./gstin-cloud";

describe("isValidGstinFormat", () => {
  it("accepts a well-formed GSTIN", () => {
    assert.equal(isValidGstinFormat("22AAAAA0000A1Z5"), true);
  });

  it("rejects junk", () => {
    assert.equal(isValidGstinFormat("INVALID"), false);
  });
});

describe("verifyGstinCloud (dev mock)", () => {
  it("returns INVALID for bad format", async () => {
    process.env.GSTIN_CLOUD_DEV_MODE = "1";
    const result = await verifyGstinCloud("BAD");
    assert.equal(result.status, "INVALID");
  });

  it("returns ACTIVE for valid mock GSTIN", async () => {
    process.env.GSTIN_CLOUD_DEV_MODE = "1";
    const result = await verifyGstinCloud("22AAAAA0000A1Z5");
    assert.equal(result.status, "ACTIVE");
    assert.ok(result.legalName);
  });
});
