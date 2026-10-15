import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProcurementRequestStatus } from "@prisma/client";
import { PROCUREMENT_STATUSES } from "./admin-procurement";
import {
  buildProcurementRequestListWhere,
  isSupportedProcurementRequestStatus,
  nextProcurementRequestStatusAfterReceive,
  parseProcurementRequestStatusQuery,
  procurementRequestsEmptyMessage,
  requestMatchesStatusFilter,
  resolveProcurementRequestStatusFilter,
  shouldCommitListResult,
  UNRESOLVED_REQUEST_STATUSES,
} from "./procurement-request-filters";

const FIXTURES = [
  { publicId: "PR-000001", status: "APPROVED", source: "MINIMUM_STOCK_THRESHOLD", priority: "NORMAL", lensType: "SINGLE_VISION" },
  { publicId: "PR-000002", status: "OPEN", source: "ORDER_SHORTAGE", priority: "HIGH", lensType: "KRYPTOK" },
  { publicId: "PR-000003", status: "UNDER_REVIEW", source: "MANUAL", priority: "CRITICAL", lensType: "PROGRESSIVE" },
  { publicId: "PR-000004", status: "CANCELLED", source: "MANUAL", priority: "LOW", lensType: "SINGLE_VISION" },
  { publicId: "PR-000005", status: "RESOLVED", source: "ORDER_SHORTAGE", priority: "NORMAL", lensType: "KRYPTOK" },
] as const;

function applyFilters(
  rows: readonly (typeof FIXTURES)[number][],
  opts: {
    status?: string;
    openOnly?: boolean;
    source?: string;
    priority?: string;
    lensType?: string;
  }
) {
  return rows.filter((row) => {
    if (!requestMatchesStatusFilter(row.status, opts)) return false;
    if (opts.source && row.source !== opts.source) return false;
    if (opts.priority && row.priority !== opts.priority) return false;
    if (opts.lensType && row.lensType !== opts.lensType) return false;
    return true;
  });
}

describe("resolveProcurementRequestStatusFilter", () => {
  it("Open filter excludes Approved requests (with unresolved-only)", () => {
    const clause = resolveProcurementRequestStatusFilter({
      status: ProcurementRequestStatus.OPEN,
      openOnly: true,
    });
    assert.equal(clause, ProcurementRequestStatus.OPEN);
    const matched = applyFilters(FIXTURES, {
      status: "OPEN",
      openOnly: true,
    });
    assert.deepEqual(
      matched.map((r) => r.publicId),
      ["PR-000002"]
    );
    assert.ok(!matched.some((r) => r.status === "APPROVED"));
  });

  it("Approved filter includes Approved requests", () => {
    const clause = resolveProcurementRequestStatusFilter({
      status: ProcurementRequestStatus.APPROVED,
      openOnly: true,
    });
    assert.equal(clause, ProcurementRequestStatus.APPROVED);
    const matched = applyFilters(FIXTURES, {
      status: "APPROVED",
      openOnly: true,
    });
    assert.deepEqual(
      matched.map((r) => r.publicId),
      ["PR-000001"]
    );
  });

  it("Under Review filter excludes unrelated statuses", () => {
    const matched = applyFilters(FIXTURES, {
      status: "UNDER_REVIEW",
      openOnly: true,
    });
    assert.deepEqual(
      matched.map((r) => r.publicId),
      ["PR-000003"]
    );
    assert.ok(!matched.some((r) => r.status !== "UNDER_REVIEW"));
  });

  it("All statuses with unresolved-only returns only unresolved set", () => {
    const clause = resolveProcurementRequestStatusFilter({ openOnly: true });
    assert.deepEqual(clause, { in: [...UNRESOLVED_REQUEST_STATUSES] });
    const matched = applyFilters(FIXTURES, { openOnly: true });
    assert.deepEqual(
      matched.map((r) => r.publicId).toSorted(),
      ["PR-000001", "PR-000002", "PR-000003"]
    );
  });

  it("All statuses without unresolved-only displays all records", () => {
    const clause = resolveProcurementRequestStatusFilter({ openOnly: false });
    assert.equal(clause, undefined);
    const matched = applyFilters(FIXTURES, { openOnly: false });
    assert.equal(matched.length, FIXTURES.length);
  });

  it("Unresolved-only + terminal status yields empty intersection", () => {
    const clause = resolveProcurementRequestStatusFilter({
      status: ProcurementRequestStatus.CANCELLED,
      openOnly: true,
    });
    assert.deepEqual(clause, { in: [] });
    const matched = applyFilters(FIXTURES, {
      status: "CANCELLED",
      openOnly: true,
    });
    assert.equal(matched.length, 0);
  });
});

describe("buildProcurementRequestListWhere AND logic", () => {
  it("combines status with source/priority/lensType", () => {
    const where = buildProcurementRequestListWhere({
      status: ProcurementRequestStatus.OPEN,
      openOnly: true,
      source: "ORDER_SHORTAGE",
      priority: "HIGH",
      lensType: "KRYPTOK",
    });
    assert.equal(where.status, ProcurementRequestStatus.OPEN);
    assert.equal(where.source, "ORDER_SHORTAGE");
    assert.equal(where.priority, "HIGH");
    assert.equal(where.lensType, "KRYPTOK");

    const matched = applyFilters(FIXTURES, {
      status: "OPEN",
      openOnly: true,
      source: "ORDER_SHORTAGE",
      priority: "HIGH",
      lensType: "KRYPTOK",
    });
    assert.deepEqual(
      matched.map((r) => r.publicId),
      ["PR-000002"]
    );
  });

  it("does not let openOnly overwrite an explicit Open status", () => {
    const where = buildProcurementRequestListWhere({
      status: ProcurementRequestStatus.OPEN,
      openOnly: true,
    });
    // Regression: previously `{ status: { in: [OPEN, UNDER_REVIEW, APPROVED] } }`
    assert.equal(where.status, "OPEN");
    assert.notDeepEqual(where.status, {
      in: ["OPEN", "UNDER_REVIEW", "APPROVED"],
    });
  });
});

describe("procurementRequestsEmptyMessage", () => {
  it("shows filter empty-state when no rows match", () => {
    const matched = applyFilters(FIXTURES, {
      status: "OPEN",
      openOnly: true,
      source: "MANUAL",
    });
    assert.equal(matched.length, 0);
    assert.equal(
      procurementRequestsEmptyMessage(true),
      "No requests match the current filters."
    );
  });

  it("shows default empty copy when no filters are active", () => {
    assert.equal(
      procurementRequestsEmptyMessage(false),
      "No procurement requests. Nothing needs buying right now."
    );
  });
});

describe("shouldCommitListResult", () => {
  it("rejects stale responses after rapid filter changes", () => {
    let latest = 0;
    const commits: number[] = [];

    // Simulate Open request starting first, then Approved superseding it.
    const openSeq = ++latest; // 1
    const approvedSeq = ++latest; // 2

    // Stale Open response arrives late — must not commit.
    if (shouldCommitListResult(openSeq, latest)) commits.push(openSeq);
    // Fresh Approved response — must commit.
    if (shouldCommitListResult(approvedSeq, latest)) commits.push(approvedSeq);

    assert.deepEqual(commits, [approvedSeq]);
    assert.ok(!commits.includes(openSeq));
  });
});

describe("PROCUREMENT_STATUSES dropdown alignment", () => {
  const enumValues = new Set(Object.values(ProcurementRequestStatus));
  const optionValues = PROCUREMENT_STATUSES.map((o) => o.value).filter(Boolean);

  it("every displayed status option is a supported enum value", () => {
    for (const value of optionValues) {
      assert.ok(
        enumValues.has(value as ProcurementRequestStatus),
        `unsupported dropdown value: ${value}`
      );
      assert.equal(isSupportedProcurementRequestStatus(value), true);
    }
  });

  it("does not offer PO/receipt statuses PARTIALLY_RECEIVED or RECEIVED", () => {
    const values = optionValues as string[];
    assert.ok(!values.includes("PARTIALLY_RECEIVED"));
    assert.ok(!values.includes("RECEIVED"));
  });

  it("covers every Prisma ProcurementRequestStatus exactly once", () => {
    assert.deepEqual(
      optionValues.toSorted(),
      [...enumValues].toSorted()
    );
  });

  it("selecting each valid status produces the correct filter", () => {
    for (const status of Object.values(ProcurementRequestStatus)) {
      const where = buildProcurementRequestListWhere({
        status,
        openOnly: false,
      });
      assert.equal(where.status, status);
      const matched = applyFilters(FIXTURES, { status, openOnly: false });
      assert.ok(matched.every((r) => r.status === status));
    }
  });
});

describe("parseProcurementRequestStatusQuery", () => {
  it("accepts each valid status (case-insensitive)", () => {
    for (const status of Object.values(ProcurementRequestStatus)) {
      const parsed = parseProcurementRequestStatusQuery(status.toLowerCase());
      assert.deepEqual(parsed, { ok: true, status });
    }
  });

  it("treats missing status as no filter", () => {
    assert.deepEqual(parseProcurementRequestStatusQuery(null), {
      ok: true,
      status: undefined,
    });
    assert.deepEqual(parseProcurementRequestStatusQuery(""), {
      ok: true,
      status: undefined,
    });
  });

  it("returns controlled HTTP 400 for invalid status query parameters", () => {
    for (const invalid of [
      "PARTIALLY_RECEIVED",
      "RECEIVED",
      "SENT",
      "DRAFT",
      "not-a-status",
    ]) {
      const parsed = parseProcurementRequestStatusQuery(invalid);
      assert.deepEqual(parsed, {
        ok: false,
        error: "Invalid status filter.",
        httpStatus: 400,
      });
    }
  });
});

describe("goods-receiving vs ProcurementRequest status", () => {
  it("partial receive keeps APPROVED and updates quantity only", () => {
    const next = nextProcurementRequestStatusAfterReceive({
      currentStatus: ProcurementRequestStatus.APPROVED,
      requestedQuantity: 20,
      receivedQuantityBefore: 0,
      receiveBy: 8,
    });
    assert.equal(next.fullyReceived, false);
    assert.equal(next.receivedQuantity, 8);
    assert.equal(next.status, ProcurementRequestStatus.APPROVED);
    assert.notEqual(next.status, "PARTIALLY_RECEIVED");
    assert.notEqual(next.status, "RECEIVED");
  });

  it("full receive resolves the request (compatible with PO PARTIALLY_RECEIVED / CLOSED)", () => {
    const next = nextProcurementRequestStatusAfterReceive({
      currentStatus: ProcurementRequestStatus.APPROVED,
      requestedQuantity: 20,
      receivedQuantityBefore: 12,
      receiveBy: 8,
    });
    assert.equal(next.fullyReceived, true);
    assert.equal(next.receivedQuantity, 20);
    assert.equal(next.status, ProcurementRequestStatus.RESOLVED);
  });

  it("Resolved + unresolved-only remains an empty intersection", () => {
    const clause = resolveProcurementRequestStatusFilter({
      status: ProcurementRequestStatus.RESOLVED,
      openOnly: true,
    });
    assert.deepEqual(clause, { in: [] });
  });
});
