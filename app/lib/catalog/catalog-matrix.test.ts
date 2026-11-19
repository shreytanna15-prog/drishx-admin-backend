import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCatalogMatrix,
  classifyVariantPowerShape,
  comparePowerMagnitude,
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

  it("orders powers by absolute magnitude (sign ignored for ranking)", () => {
    const sorted = [2, -1, 0, -2, 0.25].toSorted(comparePowerMagnitude);
    // abs: 0 < 0.25 < 1 < 2; same abs → signed order (−2 before +2)
    assert.deepEqual(sorted, [0, 0.25, -1, -2, 2]);
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
    assert.equal(cell.allowed, true);
    assert.equal(cell.variantId, "sv1");
    assert.deepEqual(cell.cellKey, {
      sph: 0,
      cyl: -0.25,
      add: null,
      axis: null,
      eye: null,
    });
  });

  it("SV SPH×CYL disables invalid cross-quadrant cells (Style B)", () => {
    const model = buildCatalogMatrix(
      [
        v({
          id: "sv-cross-band",
          sphMin: 0.25,
          sphMax: 1.0,
          cylMin: -0.5,
          cylMax: -2,
        }),
      ],
      SV
    );
    const sheet = model.sheets[0]!;
    assert.equal(sheet.kind, "sph-cyl");

    const ok = sheet.cells["sph:0.50"]!["cyl:-2.00"]!;
    assert.equal(ok.allowed, true);
    assert.equal(ok.present, true);

    const blocked = sheet.cells["sph:0.50"]!["cyl:-0.50"]!;
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.present, false);
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
    assert.equal(
      cross.cells["sph:0.50|cyl:-2.00|axis:180"]!["add:1.00"]!.allowed,
      true
    );
    assert.equal(cross.cells["sph:-1.00|cyl:-1.00|axis:90"], undefined);
  });

  it("Cross Style B keeps gap-fail cells as allowed:false (disabled triad)", () => {
    // CROSS −2 warehouse sketch: SPH +0.25…+1.75 × CYL −0.50…−2.00
    const model = buildCatalogMatrix(
      [
        v({
          id: "kt-cross-band",
          sphMin: 0.25,
          sphMax: 1.75,
          cylMin: -0.5,
          cylMax: -2,
          axis: 180,
          add: 1,
        }),
      ],
      KT,
      { familyLabel: "KRYPTOK" }
    );

    const cross = model.sheets.find((s) => s.kind === "cross")!;
    assert.ok(cross);

    // Valid: |−2| − 0.50 = 1.50 ≥ 0.25
    const ok = cross.cells["sph:0.50|cyl:-2.00|axis:180"]!["add:1.00"]!;
    assert.equal(ok.allowed, true);
    assert.equal(ok.present, true);
    assert.equal(ok.variantId, "kt-cross-band");

    // Invalid: |−0.50| − 0.50 = 0 < 0.25 → disabled, no triad
    const blocked = cross.cells["sph:0.50|cyl:-0.50|axis:180"]!["add:1.00"]!;
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.present, false);
    assert.equal(blocked.variantId, null);

    // Edge valid: |−2| − 1.75 = 0.25
    const edge = cross.cells["sph:1.75|cyl:-2.00|axis:180"]!["add:1.00"]!;
    assert.equal(edge.allowed, true);
    assert.equal(edge.present, true);

    // Edge invalid: |−1.75| − 1.75 = 0
    const edgeBad = cross.cells["sph:1.75|cyl:-1.75|axis:180"]!["add:1.00"]!;
    assert.equal(edgeBad.allowed, false);
    assert.equal(edgeBad.present, false);

    // Pure cross band → no Compound sheet (quadrant owned by Cross only).
    assert.equal(
      model.sheets.find((s) => s.kind === "compound"),
      undefined
    );
  });

  it("KT Compound excludes the whole +SPH/−CYL quadrant (cross owns Style B)", () => {
    const model = buildCatalogMatrix(
      [
        v({
          id: "mixed",
          // Includes -- compound and +/− cross territory in one range band.
          sphMin: -1,
          sphMax: 1,
          cylMin: -1,
          cylMax: -0.25,
          axis: 90,
          add: 1,
        }),
      ],
      KT
    );

    const compound = model.sheets.find((s) => s.kind === "compound")!;
    const cross = model.sheets.find((s) => s.kind === "cross")!;
    assert.ok(compound);
    assert.ok(cross);

    // Valid -- compound cell stays on Compound.
    assert.equal(
      compound.cells["sph:-1.00|cyl:-1.00|axis:90"]!["add:1.00"]!.present,
      true
    );

    // Cross quadrant (even gap-fail) is absent from Compound.
    assert.equal(compound.cells["sph:0.50|cyl:-0.25|axis:90"], undefined);
    assert.equal(compound.cells["sph:0.50|cyl:-1.00|axis:90"], undefined);

    // Same cells live on Cross with Style B.
    assert.equal(
      cross.cells["sph:0.50|cyl:-0.25|axis:90"]!["add:1.00"]!.allowed,
      false
    );
    assert.equal(
      cross.cells["sph:0.50|cyl:-1.00|axis:90"]!["add:1.00"]!.allowed,
      true
    );
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

  it("gives 135° and 45° separate sheets (no shared oblique sheet)", () => {
    const variants = [135, 45].flatMap((axis) => [
      v({ id: `cyl-${axis}`, sphMin: 0, sphMax: 0, cylMin: -1, cylMax: -1, axis, add: 1 }),
      v({ id: `comp-${axis}`, sphMin: -1, sphMax: -1, cylMin: -1, cylMax: -1, axis, add: 1 }),
    ]);
    const model = buildCatalogMatrix(variants, KT);
    const cylinders = model.sheets.filter((s) => s.kind === "cyl-axis");
    const compounds = model.sheets.filter((s) => s.kind === "compound");

    assert.equal(cylinders.length, 2);
    assert.equal(compounds.length, 2);
    assert.deepEqual(
      cylinders.map((s) => s.rows[0]!.stub.axis),
      ["135", "45"]
    );
    for (const axis of [135, 45]) {
      const cylSheet = cylinders.find((s) => s.rows[0]!.stub.axis === String(axis))!;
      const compSheet = compounds.find((s) =>
        s.rows.some((r) => r.stub.axis === String(axis))
      )!;
      assert.equal(
        cylSheet.cells[`cyl:-1.00|axis:${axis}`]!["add:1.00"]!.variantId,
        `cyl-${axis}`
      );
      assert.equal(
        compSheet.cells[`sph:-1.00|cyl:-1.00|axis:${axis}`]!["add:1.00"]!.variantId,
        `comp-${axis}`
      );
    }
  });

  it("orders Compound/Cross rows CYL-first by magnitude then SPH", () => {
    const model = buildCatalogMatrix(
      [
        v({
          id: "comp",
          sphMin: -1,
          sphMax: -0.25,
          cylMin: -1,
          cylMax: -0.25,
          axis: 90,
          add: 1,
        }),
      ],
      KT
    );
    const compound = model.sheets.find((s) => s.kind === "compound")!;
    const stubPairs = compound.rows.map((r) => `${r.stub.cyl}|${r.stub.sph}`);
    assert.deepEqual(stubPairs, [
      "-0.25|-0.25",
      "-0.25|-0.50",
      "-0.25|-0.75",
      "-0.25|-1.00",
      "-0.50|-0.25",
      "-0.50|-0.50",
      "-0.50|-0.75",
      "-0.50|-1.00",
      "-0.75|-0.25",
      "-0.75|-0.50",
      "-0.75|-0.75",
      "-0.75|-1.00",
      "-1.00|-0.25",
      "-1.00|-0.50",
      "-1.00|-0.75",
      "-1.00|-1.00",
    ]);
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
