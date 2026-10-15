import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessProfitCogsAvailability,
  isProfitMarginReportRunnable,
} from "./profit-cogs";
import { DEFERRED_REPORTS } from "./deferred-reports";
import { getReportDefinition } from "./registry";

describe("profit / COGS availability", () => {
  it("blocks gross profit when historical invoice COGS is unavailable", () => {
    const avail = assessProfitCogsAvailability();
    assert.equal(avail.canComputeGrossProfit, false);
    assert.equal(avail.canComputeGrossMargin, false);
    assert.equal(avail.netSalesSupported, true);
    assert.ok(
      avail.blockers.includes("INVOICE_LINE_MISSING_HISTORICAL_COST")
    );
    assert.ok(
      avail.blockers.includes("CURRENT_COST_PRICE_FORBIDDEN_AS_SUBSTITUTE")
    );
    assert.ok(avail.blockers.includes("PERIOD_PURCHASES_ARE_NOT_COGS"));
    assert.match(avail.explanation, /without inventing cost/i);
    assert.equal(isProfitMarginReportRunnable(), false);
  });

  it("keeps profit-margin deferred and out of the runnable registry", () => {
    assert.ok(DEFERRED_REPORTS.some((r) => r.key === "profit-margin"));
    assert.equal(getReportDefinition("profit-margin"), null);
  });
});
