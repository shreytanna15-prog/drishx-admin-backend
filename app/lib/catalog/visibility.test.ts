import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeLensWhere,
  isCatalogProductShopVisible,
  shouldDisableLensLeaves,
} from "./visibility";

describe("catalog visibility (RW-09 Phase C)", () => {
  it("only ACTIVE products are shop-visible", () => {
    assert.equal(isCatalogProductShopVisible("ACTIVE"), true);
    assert.equal(isCatalogProductShopVisible("HELD"), false);
    assert.equal(isCatalogProductShopVisible("ARCHIVED"), false);
  });

  it("hold and archive disable lens leaves", () => {
    assert.equal(shouldDisableLensLeaves("ACTIVE"), false);
    assert.equal(shouldDisableLensLeaves("HELD"), true);
    assert.equal(shouldDisableLensLeaves("ARCHIVED"), true);
  });

  it("activeLensWhere excludes disabled SKUs", () => {
    assert.deepEqual(activeLensWhere(), { isDisabled: false });
  });
});
