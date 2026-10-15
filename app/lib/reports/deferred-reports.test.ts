import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFERRED_REPORTS } from "./deferred-reports";
import { getReportDefinition } from "./registry";

describe("RW-06 deferred reports", () => {
  it("defers only Profit & Margin pending historical COGS", () => {
    const keys = DEFERRED_REPORTS.map((r) => r.key).sort();
    assert.deepEqual(keys, ["profit-margin"]);
    for (const item of DEFERRED_REPORTS) {
      assert.ok(item.blockedOn.length > 20);
      assert.equal(getReportDefinition(item.key), null);
    }
    assert.match(DEFERRED_REPORTS[0].blockedOn, /historical COGS/i);
  });

  it("registers implemented power, aging, and ready-stock reports", () => {
    for (const key of [
      "fast-moving-powers",
      "slow-moving-powers",
      "dead-powers",
      "unsold-powers",
      "stock-aging",
      "ready-stock-orders",
    ]) {
      assert.ok(getReportDefinition(key), key);
    }
  });
});
