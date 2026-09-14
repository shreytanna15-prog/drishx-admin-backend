import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateCourierName,
  validateTrackingNumber,
} from "./dispatch-validate";

describe("dispatch-validate", () => {
  it("courier name is required", () => {
    assert.equal(validateCourierName(undefined).ok, false);
    assert.equal(validateCourierName("").ok, false);
    assert.equal(validateCourierName("   ").ok, false);
    assert.equal(validateCourierName(123).ok, false);
  });

  it("courier name trims and caps length", () => {
    const ok = validateCourierName("  Sri Raj Courier  ");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value, "Sri Raj Courier");

    const tooLong = validateCourierName("x".repeat(121));
    assert.equal(tooLong.ok, false);
  });

  it("accepts a realistic AWB number", () => {
    const ok = validateTrackingNumber("SRE1234567890");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value, "SRE1234567890");
  });

  it("accepts tracking with - _ / . : characters", () => {
    const ok = validateTrackingNumber("SRD-789_/001:2");
    assert.equal(ok.ok, true);
  });

  it("rejects empty and too-short tracking", () => {
    assert.equal(validateTrackingNumber("").ok, false);
    assert.equal(validateTrackingNumber("  ").ok, false);
    assert.equal(validateTrackingNumber("abc").ok, false);
  });

  it("rejects junk / placeholder tracking", () => {
    assert.equal(validateTrackingNumber("test").ok, false);
    assert.equal(validateTrackingNumber("NONE").ok, false);
    assert.equal(validateTrackingNumber("nnnn").ok, false);
    assert.equal(validateTrackingNumber("xxxx").ok, false);
  });

  it("rejects tracking with forbidden characters", () => {
    assert.equal(validateTrackingNumber("SR#12345").ok, false);
    assert.equal(validateTrackingNumber("hello world").ok, false);
    assert.equal(validateTrackingNumber("AB%^&*").ok, false);
  });

  it("caps tracking length", () => {
    const tooLong = validateTrackingNumber("A".repeat(201));
    assert.equal(tooLong.ok, false);
    const atLimit = validateTrackingNumber("AB".repeat(100));
    assert.equal(atLimit.ok, true);
  });
});