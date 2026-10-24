import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInvoiceStatusLabel,
  invoiceContributesToUnpaidTotal,
} from "./admin-invoices";

describe("formatInvoiceStatusLabel", () => {
  it("does not map VOID or CANCELLED to Unpaid", () => {
    assert.equal(formatInvoiceStatusLabel("VOID"), "Void");
    assert.equal(formatInvoiceStatusLabel("CANCELLED"), "Cancelled");
    assert.equal(formatInvoiceStatusLabel("PAID"), "Paid");
    assert.equal(formatInvoiceStatusLabel("ISSUED"), "Unpaid");
    assert.equal(formatInvoiceStatusLabel("PARTIALLY_PAID"), "Partially paid");
  });
});

describe("invoiceContributesToUnpaidTotal", () => {
  it("excludes VOID and CANCELLED from unpaid totals", () => {
    assert.equal(invoiceContributesToUnpaidTotal("ISSUED"), true);
    assert.equal(invoiceContributesToUnpaidTotal("PARTIALLY_PAID"), true);
    assert.equal(invoiceContributesToUnpaidTotal("OVERDUE"), true);
    assert.equal(invoiceContributesToUnpaidTotal("PAID"), false);
    assert.equal(invoiceContributesToUnpaidTotal("VOID"), false);
    assert.equal(invoiceContributesToUnpaidTotal("CANCELLED"), false);
  });
});
