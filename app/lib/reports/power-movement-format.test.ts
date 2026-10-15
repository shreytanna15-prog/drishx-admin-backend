import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEAD_POWERS_LOOKBACK_DAYS,
  DEFAULT_MOVEMENT_WINDOW_DAYS,
  aggregateSoldQtyByLens,
  classifyDeadPower,
  hasSufficientDeadHistory,
  netSoldQty,
  parseNonNegativeNumber,
  rollingDateKeys,
  selectPowerMovementRows,
  type PowerMovementRow,
} from "./power-movement-format";

const now = new Date("2026-10-14T12:00:00.000Z");
const oldIntroduced = new Date("2025-01-01T00:00:00.000Z");
const newIntroduced = new Date("2026-09-01T00:00:00.000Z");

const rows: PowerMovementRow[] = [
  {
    lensType: "SINGLE_VISION",
    lensId: "a",
    label: "A",
    power: "SPH 0",
    onHand: 10,
    soldQty: 0,
    introducedAt: oldIntroduced,
  },
  {
    lensType: "SINGLE_VISION",
    lensId: "b",
    label: "B",
    power: "SPH 1",
    onHand: 5,
    soldQty: 12,
    introducedAt: oldIntroduced,
  },
  {
    lensType: "SINGLE_VISION",
    lensId: "c",
    label: "C",
    power: "SPH 2",
    onHand: 3,
    soldQty: 2,
    introducedAt: oldIntroduced,
  },
  {
    lensType: "SINGLE_VISION",
    lensId: "d",
    label: "D",
    power: "SPH 3",
    onHand: 0,
    soldQty: 50,
    introducedAt: oldIntroduced,
  },
  {
    lensType: "SINGLE_VISION",
    lensId: "new",
    label: "New",
    power: "SPH 4",
    onHand: 8,
    soldQty: 0,
    introducedAt: newIntroduced,
  },
  {
    lensType: "SINGLE_VISION",
    lensId: "unk",
    label: "Unknown intro",
    power: "SPH 5",
    onHand: 4,
    soldQty: 0,
    introducedAt: null,
  },
];

describe("power movement format", () => {
  it("aggregates invoice line quantities by lens", () => {
    const map = aggregateSoldQtyByLens([
      { lensType: "SINGLE_VISION", lensId: "a", quantity: 2 },
      { lensType: "SINGLE_VISION", lensId: "a", quantity: 3 },
      { lensType: null, lensId: "x", quantity: 9 },
      { lensType: "SINGLE_VISION", lensId: null, quantity: 9 },
    ]);
    assert.equal(map.get("SINGLE_VISION::a"), 5);
    assert.equal(map.size, 1);
  });

  it("nets returns without going negative", () => {
    assert.equal(netSoldQty(10, 3), 7);
    assert.equal(netSoldQty(2, 5), 0);
    assert.equal(netSoldQty(0, 1), 0);
  });

  it("selects unsold as on-hand with zero sales in period", () => {
    const unsold = selectPowerMovementRows(rows, "unsold");
    assert.deepEqual(
      unsold.map((r) => r.lensId).toSorted(),
      ["a", "new", "unk"]
    );
  });

  it("classifies dead vs insufficient history for 180-day rule", () => {
    assert.equal(
      classifyDeadPower(rows[0], DEAD_POWERS_LOOKBACK_DAYS, now),
      "DEAD"
    );
    assert.equal(
      classifyDeadPower(rows[4], DEAD_POWERS_LOOKBACK_DAYS, now),
      "INSUFFICIENT_HISTORY"
    );
    assert.equal(
      classifyDeadPower(rows[5], DEAD_POWERS_LOOKBACK_DAYS, now),
      "INSUFFICIENT_HISTORY"
    );
    assert.equal(
      hasSufficientDeadHistory(newIntroduced, DEAD_POWERS_LOOKBACK_DAYS, now),
      false
    );
    assert.equal(
      hasSufficientDeadHistory(oldIntroduced, DEAD_POWERS_LOOKBACK_DAYS, now),
      true
    );

    const dead = selectPowerMovementRows(rows, "dead", undefined, { now });
    assert.equal(dead.find((r) => r.lensId === "a")?.eligibility, "DEAD");
    assert.equal(
      dead.find((r) => r.lensId === "new")?.eligibility,
      "INSUFFICIENT_HISTORY"
    );
    assert.ok(!dead.some((r) => r.lensId === "b"));
  });

  it("requires minUnits for fast and sorts by sold desc", () => {
    assert.throws(
      () => selectPowerMovementRows(rows, "fast", {}),
      /FAST_THRESHOLD_REQUIRED/
    );
    const fast = selectPowerMovementRows(rows, "fast", { minUnits: 10 });
    assert.deepEqual(
      fast.map((r) => r.lensId),
      ["d", "b"]
    );
  });

  it("slow requires positive sold qty and excludes zeros / out of stock", () => {
    assert.throws(
      () => selectPowerMovementRows(rows, "slow", {}),
      /SLOW_THRESHOLD_REQUIRED/
    );
    const slow = selectPowerMovementRows(rows, "slow", { maxUnits: 2 });
    assert.deepEqual(
      slow.map((r) => r.lensId),
      ["c"]
    );
    // Boundary: soldQty === maxUnits included
    const atMax = selectPowerMovementRows(rows, "slow", { maxUnits: 12 });
    assert.ok(atMax.some((r) => r.lensId === "b"));
    // Zero sales never slow
    assert.ok(!atMax.some((r) => r.soldQty === 0));
  });

  it("fast/slow threshold boundaries do not invent defaults", () => {
    assert.equal(parseNonNegativeNumber("0"), 0);
    assert.equal(parseNonNegativeNumber("12.5"), 12.5);
    assert.equal(parseNonNegativeNumber("-1"), null);
    assert.equal(parseNonNegativeNumber(""), null);
    assert.equal(parseNonNegativeNumber("abc"), null);
  });

  it("rolling window defaults to 90 inclusive calendar days", () => {
    assert.equal(DEFAULT_MOVEMENT_WINDOW_DAYS, 90);
    const { fromKey, toKey } = rollingDateKeys(90, now);
    assert.equal(toKey, "2026-10-14");
    assert.equal(fromKey, "2026-07-17");
  });
});
