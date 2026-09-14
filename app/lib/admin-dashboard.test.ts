import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDays,
  buildSeriesDays,
  getDashboardWindow,
  getIstYmd,
  parseDashboardRange,
  toMoney,
} from "./admin-dashboard";

describe("parseDashboardRange", () => {
  it("accepts today, 7d, 30d and defaults to 7d", () => {
    assert.equal(parseDashboardRange("today"), "today");
    assert.equal(parseDashboardRange("7d"), "7d");
    assert.equal(parseDashboardRange("30d"), "30d");
    assert.equal(parseDashboardRange("week"), "7d");
    assert.equal(parseDashboardRange(null), "7d");
  });
});

describe("getDashboardWindow", () => {
  // 2026-08-19 16:14 IST == 2026-08-19 10:44 UTC
  const now = new Date("2026-08-19T10:44:00.000Z");

  it("uses Asia/Kolkata calendar days", () => {
    assert.deepEqual(getIstYmd(now), { year: 2026, month: 8, day: 19 });
  });

  it("bounds today from IST midnight to next midnight", () => {
    const window = getDashboardWindow("today", now);
    assert.equal(window.rangeStart.toISOString(), "2026-08-18T18:30:00.000Z");
    assert.equal(window.rangeEnd.toISOString(), "2026-08-19T18:30:00.000Z");
  });

  it("uses 7 inclusive IST days for 7d", () => {
    const window = getDashboardWindow("7d", now);
    assert.equal(window.rangeStart.toISOString(), "2026-08-12T18:30:00.000Z");
    assert.equal(window.rangeEnd.toISOString(), "2026-08-19T18:30:00.000Z");
  });

  it("uses 30 inclusive IST days for 30d", () => {
    const window = getDashboardWindow("30d", now);
    assert.equal(window.rangeStart.toISOString(), "2026-07-20T18:30:00.000Z");
    assert.equal(window.rangeEnd.toISOString(), "2026-08-19T18:30:00.000Z");
  });

  it("builds seven series day keys ending today", () => {
    assert.deepEqual(buildSeriesDays({ year: 2026, month: 8, day: 19 }), [
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ]);
  });
});

describe("addCalendarDays", () => {
  it("crosses month boundaries", () => {
    assert.deepEqual(addCalendarDays({ year: 2026, month: 8, day: 1 }, -1), {
      year: 2026,
      month: 7,
      day: 31,
    });
  });
});

describe("toMoney", () => {
  it("coerces decimal-like values", () => {
    assert.equal(toMoney(null), 0);
    assert.equal(toMoney("12.50"), 12.5);
    assert.equal(toMoney({ toNumber: () => 9.25 }), 9.25);
  });
});
