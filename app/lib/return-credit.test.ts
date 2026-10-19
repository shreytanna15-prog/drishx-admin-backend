import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateReturnCreditAcrossInvoices,
  estimateReturnCreditByOrder,
  estimateReturnCreditFallback,
  invoiceStatusAfterCreditApplication,
} from "./return-credit";

describe("estimateReturnCreditFallback (tax-inclusive C8)", () => {
  it("uses invoice line totals for qty 2 @ pair ₹192 (tax-incl)", () => {
    const ordersById = new Map([
      ["o1", { id: "o1", quantity: 2, unitPrice: 192, totalAmount: 192 }],
    ]);
    const invoicesByOrderId = new Map([
      [
        "o1",
        {
          id: "inv1",
          orderId: "o1",
          amount: 201.6,
          lines: [{ quantity: 2, unitPrice: 96, lineTotal: 201.6 }],
        },
      ],
    ]);
    const amount = estimateReturnCreditFallback({
      items: [{ originalOrderId: "o1", quantity: 2 }],
      ordersById,
      invoicesByOrderId,
    });
    assert.equal(amount, 201.6);
  });

  it("partial return is proportional to tax-inclusive invoice total", () => {
    const ordersById = new Map([
      ["o1", { id: "o1", quantity: 4, unitPrice: 192, totalAmount: 384 }],
    ]);
    const invoicesByOrderId = new Map([
      [
        "o1",
        {
          id: "inv1",
          orderId: "o1",
          amount: 403.2,
          lines: [{ quantity: 4, unitPrice: 96, lineTotal: 403.2 }],
        },
      ],
    ]);
    const amount = estimateReturnCreditFallback({
      items: [{ originalOrderId: "o1", quantity: 2 }],
      ordersById,
      invoicesByOrderId,
    });
    assert.equal(amount, 201.6);
  });

  it("does not fall back to pre-tax order total when invoice is missing", () => {
    const ordersById = new Map([
      ["o1", { id: "o1", quantity: 2, unitPrice: 192, totalAmount: 192 }],
    ]);
    const amount = estimateReturnCreditFallback({
      items: [{ originalOrderId: "o1", quantity: 2 }],
      ordersById,
    });
    assert.equal(amount, 0);
  });

  it("does not use pair price × pieces (legacy bug)", () => {
    const ordersById = new Map([
      ["o1", { id: "o1", quantity: 2, unitPrice: 192, totalAmount: 192 }],
    ]);
    const invoicesByOrderId = new Map([
      [
        "o1",
        {
          id: "inv1",
          orderId: "o1",
          amount: 201.6,
          lines: [{ quantity: 2, unitPrice: 96, lineTotal: 201.6 }],
        },
      ],
    ]);
    const amount = estimateReturnCreditFallback({
      items: [{ originalOrderId: "o1", quantity: 2 }],
      ordersById,
      invoicesByOrderId,
    });
    assert.notEqual(amount, 192 * 2);
    assert.equal(amount, 201.6);
  });

  it("sums tax-inclusive credits across multiple orders", () => {
    const ordersById = new Map([
      ["a", { id: "a", quantity: 2, unitPrice: 192, totalAmount: 192 }],
      ["b", { id: "b", quantity: 4, unitPrice: 100, totalAmount: 200 }],
    ]);
    const invoicesByOrderId = new Map([
      [
        "a",
        {
          id: "ia",
          orderId: "a",
          amount: 192,
          lines: [{ quantity: 2, unitPrice: 96, lineTotal: 192 }],
        },
      ],
      [
        "b",
        {
          id: "ib",
          orderId: "b",
          amount: 200,
          lines: [{ quantity: 4, unitPrice: 50, lineTotal: 200 }],
        },
      ],
    ]);
    const amount = estimateReturnCreditFallback({
      items: [
        { originalOrderId: "a", quantity: 2 },
        { originalOrderId: "b", quantity: 2 },
      ],
      ordersById,
      invoicesByOrderId,
    });
    assert.equal(amount, 192 + 100);
  });
});

describe("allocateReturnCreditAcrossInvoices (C5 + C7)", () => {
  it("splits approved credit across every linked order invoice", () => {
    const eligibleByOrderId = new Map([
      ["a", 192],
      ["b", 100],
    ]);
    const result = allocateReturnCreditAcrossInvoices({
      approvedAmount: 292,
      eligibleByOrderId,
      invoices: [
        {
          orderId: "a",
          invoiceId: "ia",
          invoiceAmount: 192,
          amountOutstanding: 192,
          taxableAmount: 192,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
        },
        {
          orderId: "b",
          invoiceId: "ib",
          invoiceAmount: 200,
          amountOutstanding: 200,
          taxableAmount: 200,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
        },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.allocations.length, 2);
    assert.equal(result.totalApplied, 292);
    const byInv = new Map(result.allocations.map((a) => [a.invoiceId, a.amount]));
    assert.equal(byInv.get("ia"), 192);
    assert.equal(byInv.get("ib"), 100);
  });

  it("rejects when a share exceeds invoice outstanding (paid/exhausted)", () => {
    const result = allocateReturnCreditAcrossInvoices({
      approvedAmount: 500,
      eligibleByOrderId: new Map([["a", 500]]),
      invoices: [
        {
          orderId: "a",
          invoiceId: "ia",
          invoiceAmount: 500,
          amountOutstanding: 0,
          taxableAmount: 500,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
        },
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /outstanding|paid|refund/i);
    }
  });

  it("rejects when an order has eligible credit but no invoice", () => {
    const result = allocateReturnCreditAcrossInvoices({
      approvedAmount: 100,
      eligibleByOrderId: new Map([["a", 100]]),
      invoices: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /no invoice/i);
  });

  it("scales partial admin amount across invoices by weight", () => {
    const result = allocateReturnCreditAcrossInvoices({
      approvedAmount: 146,
      eligibleByOrderId: new Map([
        ["a", 192],
        ["b", 100],
      ]),
      invoices: [
        {
          orderId: "a",
          invoiceId: "ia",
          invoiceAmount: 192,
          amountOutstanding: 192,
          taxableAmount: 192,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
        },
        {
          orderId: "b",
          invoiceId: "ib",
          invoiceAmount: 200,
          amountOutstanding: 200,
          taxableAmount: 200,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
        },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.totalApplied, 146);
    const a = result.allocations.find((x) => x.invoiceId === "ia")!;
    const b = result.allocations.find((x) => x.invoiceId === "ib")!;
    assert.ok(a.amount > 0 && b.amount > 0);
    assert.equal(a.amount + b.amount, 146);
  });
});

describe("invoiceStatusAfterCreditApplication", () => {
  it("marks PAID when outstanding clears without inventing negative AR", () => {
    assert.equal(
      invoiceStatusAfterCreditApplication({
        invoiceAmount: 500,
        amountOutstandingAfter: 0,
        previousStatus: "ISSUED",
      }),
      "PAID"
    );
    assert.equal(
      invoiceStatusAfterCreditApplication({
        invoiceAmount: 500,
        amountOutstandingAfter: 200,
        previousStatus: "ISSUED",
      }),
      "PARTIALLY_PAID"
    );
  });
});

describe("estimateReturnCreditByOrder", () => {
  it("returns per-order tax-inclusive map for multi-order returns", () => {
    const map = estimateReturnCreditByOrder({
      items: [
        { originalOrderId: "a", quantity: 2 },
        { originalOrderId: "b", quantity: 2 },
      ],
      ordersById: new Map([
        ["a", { id: "a", quantity: 2, unitPrice: 100, totalAmount: 100 }],
        ["b", { id: "b", quantity: 4, unitPrice: 100, totalAmount: 200 }],
      ]),
      invoicesByOrderId: new Map([
        [
          "a",
          {
            id: "ia",
            orderId: "a",
            amount: 105,
            lines: [{ quantity: 2, unitPrice: 50, lineTotal: 105 }],
          },
        ],
        [
          "b",
          {
            id: "ib",
            orderId: "b",
            amount: 210,
            lines: [{ quantity: 4, unitPrice: 50, lineTotal: 210 }],
          },
        ],
      ]),
    });
    assert.equal(map.get("a"), 105);
    assert.equal(map.get("b"), 105);
  });
});
