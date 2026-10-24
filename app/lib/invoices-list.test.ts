import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvoicesListWhere,
  invoiceStatusFromSearchQuery,
  parseInvoicesListParams,
} from "./invoices-list";

describe("parseInvoicesListParams", () => {
  it("parses dateFrom and dateTo as ISO strings", () => {
    const params = parseInvoicesListParams(
      new URLSearchParams({
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-01-31T23:59:59.999Z",
      })
    );
    assert.equal(params.dateFrom, "2026-01-01T00:00:00.000Z");
    assert.equal(params.dateTo, "2026-01-31T23:59:59.999Z");
  });

  it("ignores invalid dates", () => {
    const params = parseInvoicesListParams(
      new URLSearchParams({ dateFrom: "not-a-date", dateTo: "" })
    );
    assert.equal(params.dateFrom, undefined);
    assert.equal(params.dateTo, undefined);
  });
});

describe("buildInvoicesListWhere", () => {
  it("adds issuedAt range when date bounds are set", () => {
    const where = buildInvoicesListWhere(undefined, {
      page: 1,
      limit: 20,
      dateFrom: "2026-03-01T00:00:00.000Z",
      dateTo: "2026-03-31T23:59:59.999Z",
    });
    assert.deepEqual(where, {
      issuedAt: {
        gte: new Date("2026-03-01T00:00:00.000Z"),
        lte: new Date("2026-03-31T23:59:59.999Z"),
      },
    });
  });

  it("ANDs date range with status and search", () => {
    const where = buildInvoicesListWhere({ userId: "u1" }, {
      page: 1,
      limit: 20,
      status: "PAID",
      q: "INV",
      dateFrom: "2026-01-01T00:00:00.000Z",
    });
    assert.ok(where.AND);
    assert.equal(Array.isArray(where.AND) && where.AND.length, 4);
  });

  it("omits status OR branch when q is not a valid InvoiceStatus", () => {
    const where = buildInvoicesListWhere(undefined, {
      page: 1,
      limit: 20,
      q: "INV/26-27/000012",
    });
    assert.ok(where.OR);
    const or = where.OR as Array<Record<string, unknown>>;
    assert.equal(
      or.some((clause) => Object.prototype.hasOwnProperty.call(clause, "status")),
      false
    );
    assert.ok(or.some((clause) => "invoiceNumber" in clause));
    assert.ok(or.some((clause) => "user" in clause));
  });

  it("includes status equals when q matches a valid InvoiceStatus", () => {
    const where = buildInvoicesListWhere(undefined, {
      page: 1,
      limit: 20,
      q: "void",
    });
    assert.ok(where.OR);
    const or = where.OR as Array<{ status?: { equals?: string } }>;
    const statusClause = or.find((clause) => clause.status?.equals != null);
    assert.deepEqual(statusClause?.status, { equals: "VOID" });
  });
});

describe("invoiceStatusFromSearchQuery", () => {
  it("accepts exact enum values case-insensitively", () => {
    assert.equal(invoiceStatusFromSearchQuery("void"), "VOID");
    assert.equal(invoiceStatusFromSearchQuery("PAID"), "PAID");
    assert.equal(invoiceStatusFromSearchQuery(" partially_paid "), "PARTIALLY_PAID");
  });

  it("rejects invoice numbers and free text", () => {
    assert.equal(invoiceStatusFromSearchQuery("INV/26-27/000012"), undefined);
    assert.equal(invoiceStatusFromSearchQuery("unpaid"), undefined);
    assert.equal(invoiceStatusFromSearchQuery(""), undefined);
  });
});
