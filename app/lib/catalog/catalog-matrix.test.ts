import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCatalogMatrix,
  classifyVariantPowerShape,
  compareOpticalPowers,
  formatMatrixPower,
  type CatalogMatrixVariantInput,
} from "./catalog-matrix";

function v(
  partial: Partial<CatalogMatrixVariantInput> & { id: string }
): CatalogMatrixVariantInput {
  return {
    sphMin: 0,
    sphMax: 0,
    cylMin: 0,
    cylMax: 0,
    axis: null,
    eye: null,
    add: null,
    ...partial,
  };
}

const KT = {
  supportsAdd: true,
  supportsAxis: true,
  supportsEye: false,
} as const;
const V2 = {
  supportsAdd: true,
  supportsAxis: true,
  supportsEye: true,
} as const;
const SV = {
  supportsAdd: false,
  supportsAxis: false,
  supportsEye: false,
} as const;

describe("catalog-matrix helpers", () => {
  it("formats signed powers", () => {
    assert.equal(formatMatrixPower(0), "0.00");
    assert.equal(formatMatrixPower(1.25), "+1.25");
    assert.equal(formatMatrixPower(-2), "-2.00");
  });

  it("orders optical powers plano, minus outward, then plus", () => {
    const sorted = [2, -1, 0, -2, 0.25].sort(compareOpticalPowers);
    assert.deepEqual(sorted, [0, -1, -2, 0.25, 2]);
  });

  it("classifies power shapes from ranges", () => {
    assert.equal(
      classifyVariantPowerShape({
        sphMin: -2,
        sphMax: -1,
        cylMin: 0,
        cylMax: 0,
      }),
      "sphere"
    );
    assert.equal(
      classifyVariantPowerShape({
        sphMin: 0,
        sphMax: 0,
        cylMin: -2,
        cylMax: -0.25,
      }),
      "cyl-axis"
    );
    assert.equal(
      classifyVariantPowerShape({
        sphMin: -2,
        sphMax: -1,
        cylMin: -1,
        cylMax: -0.25,
      }),
      "compound"
    );
  });
});

describe("buildCatalogMatrix SV", () => {
  it("builds SPH rows with CYL data columns and no ADD/Axis stubs", () => {
    const model = buildCatalogMatrix(
      [
        v({
          id: "sv1",
          sphMin: -0.25,
          sphMax: 0,
          cylMin: 0,
          cylMax: -0.25,
        }),
      ],
      SV
    );
    assert.equal(model.sheets.length, 1);
    const sheet = model.sheets[0]!;
    assert.equal(sheet.kind, "sph-cyl");
    assert.equal(sheet.dataAxis, "cyl");
    assert.deepEqual(
      sheet.stubColumns.map((c) => c.key),
      ["sph"]
    );
    assert.ok(sheet.rows.some((r) => r.stub.sph === "0.00"));
    assert.ok(sheet.dataColumns.some((c) => c.label === "-0.25"));

    const cell = sheet.cells["sph:0.00"]!["cyl:-0.25"]!;
    assert.equal(cell.present, true);
    assert.equal(cell.variantId, "sv1");
    assert.deepEqual(cell.cellKey, {
      sph: 0,
      cyl: -0.25,
      add: null,
      axis: null,
      eye: null,
    });
  });
});

describe("buildCatalogMatrix KT", () => {
  it("stacks Sphere / Cyl+Axis / Compound / Cross with separate stub columns", () => {
    const model = buildCatalogMatrix(
      [
        v({
          id: "kt-sph",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 1,
        }),
        v({
          id: "kt-sph-2",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 2,
        }),
        v({
          id: "kt-cyl",
          sphMin: 0,
          sphMax: 0,
          cylMin: -1,
          cylMax: -1,
          axis: 90,
          add: 1,
        }),
        v({
          id: "kt-comp",
          sphMin: -1,
          sphMax: -1,
          cylMin: -1,
          cylMax: -1,
          axis: 90,
          add: 1,
        }),
        v({
          id: "kt-cross",
          sphMin: 0.5,
          sphMax: 0.5,
          cylMin: -2,
          cylMax: -2,
          axis: 180,
          add: 1,
        }),
      ],
      KT,
      { familyLabel: "KRYPTOK" }
    );

    assert.deepEqual(
      model.sheets.map((s) => s.kind),
      ["sphere", "cyl-axis", "compound", "cross"]
    );

    const sphere = model.sheets.find((s) => s.kind === "sphere")!;
    assert.deepEqual(
      sphere.stubColumns.map((c) => c.key),
      ["sph"]
    );
    assert.deepEqual(
      sphere.dataColumns.map((c) => c.label),
      ["ADD +1.00", "ADD +2.00"]
    );
    assert.match(sphere.title, /KRYPTOK/);
    assert.equal(
      sphere.cells["sph:-1.00"]!["add:1.00"]!.variantId,
      "kt-sph"
    );

    const cylAxis = model.sheets.find((s) => s.kind === "cyl-axis")!;
    assert.deepEqual(
      cylAxis.stubColumns.map((c) => c.key),
      ["cyl", "axis"]
    );
    assert.equal(
      cylAxis.cells["cyl:-1.00|axis:90"]!["add:1.00"]!.variantId,
      "kt-cyl"
    );

    const compound = model.sheets.find((s) => s.kind === "compound")!;
    assert.deepEqual(
      compound.stubColumns.map((c) => c.key),
      ["sph", "cyl", "axis"]
    );
    assert.equal(
      compound.cells["sph:-1.00|cyl:-1.00|axis:90"]!["add:1.00"]!.variantId,
      "kt-comp"
    );

    const cross = model.sheets.find((s) => s.kind === "cross")!;
    assert.equal(
      cross.cells["sph:0.50|cyl:-2.00|axis:180"]!["add:1.00"]!.variantId,
      "kt-cross"
    );
    assert.equal(cross.cells["sph:-1.00|cyl:-1.00|axis:90"], undefined);
  });

  it("omits the Axis stub when the sheet has no axis", () => {
    const model = buildCatalogMatrix(
      [v({ id: "plain", sphMin: 0, sphMax: 0, cylMin: -1, cylMax: -1 })],
      KT
    );
    const sheet = model.sheets.find((s) => s.kind === "cyl-axis")!;
    assert.deepEqual(
      sheet.stubColumns.map((c) => c.key),
      ["cyl"]
    );
  });

  it("stacks axis blocks largest-first (180 then 90)", () => {
    const model = buildCatalogMatrix(
      [
        v({
          id: "a90",
          sphMin: 0,
          sphMax: 0,
          cylMin: -1,
          cylMax: -1,
          axis: 90,
        }),
        v({
          id: "a180",
          sphMin: 0,
          sphMax: 0,
          cylMin: -1,
          cylMax: -1,
          axis: 180,
        }),
      ],
      KT
    );
    const axes = model.sheets
      .filter((s) => s.kind === "cyl-axis")
      .map((s) => s.rows[0]!.stub.axis);
    assert.deepEqual(axes, ["180", "90"]);
  });

  it("groups 135° and 45° in one sheet without merging their cells", () => {
    const variants = [135, 45].flatMap((axis) => [
      v({ id: `cyl-${axis}`, sphMin: 0, sphMax: 0, cylMin: -1, cylMax: -1, axis, add: 1 }),
      v({ id: `comp-${axis}`, sphMin: -1, sphMax: -1, cylMin: -1, cylMax: -1, axis, add: 1 }),
    ]);
    const model = buildCatalogMatrix(variants, KT);
    const cylinders = model.sheets.filter((s) => s.kind === "cyl-axis");
    const compounds = model.sheets.filter((s) => s.kind === "compound");

    assert.equal(cylinders.length, 1);
    assert.equal(compounds.length, 1);
    assert.match(cylinders[0]!.title, /135° \/ 45°/);
    assert.deepEqual(cylinders[0]!.rows.map((r) => r.stub.axis), ["135", "45"]);
    for (const axis of [135, 45]) {
      const cylCell = cylinders[0]!.cells[`cyl:-1.00|axis:${axis}`]!["add:1.00"]!;
      const compCell = compounds[0]!.cells[`sph:-1.00|cyl:-1.00|axis:${axis}`]!["add:1.00"]!;
      assert.equal(cylCell.variantId, `cyl-${axis}`);
      assert.equal(cylCell.cellKey.axis, axis);
      assert.equal(compCell.variantId, `comp-${axis}`);
      assert.equal(compCell.cellKey.axis, axis);
    }
  });
});

describe("buildCatalogMatrix V2", () => {
  it("renders RE block then LE block for each ADD", () => {
    const model = buildCatalogMatrix(
      [
        v({
          id: "v2-re",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 1.5,
          eye: "RIGHT",
        }),
        v({
          id: "v2-le",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 1.5,
          eye: "LEFT",
        }),
      ],
      V2
    );
    const sphere = model.sheets.find((s) => s.kind === "sphere")!;
    assert.deepEqual(
      sphere.dataColumns.map((c) => c.label),
      ["RE +1.50", "LE +1.50"]
    );
    assert.equal(
      sphere.cells["sph:-1.00"]!["eye:RE|add:1.50"]!.variantId,
      "v2-re"
    );
    assert.equal(
      sphere.cells["sph:-1.00"]!["eye:LE|add:1.50"]!.variantId,
      "v2-le"
    );
    assert.equal(
      sphere.cells["sph:-1.00"]!["eye:LE|add:1.50"]!.cellKey.eye,
      "LEFT"
    );
  });

  it("gives each eye an ADD block (3 ADDs → 6 columns)", () => {
    const model = buildCatalogMatrix(
      [
        v({
          id: "re1",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 1,
          eye: "RIGHT",
        }),
        v({
          id: "re2",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 2,
          eye: "RIGHT",
        }),
        v({
          id: "re3",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 3,
          eye: "RIGHT",
        }),
        v({
          id: "le1",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 1,
          eye: "LEFT",
        }),
        v({
          id: "le2",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 2,
          eye: "LEFT",
        }),
        v({
          id: "le3",
          sphMin: -1,
          sphMax: -1,
          cylMin: 0,
          cylMax: 0,
          add: 3,
          eye: "LEFT",
        }),
      ],
      V2
    );
    const sphere = model.sheets.find((s) => s.kind === "sphere")!;
    assert.deepEqual(
      sphere.dataColumns.map((c) => c.label),
      [
        "RE +1.00",
        "RE +2.00",
        "RE +3.00",
        "LE +1.00",
        "LE +2.00",
        "LE +3.00",
      ]
    );
  });
});
