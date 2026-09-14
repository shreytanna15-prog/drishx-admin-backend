import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffFields, singleChange } from "./diff";

describe("diffFields", () => {
  it("returns empty array when values match", () => {
    const changes = diffFields({ a: 1, b: "x" }, { a: 1, b: "x" }, ["a", "b"]);
    assert.equal(changes.length, 0);
  });

  it("detects changed scalar fields", () => {
    const changes = diffFields(
      { status: "PENDING", qty: 2 },
      { status: "CANCELLED", qty: 2 },
      ["status", "qty"]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.field, "status");
    assert.equal(changes[0]?.before, "PENDING");
    assert.equal(changes[0]?.after, "CANCELLED");
  });

  it("serializes decimal-like values to strings", () => {
    const changes = diffFields(
      { price: { toString: () => "100.00" } as unknown as number },
      { price: { toString: () => "120.00" } as unknown as number },
      ["price"]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.before, "100.00");
    assert.equal(changes[0]?.after, "120.00");
  });
});

describe("singleChange", () => {
  it("skips identical values", () => {
    assert.deepEqual(singleChange("qty", 5, 5), []);
  });

  it("records one field change", () => {
    const changes = singleChange("qty", 5, 3);
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0], { field: "qty", before: 5, after: 3 });
  });
});
