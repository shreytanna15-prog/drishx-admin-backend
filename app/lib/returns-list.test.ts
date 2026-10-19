import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Prisma } from "@prisma/client";
import {
  buildReturnsListWhere,
  parseExactOrderNumberQuery,
  parseReturnsListParams,
  RETURNS_LIST_DEFAULT_LIMIT,
  RETURNS_LIST_MAX_LIMIT,
} from "./returns-list";

describe("returns-list dependency isolation", () => {
  it("does not import prisma client or returns.ts (avoids DATABASE_URL)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/returns-list.ts"),
      "utf8"
    );
    assert.equal(src.includes('from "./prisma"'), false);
    assert.equal(src.includes("from './prisma'"), false);
    assert.equal(src.includes('from "./returns"'), false);
    assert.equal(src.includes("from './returns'"), false);
    assert.match(src, /from \"\.\/return-request-status\"/);
  });
});

function findOrClause(
  where: Prisma.ReturnRequestWhereInput
): Prisma.ReturnRequestWhereInput[] {
  if (where.OR && Array.isArray(where.OR)) return where.OR;
  if (where.AND && Array.isArray(where.AND)) {
    for (const part of where.AND) {
      if (part && typeof part === "object" && "OR" in part && Array.isArray(part.OR)) {
        return part.OR as Prisma.ReturnRequestWhereInput[];
      }
    }
  }
  return [];
}

describe("parseExactOrderNumberQuery", () => {
  it("accepts exact digits and optional # prefix", () => {
    assert.equal(parseExactOrderNumberQuery("504094"), 504094);
    assert.equal(parseExactOrderNumberQuery("#504094"), 504094);
    assert.equal(parseExactOrderNumberQuery("  #504094  "), 504094);
  });

  it("rejects non-exact / non-numeric tokens", () => {
    assert.equal(parseExactOrderNumberQuery("RET-898337397"), null);
    assert.equal(parseExactOrderNumberQuery("504094x"), null);
    assert.equal(parseExactOrderNumberQuery("order 504094"), null);
    assert.equal(parseExactOrderNumberQuery("#"), null);
    assert.equal(parseExactOrderNumberQuery("0"), null);
    assert.equal(parseExactOrderNumberQuery("-12"), null);
  });
});

describe("parseReturnsListParams", () => {
  it("preserves pagination bounds", () => {
    const params = parseReturnsListParams(
      new URLSearchParams({ page: "2", limit: "15", q: "504094" })
    );
    assert.equal(params.page, 2);
    assert.equal(params.limit, 15);
    assert.equal(params.q, "504094");
  });

  it("clamps limit and defaults page", () => {
    const params = parseReturnsListParams(
      new URLSearchParams({ limit: String(RETURNS_LIST_MAX_LIMIT + 50) })
    );
    assert.equal(params.page, 1);
    assert.equal(params.limit, RETURNS_LIST_MAX_LIMIT);
    assert.equal(
      parseReturnsListParams(new URLSearchParams()).limit,
      RETURNS_LIST_DEFAULT_LIMIT
    );
  });
});

describe("buildReturnsListWhere — order number search", () => {
  it("matches primaryOrder.orderNumber for exact numeric q", () => {
    const where = buildReturnsListWhere({}, { page: 1, limit: 30, q: "504094" });
    const or = findOrClause(where);
    assert.ok(
      or.some(
        (clause) =>
          clause.primaryOrder != null &&
          typeof clause.primaryOrder === "object" &&
          "orderNumber" in clause.primaryOrder &&
          clause.primaryOrder.orderNumber === 504094
      ),
      "expected primaryOrder.orderNumber === 504094"
    );
  });

  it("matches secondary linked orders via items.originalOrder.orderNumber", () => {
    const where = buildReturnsListWhere(
      {},
      { page: 1, limit: 30, q: "#504094" }
    );
    const or = findOrClause(where);
    assert.ok(
      or.some((clause) => {
        const items = clause.items;
        if (!items || typeof items !== "object" || !("some" in items)) {
          return false;
        }
        const some = items.some as Prisma.ReturnRequestItemWhereInput;
        const originalOrder = some.originalOrder;
        return (
          originalOrder != null &&
          typeof originalOrder === "object" &&
          "orderNumber" in originalOrder &&
          originalOrder.orderNumber === 504094
        );
      }),
      "expected items.some.originalOrder.orderNumber === 504094"
    );
  });

  it("does not add orderNumber clauses for non-numeric text", () => {
    const where = buildReturnsListWhere(
      {},
      { page: 1, limit: 30, q: "RET-898337397" }
    );
    const or = findOrClause(where);
    assert.equal(
      or.some(
        (clause) =>
          clause.primaryOrder != null &&
          typeof clause.primaryOrder === "object" &&
          "orderNumber" in clause.primaryOrder
      ),
      false
    );
    assert.ok(
      or.some(
        (clause) =>
          clause.requestNumber != null &&
          typeof clause.requestNumber === "object" &&
          "contains" in clause.requestNumber &&
          clause.requestNumber.contains === "RET-898337397"
      )
    );
  });

  it("preserves existing text search arms (customer, assignee, item)", () => {
    const where = buildReturnsListWhere(
      {},
      { page: 1, limit: 30, q: "optics" }
    );
    const or = findOrClause(where);
    assert.ok(or.some((c) => c.customer != null));
    assert.ok(or.some((c) => c.assignedEmployee != null));
    assert.ok(
      or.some((c) => {
        const items = c.items;
        return (
          items != null &&
          typeof items === "object" &&
          "some" in items &&
          items.some != null
        );
      })
    );
  });

  it("ANDs role scope with order-number OR (employee isolation)", () => {
    const where = buildReturnsListWhere(
      { assignedEmployeeId: "emp-1" },
      { page: 1, limit: 30, q: "504094" }
    );
    assert.ok(where.AND && Array.isArray(where.AND));
    const and = where.AND as Prisma.ReturnRequestWhereInput[];
    assert.ok(and.some((p) => p.assignedEmployeeId === "emp-1"));
    const orPart = and.find((p) => Array.isArray(p.OR));
    assert.ok(orPart?.OR);
    assert.ok(
      (orPart!.OR as Prisma.ReturnRequestWhereInput[]).some(
        (c) =>
          c.primaryOrder != null &&
          typeof c.primaryOrder === "object" &&
          "orderNumber" in c.primaryOrder &&
          c.primaryOrder.orderNumber === 504094
      )
    );
  });

  it("ANDs customer role scope with search (customer isolation)", () => {
    const where = buildReturnsListWhere(
      { customerId: "cust-9" },
      { page: 1, limit: 30, q: "504094" }
    );
    assert.ok(where.AND && Array.isArray(where.AND));
    const and = where.AND as Prisma.ReturnRequestWhereInput[];
    assert.ok(and.some((p) => p.customerId === "cust-9"));
  });

  it("pagination lives in params only — where has no skip/take fields", () => {
    const where = buildReturnsListWhere(
      {},
      { page: 3, limit: 15, q: "504094" }
    );
    assert.equal("skip" in where, false);
    assert.equal("take" in where, false);
    // Same where shape is used for count + findMany in GET /api/returns.
    assert.ok(findOrClause(where).length > 0);
  });
});

function findStatusClause(
  or: Prisma.ReturnRequestWhereInput[]
): Prisma.ReturnRequestWhereInput | undefined {
  return or.find((c) => "status" in c && c.status != null);
}

describe("buildReturnsListWhere status label / enum search", () => {
  it("matches every displayed label (case-insensitive, trimmed)", () => {
    const cases: Array<{ q: string; expected: string | { in: string[] } }> = [
      {
        q: "  Pending Admin Review  ",
        expected: { in: ["SUBMITTED", "ESCALATED_TO_ADMIN"] },
      },
      { q: "more info needed", expected: "MORE_INFO_REQUIRED" },
      {
        q: "REPLACEMENT APPROVED",
        expected: { in: ["AWAITING_MATERIAL", "APPROVED_REPLACEMENT"] },
      },
      { q: "Credit Approved", expected: "APPROVED_CREDIT" },
      { q: "Rejected", expected: "REJECTED" },
      { q: "Closed", expected: "CLOSED" },
    ];

    for (const { q, expected } of cases) {
      const or = findOrClause(
        buildReturnsListWhere({}, { page: 1, limit: 30, q })
      );
      const statusClause = findStatusClause(or);
      assert.ok(statusClause, `expected status clause for q=${JSON.stringify(q)}`);
      if (typeof expected === "string") {
        assert.equal(statusClause!.status, expected);
      } else {
        const inList = (statusClause!.status as { in: string[] }).in;
        assert.deepEqual([...inList].sort(), [...expected.in].sort());
      }
    }
  });

  it("still matches exact enum tokens", () => {
    const or = findOrClause(
      buildReturnsListWhere({}, { page: 1, limit: 30, q: "submitted" })
    );
    assert.equal(findStatusClause(or)?.status, "SUBMITTED");

    const or2 = findOrClause(
      buildReturnsListWhere({}, { page: 1, limit: 30, q: "MORE_INFO_REQUIRED" })
    );
    assert.equal(findStatusClause(or2)?.status, "MORE_INFO_REQUIRED");
  });

  it("does not add status clause for unrelated text", () => {
    const or = findOrClause(
      buildReturnsListWhere({}, { page: 1, limit: 30, q: "optics" })
    );
    assert.equal(findStatusClause(or), undefined);
  });

  it("keeps explicit status filter AND role scope with label search", () => {
    const where = buildReturnsListWhere(
      { assignedEmployeeId: "emp-1" },
      {
        page: 1,
        limit: 30,
        q: "Pending Admin Review",
        status: "APPROVED_CREDIT",
      }
    );
    assert.ok(where.AND && Array.isArray(where.AND));
    const and = where.AND as Prisma.ReturnRequestWhereInput[];
    assert.ok(and.some((p) => p.assignedEmployeeId === "emp-1"));
    assert.ok(and.some((p) => p.status === "APPROVED_CREDIT"));
    const orPart = and.find((p) => Array.isArray(p.OR));
    assert.ok(orPart?.OR);
    const statusInOr = findStatusClause(
      orPart!.OR as Prisma.ReturnRequestWhereInput[]
    );
    assert.ok(statusInOr);
    const inList = (statusInOr!.status as { in: string[] }).in;
    assert.deepEqual(
      [...inList].sort(),
      ["ESCALATED_TO_ADMIN", "SUBMITTED"].sort()
    );
  });

  it("preserves requestNumber / orderNumber / text OR arms alongside label match", () => {
    const or = findOrClause(
      buildReturnsListWhere({}, { page: 1, limit: 30, q: "Closed" })
    );
    assert.ok(
      or.some(
        (c) =>
          c.requestNumber != null &&
          typeof c.requestNumber === "object" &&
          "contains" in c.requestNumber
      )
    );
    assert.ok(or.some((c) => c.customer != null));
    assert.equal(findStatusClause(or)?.status, "CLOSED");
  });
});
