import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvoicesListWhere,
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
});
