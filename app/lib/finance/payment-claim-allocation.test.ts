import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePaymentClaimItemAllocations } from "./payment-claim-allocation";
import { sortedUniqueInvoiceIds } from "./invoice-locks";

describe("resolvePaymentClaimItemAllocations", () => {
  it("equal-splits when no explicit item amounts", () => {
    const rows = resolvePaymentClaimItemAllocations({
      claimAmount: 100,
      items: [{ invoiceId: "a" }, { invoiceId: "b" }],
    });
    assert.deepEqual(rows, [
      { invoiceId: "a", amount: 50 },
      { invoiceId: "b", amount: 50 },
    ]);
  });

  it("uses explicit item amounts when present (does not equal-split claim)", () => {
    const rows = resolvePaymentClaimItemAllocations({
      claimAmount: 100,
      items: [
        { invoiceId: "a", amount: 70 },
        { invoiceId: "b", amount: 30 },
      ],
    });
    assert.deepEqual(rows, [
      { invoiceId: "a", amount: 70 },
      { invoiceId: "b", amount: 30 },
    ]);
  });

  it("does not treat claim.amount / n as each item amount when explicit exists", () => {
    // Regression: old code used Number(i.amount ?? claim.amount) / n
    // which turned missing amounts into claim/n and diluted explicit ones.
    const rows = resolvePaymentClaimItemAllocations({
      claimAmount: 300,
      items: [
        { invoiceId: "a", amount: 200 },
        { invoiceId: "b", amount: 100 },
      ],
    });
    assert.equal(rows[0]!.amount, 200);
    assert.equal(rows[1]!.amount, 100);
    assert.notEqual(rows[0]!.amount, 150);
  });

  it("puts remainder pennies on the last equal-split item", () => {
    const rows = resolvePaymentClaimItemAllocations({
      claimAmount: 100,
      items: [{ invoiceId: "a" }, { invoiceId: "b" }, { invoiceId: "c" }],
    });
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    assert.equal(Math.round(sum * 100) / 100, 100);
  });
});

describe("sortedUniqueInvoiceIds (deadlock avoidance)", () => {
  it("sorts and dedupes deterministically", () => {
    assert.deepEqual(sortedUniqueInvoiceIds(["c", "a", "b", "a"]), [
      "a",
      "b",
      "c",
    ]);
  });
});
