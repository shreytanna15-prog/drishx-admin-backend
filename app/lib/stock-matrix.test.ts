import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  axisBand,
  buildProductMatrix,
  cellKey,
  cellState,
  compareBands,
  decodeProductKey,
  encodeProductKey,
  findRuleConflicts,
  formatPower,
  parseMatrixEdits,
  parseQuantityInput,
  validateMatrixQuantities,
  type MatrixLensRow,
  type MatrixRule,
} from "./stock-matrix";
import { calculateRequiredQuantity } from "./procurement-rules";

const rule = (min: number, target: number, extra: Partial<MatrixRule> = {}): MatrixRule => ({
  id: `r-${min}-${target}`,
  minStock: min,
  targetStock: target,
  autoProcure: true,
  isActive: true,
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...extra,
});

const lens = (overrides: Partial<MatrixLensRow>): MatrixLensRow => ({
  lensId: overrides.lensId ?? "l1",
  sph: -2,
  sphStartRange: null,
  cyl: null,
  cylStartRange: null,
  crossPower: null,
  add: null,
  axis: null,
  eye: null,
  onHand: 0,
  reserved: 0,
  onOrder: 0,
  openPurchaseOrder: null,
  rule: null,
  ...overrides,
});

describe("power formatting and bands (SPH/CYL signs)", () => {
  it("formats signed powers with two decimals", () => {
    assert.equal(formatPower(-2), "-2.00");
    assert.equal(formatPower(4.25), "+4.25");
    assert.equal(formatPower(0), "0.00");
    assert.equal(formatPower(-0.1), "0.00");
    assert.equal(formatPower(-0.76), "-0.75");
  });

  it("treats a null start as plano and labels ranges / single powers", () => {
    assert.equal(axisBand(null, -6, "s").label, "0.00 to -6.00");
    assert.equal(axisBand(-6.25, -8, "s").label, "-6.25 to -8.00");
    assert.equal(axisBand(-1.25, -1.25, "s").label, "-1.25");
    assert.equal(axisBand(4.25, 6, "s").label, "+4.25 to +6.00");
    assert.equal(axisBand(null, null, "c").label, "—");
  });

  it("orders minus bands outward from plano, then plus bands outward", () => {
    const bands = [
      axisBand(4.25, 6, "s"),
      axisBand(-6.25, -8, "s"),
      axisBand(null, 4, "s"),
      axisBand(null, -6, "s"),
    ];
    assert.deepEqual([...bands].sort(compareBands).map((b) => b.label), [
      "0.00 to -6.00",
      "-6.25 to -8.00",
      "0.00 to +4.00",
      "+4.25 to +6.00",
    ]);
    // Single-power leaves (true per-power matrix).
    const singles = [1.25, -2, 0.25, -0.25, 0, -0.75].map((v) => axisBand(v, v, "s"));
    assert.deepEqual([...singles].sort(compareBands).map((b) => b.label), [
      "0.00",
      "-0.25",
      "-0.75",
      "-2.00",
      "+0.25",
      "+1.25",
    ]);
  });

  it("keeps -0.50 and +0.50 as distinct powers", () => {
    assert.notEqual(axisBand(-0.5, -0.5, "s").key, axisBand(0.5, 0.5, "s").key);
  });
});

describe("cell state — missing rule vs zero-valued rule", () => {
  it("no rule is NO_RULE even when stock is zero", () => {
    assert.equal(cellState({ rule: null, available: 0 }), "NO_RULE");
  });
  it("a 0/5 rule with zero available is below threshold (engine: available ≤ min)", () => {
    assert.equal(cellState({ rule: rule(0, 5), available: 0 }), "BELOW_THRESHOLD");
    assert.equal(cellState({ rule: rule(0, 5), available: 1 }), "OK");
  });
  it("paused / inactive rules are flagged, not highlighted", () => {
    assert.equal(cellState({ rule: rule(3, 10, { autoProcure: false }), available: 0 }), "INACTIVE");
    assert.equal(cellState({ rule: rule(3, 10, { isActive: false }), available: 0 }), "INACTIVE");
  });
});

describe("buildProductMatrix", () => {
  it("places each leaf at its SPH × CYL band using lensId identity", () => {
    const m = buildProductMatrix([
      lens({ lensId: "a", sph: -6, cyl: -2, onHand: 5, rule: rule(3, 10) }),
      lens({ lensId: "b", sph: -8, sphStartRange: -6.25, cyl: -2, onHand: 1, reserved: 1, rule: rule(2, 6) }),
      lens({ lensId: "c", sph: -6, cyl: -4, cylStartRange: -2.25, onHand: 0 }),
    ]);
    assert.equal(m.sections.length, 1);
    const section = m.sections[0]!;
    assert.deepEqual(section.sphBands.map((b) => b.label), ["0.00 to -6.00", "-6.25 to -8.00"]);
    assert.deepEqual(section.cylBands.map((b) => b.label), ["0.00 to -2.00", "-2.25 to -4.00"]);
    const cellB = section.cells[cellKey(section.sphBands[1]!.key, section.cylBands[0]!.key)]!;
    assert.equal(cellB[0]!.lensId, "b");
    assert.equal(cellB[0]!.available, 0);
    assert.equal(cellB[0]!.state, "BELOW_THRESHOLD");
    assert.equal(m.totals.leaves, 3);
    assert.equal(m.totals.onHand, 6);
    assert.equal(m.totals.withRule, 2);
    assert.equal(m.totals.belowThreshold, 1);
    assert.equal(m.totals.overlappingCells, 0);
  });

  it("splits Kryptok/Progressive variants into sections and handles cross powers", () => {
    const m = buildProductMatrix([
      lens({ lensId: "k1", sph: 2, cyl: null, add: 2.5, axis: 90 }),
      lens({ lensId: "k2", sph: 2, cyl: null, add: 3, axis: 90 }),
      lens({ lensId: "x", sph: null, crossPower: -2 }),
    ]);
    assert.equal(m.sections.length, 3);
    const labels = m.sections.map((s) => s.label);
    assert.ok(labels.includes("ADD +2.50 · Axis 90°"));
    const cross = m.sections.find((s) => s.label === null)!;
    assert.equal(cross.cylBands[0]!.label, "Cross -2.00");
  });

  it("reports overlapping leaves in one grid position instead of hiding them", () => {
    const m = buildProductMatrix([
      lens({ lensId: "a", sph: -2 }),
      lens({ lensId: "b", sph: -2 }),
    ]);
    assert.equal(m.totals.overlappingCells, 1);
    const only = Object.values(m.sections[0]!.cells)[0]!;
    assert.deepEqual(only.map((c) => c.lensId), ["a", "b"]);
  });
});

describe("matrix edit validation", () => {
  it("parses quantity inputs strictly", () => {
    assert.deepEqual(parseQuantityInput(""), { value: null, error: null });
    assert.deepEqual(parseQuantityInput(" 7 "), { value: 7, error: null });
    assert.equal(parseQuantityInput("-1").error, "Whole number ≥ 0");
    assert.equal(parseQuantityInput("2.5").error, "Whole number ≥ 0");
    assert.equal(parseQuantityInput("1e3").error, "Whole number ≥ 0");
    assert.equal(parseQuantityInput("9999999").error, "Too large");
  });

  it("requires target > threshold (same rule as ReorderRule)", () => {
    assert.equal(validateMatrixQuantities(0, 1), null);
    assert.match(validateMatrixQuantities(5, 5)!, /greater/);
    assert.match(validateMatrixQuantities(null, 5)!, /threshold/);
    assert.match(validateMatrixQuantities(2, null)!, /target/);
  });

  it("server parse rejects bad payloads and reports per-cell errors", () => {
    assert.equal(parseMatrixEdits([]).ok, false);
    assert.equal(parseMatrixEdits("x").ok, false);
    const dup = parseMatrixEdits([
      { lensId: "a", minStock: 1, targetStock: 2 },
      { lensId: "a", minStock: 1, targetStock: 3 },
    ]);
    assert.equal(dup.ok, false);
    const bad = parseMatrixEdits([
      { lensId: "a", minStock: 4, targetStock: 2 },
      { lensId: "b", minStock: "1", targetStock: 3 },
    ]);
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.ok(bad.cellErrors?.a);
      assert.ok(bad.cellErrors?.b);
    }
    const good = parseMatrixEdits([
      { lensId: "a", minStock: 0, targetStock: 4, expectedUpdatedAt: null },
    ]);
    assert.equal(good.ok, true);
    const tooMany = parseMatrixEdits(
      Array.from({ length: 501 }, (_, i) => ({ lensId: `l${i}`, minStock: 1, targetStock: 2 }))
    );
    assert.equal(tooMany.ok, false);
  });

  it("detects concurrent rule changes (optimistic concurrency)", () => {
    const current = new Map<string, { updatedAt: string } | null>([
      ["a", { updatedAt: "t1" }],
      ["b", null],
      ["c", { updatedAt: "t2" }],
    ]);
    const conflicts = findRuleConflicts(
      [
        { lensId: "a", minStock: 1, targetStock: 2, expectedUpdatedAt: "t1" },
        { lensId: "b", minStock: 1, targetStock: 2, expectedUpdatedAt: null },
        { lensId: "c", minStock: 1, targetStock: 2, expectedUpdatedAt: "old" },
        { lensId: "d", minStock: 1, targetStock: 2, expectedUpdatedAt: "t9" },
      ],
      current
    );
    assert.deepEqual(conflicts, ["c", "d"]);
  });
});

describe("reorder calculation after a matrix rule change", () => {
  it("required quantity follows the new target and still subtracts incoming", () => {
    // Old rule 3/10 → new rule 3/20; available 2, incoming 4 on an open PO.
    assert.equal(calculateRequiredQuantity({ available: 2, targetStock: 10, incoming: 4, moq: null }), 4);
    assert.equal(calculateRequiredQuantity({ available: 2, targetStock: 20, incoming: 4, moq: null }), 14);
    assert.equal(calculateRequiredQuantity({ available: 2, targetStock: 6, incoming: 4, moq: null }), 0);
  });
});

describe("product key encoding", () => {
  it("round-trips and rejects tampered keys", () => {
    const key = { lensType: "SINGLE_VISION", brand: "ASH", item: null, index: 1.6, coating: "GREEN" };
    assert.deepEqual(decodeProductKey(encodeProductKey(key)), key);
    assert.equal(decodeProductKey("not-base64-json"), null);
    assert.equal(
      decodeProductKey(Buffer.from(JSON.stringify({ brand: { $ne: 1 } })).toString("base64url")),
      null
    );
  });
});
