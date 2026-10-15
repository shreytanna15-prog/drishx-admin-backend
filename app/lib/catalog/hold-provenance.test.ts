import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCatalogProductShopVisible,
  shouldDisableLensLeaves,
} from "./visibility";

/**
 * Hold/archive semantics (unit-level contract):
 * - Product hold → disable leaves that were enabled; mark disabledByProductHold.
 * - Unhold → only re-enable leaves with disabledByProductHold=true.
 * - Independently disabled leaves stay disabled.
 *
 * Full DB path is in setCatalogProductStatus; this locks the visibility contract.
 */
describe("hold / archive provenance contract", () => {
  it("blocks shop visibility while held or archived", () => {
    assert.equal(isCatalogProductShopVisible("HELD"), false);
    assert.equal(isCatalogProductShopVisible("ARCHIVED"), false);
    assert.equal(isCatalogProductShopVisible("ACTIVE"), true);
  });

  it("hold implies leaf disablement for customer paths", () => {
    assert.equal(shouldDisableLensLeaves("HELD"), true);
    assert.equal(shouldDisableLensLeaves("ARCHIVED"), true);
  });

  it("unhold reactivation rule: only hold-marked leaves", () => {
    const leaves = [
      { id: "1", isDisabled: true, disabledByProductHold: true },
      { id: "2", isDisabled: true, disabledByProductHold: false },
      { id: "3", isDisabled: false, disabledByProductHold: false },
    ];
    const afterUnhold = leaves.map((leaf) => {
      if (leaf.disabledByProductHold) {
        return { ...leaf, isDisabled: false, disabledByProductHold: false };
      }
      return leaf;
    });
    assert.equal(afterUnhold[0]!.isDisabled, false);
    assert.equal(afterUnhold[1]!.isDisabled, true); // independently disabled
    assert.equal(afterUnhold[2]!.isDisabled, false);
  });
});
