import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intersectCoatingsWithManagedLabels } from "./coating-filter-intersect";

describe("intersectCoatingsWithManagedLabels", () => {
  it("orders live coatings by managed sortOrder and uses managed casing", () => {
    const result = intersectCoatingsWithManagedLabels(
      ["green", "Blue Coat", "PURPLE"],
      [
        { name: "PURPLE", sortOrder: 2, isActive: true },
        { name: "GREEN", sortOrder: 0, isActive: true },
        { name: "Blue Coat", sortOrder: 1, isActive: true },
      ]
    );
    assert.deepEqual(result, ["GREEN", "Blue Coat", "PURPLE"]);
  });

  it("hides inactive managed labels even if products exist", () => {
    const result = intersectCoatingsWithManagedLabels(
      ["GREEN", "Blue Coat"],
      [
        { name: "GREEN", sortOrder: 0, isActive: false },
        { name: "Blue Coat", sortOrder: 1, isActive: true },
      ]
    );
    assert.deepEqual(result, ["Blue Coat"]);
  });

  it("falls back to A-Z when no managed labels exist", () => {
    const result = intersectCoatingsWithManagedLabels(
      ["PURPLE", "GREEN"],
      []
    );
    assert.deepEqual(result, ["GREEN", "PURPLE"]);
  });

  it("hides all chips when every managed label is inactive", () => {
    const result = intersectCoatingsWithManagedLabels(
      ["GREEN", "Blue Coat"],
      [
        { name: "GREEN", sortOrder: 0, isActive: false },
        { name: "Blue Coat", sortOrder: 1, isActive: false },
      ]
    );
    assert.deepEqual(result, []);
  });

  it("excludes hardcoat grades from live coatings", () => {
    const result = intersectCoatingsWithManagedLabels(
      ["HC", "GREEN"],
      [{ name: "GREEN", sortOrder: 0, isActive: true }]
    );
    assert.deepEqual(result, ["GREEN"]);
  });
});
