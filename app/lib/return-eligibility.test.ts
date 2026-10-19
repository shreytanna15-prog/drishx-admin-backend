import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  aggregateQuantitiesByOrderId,
  computeMaxEligibleCredit,
  resolveApprovedCreditAmount,
  statusReservesReturnQuantity,
  validateRequestedReturnQuantities,
} from "./return-eligibility-policy";

describe("return-eligibility-policy isolation", () => {
  it("policy module does not import app/lib/prisma", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/return-eligibility-policy.ts"),
      "utf8"
    );
    assert.equal(/from\s+["']@\/app\/lib\/prisma["']/.test(src), false);
  });
});

describe("statusReservesReturnQuantity", () => {
  it("excludes REJECTED; includes pending and approved", () => {
    assert.equal(statusReservesReturnQuantity("REJECTED", "REJECT"), false);
    assert.equal(statusReservesReturnQuantity("SUBMITTED", null), true);
    assert.equal(statusReservesReturnQuantity("APPROVED_CREDIT", "CREDIT"), true);
    assert.equal(statusReservesReturnQuantity("APPROVED_REPLACEMENT", "REPLACEMENT"), true);
  });

  it("CLOSED reserves only after CREDIT/REPLACEMENT decision", () => {
    assert.equal(statusReservesReturnQuantity("CLOSED", null), false);
    assert.equal(statusReservesReturnQuantity("CLOSED", "CREDIT"), true);
    assert.equal(statusReservesReturnQuantity("CLOSED", "REPLACEMENT"), true);
  });
});

describe("aggregateQuantitiesByOrderId", () => {
  it("sums duplicate lines for the same order", () => {
    const map = aggregateQuantitiesByOrderId([
      { originalOrderId: "o1", quantity: 2 },
      { originalOrderId: "o1", quantity: 3 },
      { originalOrderId: "o2", quantity: 1 },
    ]);
    assert.equal(map.get("o1"), 5);
    assert.equal(map.get("o2"), 1);
  });
});

describe("validateRequestedReturnQuantities", () => {
  it("allows partial return within remaining qty", () => {
    const result = validateRequestedReturnQuantities({
      requestedByOrderId: new Map([["o1", 2]]),
      orderedQtyByOrderId: new Map([["o1", 4]]),
      reservedQtyByOrderId: new Map([["o1", 1]]),
    });
    assert.equal(result.ok, true);
  });

  it("rejects when duplicate lines exceed remaining", () => {
    const result = validateRequestedReturnQuantities({
      requestedByOrderId: new Map([["o1", 8]]),
      orderedQtyByOrderId: new Map([["o1", 4]]),
      reservedQtyByOrderId: new Map(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /exceeds eligible/i);
  });

  it("rejects repeated request when prior pending reserved full qty", () => {
    const result = validateRequestedReturnQuantities({
      requestedByOrderId: new Map([["o1", 2]]),
      orderedQtyByOrderId: new Map([["o1", 4]]),
      reservedQtyByOrderId: new Map([["o1", 4]]),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /remaining 0/i);
  });
});

describe("computeMaxEligibleCredit + resolveApprovedCreditAmount", () => {
  const ordersById = new Map([
    [
      "o1",
      { id: "o1", quantity: 4, unitPrice: 270, totalAmount: 540 },
    ],
  ]);
  const invoicesByOrderId = new Map([
    [
      "o1",
      {
        id: "inv1",
        orderId: "o1",
        amount: 540,
        lines: [{ quantity: 4, unitPrice: 135, lineTotal: 540 }],
      },
    ],
  ]);

  it("partial return max is proportional (tax-inclusive invoice)", () => {
    const max = computeMaxEligibleCredit({
      items: [{ originalOrderId: "o1", quantity: 2 }],
      ordersById,
      invoicesByOrderId,
      priorCreditedByOrderId: new Map(),
    });
    assert.equal(max, 270);
  });

  it("reduces max by prior approved credits (cumulative)", () => {
    const max = computeMaxEligibleCredit({
      items: [{ originalOrderId: "o1", quantity: 4 }],
      ordersById,
      invoicesByOrderId,
      priorCreditedByOrderId: new Map([["o1", 270]]),
    });
    assert.equal(max, 270);
  });

  it("auto-calc uses max eligible when amount omitted", () => {
    const resolved = resolveApprovedCreditAmount({
      requestedAmount: undefined,
      maxEligible: 540,
    });
    assert.deepEqual(resolved, { ok: true, amount: 540 });
  });

  it("rejects over-credit — never silently caps", () => {
    const resolved = resolveApprovedCreditAmount({
      requestedAmount: 1080,
      maxEligible: 540,
    });
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.match(resolved.error, /exceeds eligible credit/i);
      assert.match(resolved.error, /540/);
    }
  });

  it("accepts amount within eligible limit", () => {
    const resolved = resolveApprovedCreditAmount({
      requestedAmount: 500,
      maxEligible: 540,
    });
    assert.deepEqual(resolved, { ok: true, amount: 500 });
  });

  it("rejects when no eligible credit remains", () => {
    const resolved = resolveApprovedCreditAmount({
      requestedAmount: undefined,
      maxEligible: 0,
    });
    assert.equal(resolved.ok, false);
  });

  it("rejects non-positive explicit amounts", () => {
    assert.equal(
      resolveApprovedCreditAmount({ requestedAmount: 0, maxEligible: 100 }).ok,
      false
    );
    assert.equal(
      resolveApprovedCreditAmount({ requestedAmount: -5, maxEligible: 100 }).ok,
      false
    );
  });
});

describe("route contracts (C2/C3)", () => {
  it("POST /api/returns locks orders and validates aggregated qty", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/returns/route.ts"),
      "utf8"
    );
    assert.match(src, /lockOrdersForReturnEligibility/);
    assert.match(src, /validateRequestedReturnQuantities/);
    assert.match(src, /aggregateQuantitiesByOrderId/);
  });

  it("decision route re-checks qty + credit eligibility inside the transaction", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/returns/[id]/decision/route.ts"),
      "utf8"
    );
    assert.match(src, /lockOrdersForReturnEligibility/);
    assert.match(src, /computeMaxEligibleCredit/);
    assert.match(src, /resolveApprovedCreditAmount/);
    assert.match(src, /allocateReturnCreditAcrossInvoices/);
    assert.match(src, /ReturnEligibilityError/);
    // Must not trust client amount without eligibility check.
    assert.equal(
      /approvedAmount\s*>\s*0\s*\?\s*approvedAmount/.test(src),
      false
    );
  });

  it("decision remains admin-only", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/returns/[id]/decision/route.ts"),
      "utf8"
    );
    assert.match(src, /session\.role !== ["']ADMIN["']/);
  });
});
