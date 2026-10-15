import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStockAgingRows,
  classifyLastReceiptRecency,
  classifyStockAge,
  mergeLastReceiptDates,
  summarizeStockAging,
} from "./stock-aging-format";

describe("stock aging format", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");

  it("never invents age without a receipt date", () => {
    assert.equal(classifyLastReceiptRecency(null, now), "Unknown");
    assert.equal(classifyStockAge(null, now), "Unknown");
  });

  it("reuses receivables aging buckets for last-receipt recency", () => {
    assert.equal(
      classifyLastReceiptRecency(new Date("2026-10-01T00:00:00.000Z"), now),
      "0-30"
    );
    assert.equal(
      classifyLastReceiptRecency(new Date("2026-08-20T00:00:00.000Z"), now),
      "31-60"
    );
    assert.equal(
      classifyLastReceiptRecency(new Date("2026-08-01T00:00:00.000Z"), now),
      "61-90"
    );
    assert.equal(
      classifyLastReceiptRecency(new Date("2026-01-01T00:00:00.000Z"), now),
      "90+"
    );
  });

  it("merges receipt dates to the latest", () => {
    const a = new Date("2026-01-01");
    const b = new Date("2026-06-01");
    assert.equal(mergeLastReceiptDates(a, b)?.toISOString(), b.toISOString());
    assert.equal(mergeLastReceiptDates(null, b)?.toISOString(), b.toISOString());
  });

  it("labels known history as last-receipt recency, not exact stock age", () => {
    const rows = buildStockAgingRows(
      [
        {
          lensType: "SINGLE_VISION",
          lensId: "1",
          label: "Known",
          power: "SPH 0",
          onHand: 4,
          unitCost: 10,
          lastReceiptAt: new Date("2026-10-01T00:00:00.000Z"),
        },
        {
          lensType: "SINGLE_VISION",
          lensId: "2",
          label: "Unknown",
          power: "SPH 1",
          onHand: 7,
          unitCost: null,
          lastReceiptAt: null,
        },
        {
          lensType: "SINGLE_VISION",
          lensId: "3",
          label: "Empty",
          power: "SPH 2",
          onHand: 0,
          unitCost: 1,
          lastReceiptAt: now,
        },
      ],
      now
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].recencyBucket, "Unknown");
    assert.match(String(rows[0].historyStatus), /Unknown/i);
    assert.equal(rows[0].ageMeasure, "Unknown");
    assert.equal(rows[1].recencyBucket, "0-30");
    assert.match(String(rows[1].ageMeasure), /Last-receipt recency/i);
    assert.equal(rows[1].costValuation, 40);

    const summary = summarizeStockAging(rows);
    assert.equal(summary.Unknown.skus, 1);
    assert.equal(summary.Unknown.onHand, 7);
    assert.equal(summary["0-30"].skus, 1);
  });
});
