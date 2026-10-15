import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  axesOverlap,
  buildMatrixPreview,
  countMatrixPowers,
  formatRangeLabel,
  generatePowerOptions,
  normalizeAxisBounds,
  rangesOverlap,
  suggestNonOverlappingBounds,
  toLensBandFields,
} from "./range-math";

describe("generatePowerOptions (0.25 steps)", () => {
  it("covers negative SPH inclusive bounds", () => {
    const opts = generatePowerOptions(0, -6);
    assert.equal(opts[0], 0);
    assert.equal(opts[opts.length - 1], -6);
    assert.ok(opts.includes(-0.25));
    assert.ok(opts.includes(-5.75));
    assert.equal(opts.length, 25); // 0 … -6 inclusive @ 0.25
  });

  it("covers positive SPH inclusive bounds", () => {
    const opts = generatePowerOptions(2, 4);
    assert.equal(opts[0], 2);
    assert.equal(opts[opts.length - 1], 4);
    assert.equal(opts.length, 9);
  });
});

describe("countMatrixPowers", () => {
  it("counts full -6×2 compound matrix excluding plano", () => {
    const range = {
      sph: normalizeAxisBounds(0, -6),
      cyl: normalizeAxisBounds(0, -2),
    };
    // SPH 0…-6 = 25, drop 0 → 24; CYL 0…-2 = 9, drop 0 → 8; 24*8 = 192
    assert.equal(countMatrixPowers(range), 192);
  });

  it("counts sph-only ranges without cyl", () => {
    const range = {
      sph: normalizeAxisBounds(0, -2),
      cyl: null,
    };
    assert.equal(countMatrixPowers(range), 9);
  });
});

describe("formatRangeLabel", () => {
  it("formats -6×2 style labels", () => {
    assert.equal(
      formatRangeLabel({
        sph: normalizeAxisBounds(0, -6),
        cyl: normalizeAxisBounds(0, -2),
      }),
      "-6×2"
    );
  });
});

describe("range overlap", () => {
  const minus6x2 = {
    sph: normalizeAxisBounds(0, -6),
    cyl: normalizeAxisBounds(0, -2),
  };
  const minus8x2Chained = {
    sph: normalizeAxisBounds(-6.25, -8),
    cyl: normalizeAxisBounds(0, -2),
  };
  const overlappingMinus8 = {
    sph: normalizeAxisBounds(-5, -8),
    cyl: normalizeAxisBounds(0, -2),
  };

  it("detects non-overlapping chained ranges", () => {
    assert.equal(rangesOverlap(minus6x2, minus8x2Chained), false);
  });

  it("detects overlapping ranges including shared boundary cells", () => {
    assert.equal(rangesOverlap(minus6x2, overlappingMinus8), true);
    // Shared exact boundary: end of A equals start of B on sph with same cyl
    assert.equal(
      axesOverlap(normalizeAxisBounds(0, -6), normalizeAxisBounds(-6, -8)),
      true
    );
  });

  it("allows genuinely separate cyl bands on same sph", () => {
    const cylBandA = {
      sph: normalizeAxisBounds(0, -6),
      cyl: normalizeAxisBounds(0, -2),
    };
    const cylBandB = {
      sph: normalizeAxisBounds(0, -6),
      cyl: normalizeAxisBounds(-2.25, -4),
    };
    assert.equal(rangesOverlap(cylBandA, cylBandB), false);
  });

  it("suggests chained sphStart after conflict", () => {
    const suggestion = suggestNonOverlappingBounds(
      overlappingMinus8,
      minus6x2,
      "-6×2"
    );
    assert.equal(suggestion.suggestedSphStart, -6.25);
    assert.ok(suggestion.message.includes("-6×2"));
    assert.ok(suggestion.suggestedBounds);
    assert.equal(
      rangesOverlap(suggestion.suggestedBounds!, minus6x2),
      false
    );
  });
});

describe("toLensBandFields + preview", () => {
  it("maps ends/starts to DB band fields", () => {
    const fields = toLensBandFields({
      sph: normalizeAxisBounds(0, -6),
      cyl: normalizeAxisBounds(0, -2),
    });
    assert.equal(fields.sph, -6);
    assert.equal(fields.sphStartRange, 0);
    assert.equal(fields.cyl, -2);
    assert.equal(fields.cylStartRange, 0);
  });

  it("builds preview with label and sample cells", () => {
    const preview = buildMatrixPreview({
      sph: normalizeAxisBounds(0, -1),
      cyl: normalizeAxisBounds(0, -0.5),
    });
    assert.equal(preview.label, "-1×0.5");
    assert.ok(preview.powerCount > 0);
    assert.ok(preview.sampleCells.length > 0);
  });
});
