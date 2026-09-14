import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATALOG_POWER_MAX_DISTANCE,
  compareCatalogPowerScores,
  formatPowerQueryLabel,
  powerInSelectableRange,
  resolvePowerMatchMeta,
  scoreCatalogPowerMatch,
} from "./catalog-power-search";
import { parseLensSearchTerm } from "./lens-search";
import { powerDistance } from "./power-distance";
import { resolveWholesaleShopSearch } from "./wholesale-shop-search";

describe("parseLensSearchTerm", () => {
  it("parses SPH/CYL pairs like -0.25/-0.25", () => {
    const parsed = parseLensSearchTerm("-0.25/-0.25");
    assert.deepEqual(parsed.sphCylPair, { sph: -0.25, cyl: -0.25 });
    assert.equal(parsed.singleNumber, null);
    assert.equal(parsed.remainingText, "");
  });

  it("parses 0/-0.25 with null-safe cyl", () => {
    const parsed = parseLensSearchTerm("0/-0.25");
    assert.deepEqual(parsed.sphCylPair, { sph: 0, cyl: -0.25 });
  });

  it("parses missing cyl as null", () => {
    const parsed = parseLensSearchTerm("-1.00/-");
    assert.deepEqual(parsed.sphCylPair, { sph: -1, cyl: null });
  });

  it("treats a whole-string number as singleNumber", () => {
    const parsed = parseLensSearchTerm("2");
    assert.equal(parsed.sphCylPair, null);
    assert.equal(parsed.singleNumber, 2);
  });

  it("keeps free text for coating/item search", () => {
    const parsed = parseLensSearchTerm("blue cut");
    assert.equal(parsed.sphCylPair, null);
    assert.equal(parsed.remainingText, "blue cut");
  });
});

describe("category shortcuts", () => {
  it("maps sv to SINGLE_VISION", () => {
    const result = resolveWholesaleShopSearch("sv", "ALL");
    assert.deepEqual(result.lensTypes, ["SINGLE_VISION"]);
    assert.equal(result.remainingText, "");
  });

  it("maps kt to KRYPTOK", () => {
    const result = resolveWholesaleShopSearch("kt", "ALL");
    assert.deepEqual(result.lensTypes, ["KRYPTOK"]);
  });

  it("maps v2 to PROGRESSIVE", () => {
    const result = resolveWholesaleShopSearch("v2", "ALL");
    assert.deepEqual(result.lensTypes, ["PROGRESSIVE"]);
  });
});

describe("powerDistance", () => {
  it("sums absolute sph and cyl deltas", () => {
    assert.equal(
      powerDistance({ sph: -0.25, cyl: -0.25 }, { sph: 0, cyl: 0 }),
      0.5
    );
  });
});

describe("scoreCatalogPowerMatch", () => {
  const target = { sph: -0.25, cyl: -0.25 };

  it("scores exact endpoint as exact/0", () => {
    const score = scoreCatalogPowerMatch(
      {
        id: "1",
        sph: -0.25,
        cyl: -0.25,
        price: 100,
      },
      target
    );
    assert.deepEqual(score, { distance: 0, mode: "exact" });
  });

  it("scores selectable range coverage as range/0", () => {
    const score = scoreCatalogPowerMatch(
      {
        id: "2",
        sph: -2,
        sphStartRange: 0,
        cyl: -2,
        cylStartRange: 0,
        price: 100,
      },
      target
    );
    assert.deepEqual(score, { distance: 0, mode: "range" });
  });

  it("scores nearby endpoints as nearest within max distance", () => {
    const score = scoreCatalogPowerMatch(
      {
        id: "3",
        sph: 0,
        cyl: 0,
        price: 100,
      },
      target
    );
    assert.ok(score);
    assert.equal(score!.mode, "nearest");
    assert.equal(score!.distance, 0.5);
  });

  it("excludes powers beyond max distance that are not in range", () => {
    const score = scoreCatalogPowerMatch(
      {
        id: "4",
        sph: -2,
        sphStartRange: -2,
        cyl: -2,
        cylStartRange: -2,
        price: 100,
      },
      target,
      CATALOG_POWER_MAX_DISTANCE
    );
    assert.equal(score, null);
  });

  it("detects range coverage with powerInSelectableRange", () => {
    assert.equal(
      powerInSelectableRange(
        {
          id: "5",
          sph: -1,
          sphStartRange: 0,
          cyl: -0.5,
          cylStartRange: 0,
          price: 50,
        },
        { sph: -0.25, cyl: -0.25 }
      ),
      true
    );
  });
});

describe("compareCatalogPowerScores / resolvePowerMatchMeta", () => {
  it("orders exact before range before nearest at equal distance", () => {
    const ranked = [
      { distance: 0, mode: "nearest" as const },
      { distance: 0, mode: "exact" as const },
      { distance: 0, mode: "range" as const },
    ].sort(compareCatalogPowerScores);
    assert.deepEqual(
      ranked.map((s) => s.mode),
      ["exact", "range", "nearest"]
    );
  });

  it("resolves meta mode from scored set", () => {
    const target = { sph: -0.25, cyl: -0.25 };
    assert.equal(
      resolvePowerMatchMeta([{ distance: 0, mode: "exact" }], target)?.mode,
      "exact"
    );
    assert.equal(
      resolvePowerMatchMeta([{ distance: 0, mode: "range" }], target)?.mode,
      "range"
    );
    assert.equal(
      resolvePowerMatchMeta([{ distance: 0.25, mode: "nearest" }], target)?.mode,
      "nearest"
    );
    assert.equal(resolvePowerMatchMeta([], target), null);
  });

  it("formats power query labels", () => {
    assert.equal(formatPowerQueryLabel({ sph: -0.25, cyl: -0.25 }), "-0.25/-0.25");
    assert.equal(formatPowerQueryLabel({ sph: 0, cyl: null }), "0/—");
  });
});
