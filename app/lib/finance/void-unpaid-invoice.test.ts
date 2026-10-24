import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  invoiceBlocksOrderCancellation,
  shouldApplyInvoiceVoidOnOrderCancel,
} from "./void-unpaid-invoice-policy";

describe("void-unpaid-invoice-policy isolation", () => {
  it("policy module does not import app/lib/prisma", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/finance/void-unpaid-invoice-policy.ts"),
      "utf8"
    );
    assert.equal(/from\s+["']@\/app\/lib\/prisma["']/.test(src), false);
  });
});

describe("invoiceBlocksOrderCancellation", () => {
  it("allows unpaid ISSUED / DRAFT / OVERDUE", () => {
    for (const status of ["ISSUED", "DRAFT", "OVERDUE"] as const) {
      assert.equal(
        invoiceBlocksOrderCancellation({
          status,
          amountPaid: 0,
          amountOutstanding: 540,
          paymentAllocationCount: 0,
          creditNoteCount: 0,
        }),
        null
      );
    }
  });

  it("allows already VOID / CANCELLED (idempotent cancel)", () => {
    assert.equal(
      invoiceBlocksOrderCancellation({
        status: "VOID",
        amountPaid: 0,
        amountOutstanding: 0,
        paymentAllocationCount: 0,
        creditNoteCount: 0,
      }),
      null
    );
    assert.equal(
      invoiceBlocksOrderCancellation({
        status: "CANCELLED",
        amountPaid: 0,
        amountOutstanding: 0,
        paymentAllocationCount: 0,
        creditNoteCount: 0,
      }),
      null
    );
  });

  it("allows legacy status-only PAID with no money (fake PAID from order COMPLETED)", () => {
    assert.equal(
      invoiceBlocksOrderCancellation({
        status: "PAID",
        amountPaid: 0,
        amountOutstanding: 1080,
        paymentAllocationCount: 0,
        creditNoteCount: 0,
      }),
      null
    );
  });

  it("allows paid / partial / allocated invoices (Phase F refund path)", () => {
    assert.equal(
      invoiceBlocksOrderCancellation({
        status: "PAID",
        amountPaid: 540,
        amountOutstanding: 0,
        paymentAllocationCount: 0,
        creditNoteCount: 0,
      }),
      null
    );
    assert.equal(
      invoiceBlocksOrderCancellation({
        status: "PARTIALLY_PAID",
        amountPaid: 200,
        amountOutstanding: 340,
        paymentAllocationCount: 0,
        creditNoteCount: 0,
      }),
      null
    );
    assert.equal(
      invoiceBlocksOrderCancellation({
        status: "ISSUED",
        amountPaid: 0,
        amountOutstanding: 540,
        paymentAllocationCount: 1,
        creditNoteCount: 0,
      }),
      null
    );
  });

  it("blocks invoices with credit notes", () => {
    const msg = invoiceBlocksOrderCancellation({
      status: "ISSUED",
      amountPaid: 0,
      amountOutstanding: 100,
      paymentAllocationCount: 0,
      creditNoteCount: 1,
    });
    assert.ok(msg);
    assert.match(msg!, /credit notes/i);
  });
});

describe("shouldApplyInvoiceVoidOnOrderCancel", () => {
  it("voids open statuses and skips already closed", () => {
    assert.equal(shouldApplyInvoiceVoidOnOrderCancel("ISSUED"), true);
    assert.equal(shouldApplyInvoiceVoidOnOrderCancel("PAID"), true);
    assert.equal(shouldApplyInvoiceVoidOnOrderCancel("VOID"), false);
    assert.equal(shouldApplyInvoiceVoidOnOrderCancel("CANCELLED"), false);
  });
});

describe("order status / dispatch route contracts (Phase 1)", () => {
  it("PUT /api/orders/[id] does not flip invoice PAID/ISSUED from order status", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    assert.equal(src.includes("InvoiceStatus.PAID"), false);
    assert.equal(src.includes("InvoiceStatus.ISSUED"), false);
    assert.match(src, /voidUnpaidInvoiceOnOrderCancel/);
    assert.match(src, /assertOrderInvoiceAllowsCancellation/);
    // Legacy status→invoice coupling must stay gone.
    assert.equal(
      /invoice\.updateMany\(\s*\{[\s\S]*?status:\s*status\s*===\s*[\"']COMPLETED[\"']/.test(
        src
      ),
      false
    );
  });

  it("dispatch does not overwrite invoice status to ISSUED", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/dispatch/route.ts"),
      "utf8"
    );
    assert.equal(src.includes("InvoiceStatus.ISSUED"), false);
    assert.equal(/invoice\.updateMany/.test(src), false);
  });

  it("archive DELETE voids unpaid invoice via shared helper", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    assert.match(src, /export async function DELETE/);
    assert.match(src, /voidUnpaidInvoiceOnOrderCancel/);
  });
});
