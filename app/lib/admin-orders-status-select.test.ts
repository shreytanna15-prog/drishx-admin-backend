/**
 * Admin order detail status select — current status first; no accidental default
 * to the first transition (ORD238170 / AWAITING_PROCUREMENT regression).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildAdminStatusSelectOptions,
  getStaffStatusOptions,
  isAdminStatusChangeSelected,
} from "./admin-orders";
import { canTransitionStatus } from "./order-status-transitions";

describe("buildAdminStatusSelectOptions", () => {
  it("puts AWAITING_PROCUREMENT first (not PARTIALLY_FULFILLED)", () => {
    const options = buildAdminStatusSelectOptions("AWAITING_PROCUREMENT");
    assert.equal(options[0], "AWAITING_PROCUREMENT");
    assert.ok(options.includes("PARTIALLY_FULFILLED"));
    assert.deepEqual(options.slice(1), getStaffStatusOptions("AWAITING_PROCUREMENT"));
  });

  it("dedupes when current already appears in transitions", () => {
    // Transitions never include current today; still guarantee uniqueness.
    const options = buildAdminStatusSelectOptions("PENDING");
    assert.equal(options[0], "PENDING");
    assert.equal(new Set(options).size, options.length);
    assert.deepEqual(options, ["PENDING", "PICKING", "CANCELLED"]);
  });

  it("terminal statuses only list themselves", () => {
    assert.deepEqual(buildAdminStatusSelectOptions("COMPLETED"), ["COMPLETED"]);
    assert.deepEqual(buildAdminStatusSelectOptions("CANCELLED"), ["CANCELLED"]);
  });
});

describe("isAdminStatusChangeSelected", () => {
  it("blocks unchanged selection (no accidental update)", () => {
    assert.equal(
      isAdminStatusChangeSelected("AWAITING_PROCUREMENT", "AWAITING_PROCUREMENT"),
      false
    );
  });

  it("allows a real transition selection", () => {
    assert.equal(
      isAdminStatusChangeSelected("AWAITING_PROCUREMENT", "PARTIALLY_FULFILLED"),
      true
    );
  });
});

describe("status update still allowed by backend transition rules", () => {
  it("AWAITING_PROCUREMENT → PARTIALLY_FULFILLED remains valid", () => {
    assert.equal(
      canTransitionStatus("AWAITING_PROCUREMENT", "PARTIALLY_FULFILLED"),
      true
    );
  });

  it("same-status is a backend no-op (allowed)", () => {
    assert.equal(
      canTransitionStatus("AWAITING_PROCUREMENT", "AWAITING_PROCUREMENT"),
      true
    );
  });

  it("illegal jump stays rejected", () => {
    assert.equal(canTransitionStatus("PENDING", "COMPLETED"), false);
  });
});

describe("admin-order-control-panel wiring", () => {
  it("defaults/syncs to order.status and disables unchanged update", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin-order-control-panel.tsx"),
      "utf8"
    );
    assert.match(src, /buildAdminStatusSelectOptions/);
    assert.match(src, /isAdminStatusChangeSelected/);
    assert.match(src, /useState\(order\.status\)/);
    assert.match(src, /setNextStatus\(order\.status\)/);
    assert.equal(src.includes("getStaffStatusOptions(order.status)[0]"), false);
  });
});
