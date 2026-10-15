import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalogIdentityKey } from "./product-identity";

describe("buildCatalogIdentityKey", () => {
  it("builds stable SV keys", () => {
    const a = buildCatalogIdentityKey({
      lensFamily: "SINGLE_VISION",
      category: "BLUE CUT",
      brand: "ASH",
      item: "BLUE CUT",
      index: 1.6,
      coating: "GREEN",
    });
    const b = buildCatalogIdentityKey({
      lensFamily: "SINGLE_VISION",
      category: "BLUE CUT",
      brand: "ASH",
      item: "BLUE CUT",
      index: 1.6,
      coating: "GREEN",
    });
    assert.equal(a, b);
    assert.match(a, /^SV\|/);
  });

  it("distinguishes coating and index", () => {
    const green = buildCatalogIdentityKey({
      lensFamily: "SINGLE_VISION",
      brand: "ASH",
      index: 1.56,
      coating: "GREEN",
    });
    const blue = buildCatalogIdentityKey({
      lensFamily: "SINGLE_VISION",
      brand: "ASH",
      index: 1.56,
      coating: "BLUE",
    });
    assert.notEqual(green, blue);
  });

  it("uses KT key without item", () => {
    const key = buildCatalogIdentityKey({
      lensFamily: "KRYPTOK",
      category: "KT",
      brand: "BRC",
      item: "ignored-for-key",
      coating: "HC",
    });
    assert.match(key, /^KT\|/);
    assert.ok(!key.includes("ignored-for-key"));
  });

  it("requires progressive type + item + index", () => {
    assert.throws(() =>
      buildCatalogIdentityKey({
        lensFamily: "PROGRESSIVE",
        brand: "X",
        item: "Y",
        index: 1.56,
        coating: "HMC",
      })
    );
    const key = buildCatalogIdentityKey({
      lensFamily: "PROGRESSIVE",
      brand: "X",
      item: "Y",
      index: 1.56,
      coating: "HMC",
      progressiveType: "Soft",
    });
    assert.match(key, /^PG\|/);
  });
});
