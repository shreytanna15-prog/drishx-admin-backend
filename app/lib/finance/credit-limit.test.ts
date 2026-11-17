import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessCheckoutCreditSync } from "./credit-limit-gate";

describe("assessCheckoutCreditSync", () => {
  it("blocks CLOSED and BLOCKED", () => {
    const closed = assessCheckoutCreditSync(
      {
        accountAction: "CLOSED",
        creditAllowed: true,
        creditLimit: 1000 as never,
      },
      100
    );
    assert.ok(closed && !closed.ok);
    if (closed && !closed.ok) assert.equal(closed.code, "ACCOUNT_CLOSED");

    const blocked = assessCheckoutCreditSync(
      {
        accountAction: "BLOCKED",
        creditAllowed: true,
        creditLimit: null,
      },
      100
    );
    assert.ok(blocked && !blocked.ok);
    if (blocked && !blocked.ok) assert.equal(blocked.code, "ACCOUNT_BLOCKED");
  });

  it("blocks CREDIT_SUSPENDED and creditAllowed=false for nonzero orders", () => {
    const suspended = assessCheckoutCreditSync(
      {
        accountAction: "CREDIT_SUSPENDED",
        creditAllowed: true,
        creditLimit: null,
      },
      50
    );
    assert.ok(suspended && !suspended.ok);
    if (suspended && !suspended.ok) {
      assert.equal(suspended.code, "CREDIT_SUSPENDED");
    }

    const disallowed = assessCheckoutCreditSync(
      {
        accountAction: "NONE",
        creditAllowed: false,
        creditLimit: null,
      },
      50
    );
    assert.ok(disallowed && !disallowed.ok);
    if (disallowed && !disallowed.ok) {
      assert.equal(disallowed.code, "CREDIT_NOT_ALLOWED");
    }
  });

  it("allows zero-amount orders even when credit suspended", () => {
    const r = assessCheckoutCreditSync(
      {
        accountAction: "CREDIT_SUSPENDED",
        creditAllowed: false,
        creditLimit: 0 as never,
      },
      0
    );
    assert.deepEqual(r, { ok: true });
  });

  it("defers to DB when creditLimit is set", () => {
    const r = assessCheckoutCreditSync(
      {
        accountAction: "NONE",
        creditAllowed: true,
        // Prisma Decimal; gate only null-checks here.
        creditLimit: 5000 as never,
      },
      100
    );
    assert.equal(r, null);
  });
});
