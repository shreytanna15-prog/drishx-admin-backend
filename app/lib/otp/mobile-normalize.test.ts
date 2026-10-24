import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeIndianMobile, toTwoFactorMobile } from "./mobile-normalize";
import { hashOtpCode, otpCodeMatches } from "./otp-code-hash";
import { parseOtpPurpose } from "./otp-types";

describe("normalizeIndianMobile", () => {
  it("accepts 10-digit mobiles starting 6-9", () => {
    assert.equal(normalizeIndianMobile("9876543210"), "9876543210");
    assert.equal(normalizeIndianMobile(" 98765 43210 "), "9876543210");
  });

  it("strips +91 / 91 / 0 prefix", () => {
    assert.equal(normalizeIndianMobile("+919876543210"), "9876543210");
    assert.equal(normalizeIndianMobile("919876543210"), "9876543210");
    assert.equal(normalizeIndianMobile("09876543210"), "9876543210");
  });

  it("rejects invalid numbers", () => {
    assert.equal(normalizeIndianMobile("12345"), null);
    assert.equal(normalizeIndianMobile("5876543210"), null);
    assert.equal(normalizeIndianMobile(""), null);
  });

  it("builds 2factor destination", () => {
    assert.equal(toTwoFactorMobile("9876543210"), "919876543210");
  });
});

describe("parseOtpPurpose", () => {
  it("parses known purposes", () => {
    assert.equal(parseOtpPurpose("signup"), "SIGNUP");
    assert.equal(parseOtpPurpose("WALK_IN"), "WALK_IN");
    assert.equal(parseOtpPurpose("nope"), null);
  });
});

describe("otp code hash", () => {
  it("matches hashed codes without storing plaintext equality leaks", () => {
    const hash = hashOtpCode("123456");
    assert.equal(otpCodeMatches("123456", hash), true);
    assert.equal(otpCodeMatches("000000", hash), false);
    assert.equal(otpCodeMatches("123456", null), false);
  });
});
