import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCustomersListWhere,
  parseCustomersListParams,
} from "./customers-list";

describe("parseCustomersListParams", () => {
  it("parses tierCode and accountAction", () => {
    const p = parseCustomersListParams(
      new URLSearchParams("tierCode=b&accountAction=blocked&q=27A")
    );
    assert.equal(p.tierCode, "B");
    assert.equal(p.accountAction, "BLOCKED");
    assert.equal(p.q, "27A");
  });
});

describe("buildCustomersListWhere", () => {
  it("includes gstNumber in search OR", () => {
    const where = buildCustomersListWhere({
      page: 1,
      limit: 30,
      status: "approved",
      activeOnly: false,
      q: "27AAAAA",
    });
    const and = (where as { AND?: unknown[] }).AND;
    assert.ok(Array.isArray(and));
    const search = and!.find(
      (part) => part && typeof part === "object" && "OR" in part
    ) as { OR: Array<Record<string, unknown>> };
    assert.ok(search.OR.some((clause) => "gstNumber" in clause));
  });

  it("filters by tier code via pricingTier relation", () => {
    const where = buildCustomersListWhere({
      page: 1,
      limit: 30,
      status: "approved",
      activeOnly: false,
      tierCode: "D",
    });
    const and = (where as { AND?: unknown[] }).AND;
    assert.ok(Array.isArray(and));
    assert.ok(
      and!.some(
        (part) =>
          part &&
          typeof part === "object" &&
          "pricingTier" in (part as object)
      )
    );
  });
});
