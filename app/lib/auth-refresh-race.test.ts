import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REFRESH_ROTATION_GRACE_MS,
  decideRevokedRefreshPresentation,
  shouldClearRefreshCookie,
  shouldSetNewRefreshCookie,
  type RotateRefreshResult,
} from "./auth-refresh-policy";

describe("decideRevokedRefreshPresentation", () => {
  const base = {
    userId: "user_1",
    familyId: "family_1",
    revokedAt: new Date("2026-01-01T12:00:00.000Z"),
  };

  it("treats revoked+successor within grace as concurrent (not theft)", () => {
    const decision = decideRevokedRefreshPresentation({
      ...base,
      now: new Date(base.revokedAt.getTime() + 5_000),
      hasActiveSuccessor: true,
    });
    assert.deepEqual(decision, {
      action: "concurrent",
      userId: "user_1",
      familyId: "family_1",
    });
  });

  it("is retryable within grace when successor is not visible yet", () => {
    const decision = decideRevokedRefreshPresentation({
      ...base,
      now: new Date(base.revokedAt.getTime() + 1_000),
      hasActiveSuccessor: false,
    });
    assert.equal(decision.action, "retryable");
  });

  it("rejects reuse outside the grace window even if a successor exists", () => {
    const decision = decideRevokedRefreshPresentation({
      ...base,
      now: new Date(base.revokedAt.getTime() + REFRESH_ROTATION_GRACE_MS + 1),
      hasActiveSuccessor: true,
    });
    assert.equal(decision.action, "reject_reuse");
  });

  it("uses the exported grace constant (30s)", () => {
    assert.equal(REFRESH_ROTATION_GRACE_MS, 30_000);
  });
});

describe("refresh cookie policy under rotation races", () => {
  it("does not clear cookie on concurrent recovery (losing parallel refresh)", () => {
    const concurrent: RotateRefreshResult = {
      ok: true,
      kind: "concurrent",
      userId: "user_1",
      familyId: "family_1",
    };
    assert.equal(shouldClearRefreshCookie(concurrent), false);
    assert.equal(shouldSetNewRefreshCookie(concurrent), false);
  });

  it("sets a new cookie only for the winning rotation", () => {
    const rotated: RotateRefreshResult = {
      ok: true,
      kind: "rotated",
      userId: "user_1",
      rawToken: "new-raw-token",
      familyId: "family_1",
      expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    assert.equal(shouldClearRefreshCookie(rotated), false);
    assert.equal(shouldSetNewRefreshCookie(rotated), true);
  });

  it("does not clear cookie on retryable race (in-flight successor)", () => {
    const retryable: RotateRefreshResult = {
      ok: false,
      code: "TOKEN_INVALID",
      clearCookie: false,
      retryable: true,
    };
    assert.equal(shouldClearRefreshCookie(retryable), false);
  });

  it("clears cookie on definitive invalid / expired failures", () => {
    const invalid: RotateRefreshResult = {
      ok: false,
      code: "TOKEN_INVALID",
      clearCookie: true,
    };
    const expired: RotateRefreshResult = {
      ok: false,
      code: "TOKEN_EXPIRED",
      clearCookie: true,
    };
    assert.equal(shouldClearRefreshCookie(invalid), true);
    assert.equal(shouldClearRefreshCookie(expired), true);
  });

  it("regression: loser must not clear after winner rotated", () => {
    const winner: RotateRefreshResult = {
      ok: true,
      kind: "rotated",
      userId: "user_1",
      rawToken: "winner-token",
      familyId: "family_1",
      expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    const loser: RotateRefreshResult = {
      ok: true,
      kind: "concurrent",
      userId: "user_1",
      familyId: "family_1",
    };

    assert.equal(shouldSetNewRefreshCookie(winner), true);
    assert.equal(shouldClearRefreshCookie(loser), false);
    assert.equal(
      shouldClearRefreshCookie(winner) || shouldClearRefreshCookie(loser),
      false,
      "neither response in a concurrent pair may clear the refresh cookie"
    );
  });
});
