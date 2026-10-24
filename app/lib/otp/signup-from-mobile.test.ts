import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPlaceholderOtpEmail,
  placeholderEmailForMobile,
} from "./signup-email";

describe("placeholderEmailForMobile", () => {
  it("builds a stable unique-looking placeholder", () => {
    assert.equal(
      placeholderEmailForMobile("9876543210"),
      "m9876543210@otp.drishx.local"
    );
  });

  it("detects placeholder emails", () => {
    assert.equal(isPlaceholderOtpEmail("m9876543210@otp.drishx.local"), true);
    assert.equal(isPlaceholderOtpEmail("shop@example.com"), false);
    assert.equal(isPlaceholderOtpEmail(null), false);
  });
});
