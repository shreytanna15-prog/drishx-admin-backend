import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateRequiredQuantity,
  deriveReorderPriority,
  formatLensPower,
  isProcurementLensType,
  orderLensIdField,
  procurementBatchReferenceFor,
  procurementReferenceFor,
  sanitizeReferenceSegment,
  validateReorderRule,
} from "./procurement-rules";

describe("calculateRequiredQuantity — procurement PDF §4", () => {
  it("tops up to target when nothing is available", () => {
    assert.equal(
      calculateRequiredQuantity({ available: 18, targetStock: 100, incoming: 0 }),
      82
    );
  });

  it("subtracts incoming stock so the same shortage is not bought twice (§6)", () => {
    // PDF §6 example: available 7, already 30 on order, target 50.
    assert.equal(
      calculateRequiredQuantity({ available: 7, targetStock: 50, incoming: 30 }),
      13
    );
  });

  it("returns 0 when incoming already covers the target (§6)", () => {
    assert.equal(
      calculateRequiredQuantity({ available: 7, targetStock: 50, incoming: 43 }),
      0
    );
    assert.equal(
      calculateRequiredQuantity({ available: 7, targetStock: 50, incoming: 100 }),
      0
    );
  });

  it("returns 0 when stock is already at or above target", () => {
    assert.equal(
      calculateRequiredQuantity({ available: 120, targetStock: 100, incoming: 0 }),
      0
    );
    assert.equal(
      calculateRequiredQuantity({ available: 100, targetStock: 100, incoming: 0 }),
      0
    );
  });

  it("rounds up to the next MOQ multiple (§28)", () => {
    // 81 needed but MOQ is 50 -> order 100.
    assert.equal(
      calculateRequiredQuantity({
        available: 19,
        targetStock: 100,
        incoming: 0,
        moq: 50,
      }),
      100
    );
    // 81 needed, MOQ 60 -> 120.
    assert.equal(
      calculateRequiredQuantity({
        available: 19,
        targetStock: 100,
        incoming: 0,
        moq: 60,
      }),
      120
    );
  });

  it("leaves quantities already above MOQ untouched", () => {
    assert.equal(
      calculateRequiredQuantity({
        available: 0,
        targetStock: 200,
        incoming: 0,
        moq: 50,
      }),
      200
    );
  });

  it("ignores a non-positive or missing MOQ", () => {
    assert.equal(
      calculateRequiredQuantity({
        available: 0,
        targetStock: 82,
        incoming: 0,
        moq: 0,
      }),
      82
    );
    assert.equal(
      calculateRequiredQuantity({ available: 0, targetStock: 82, incoming: 0, moq: null }),
      82
    );
  });

  it("never returns a negative quantity", () => {
    assert.equal(
      calculateRequiredQuantity({ available: 0, targetStock: 0, incoming: 0 }),
      0
    );
  });
});

describe("validateReorderRule", () => {
  const base = {
    lensType: "SINGLE_VISION",
    lensId: "lens-1",
    minStock: 20,
    targetStock: 100,
  };

  it("accepts a well-formed rule", () => {
    assert.equal(validateReorderRule(base), null);
  });

  it("requires target greater than minimum", () => {
    assert.match(
      validateReorderRule({ ...base, minStock: 100, targetStock: 100 }) ?? "",
      /greater than minStock/
    );
    assert.match(
      validateReorderRule({ ...base, minStock: 200, targetStock: 100 }) ?? "",
      /greater than minStock/
    );
  });

  it("rejects negative or fractional stock levels", () => {
    assert.match(validateReorderRule({ ...base, minStock: -1 }) ?? "", /minStock/);
    assert.match(
      validateReorderRule({ ...base, minStock: 1.5 }) ?? "",
      /minStock/
    );
  });

  it("rejects an unsupported lens family", () => {
    // OriVision / Magnus / Bifocal stock cannot be moved by stock intake today.
    for (const lensType of ["ORI_VISION", "MAGNUS", "BIFOCAL", "NOT_A_TYPE", 42]) {
      assert.match(
        validateReorderRule({ ...base, lensType }) ?? "",
        /lensType must be one of/
      );
    }
  });

  it("requires a lensId", () => {
    assert.match(validateReorderRule({ ...base, lensId: "" }) ?? "", /lensId/);
    assert.match(validateReorderRule({ ...base, lensId: "  " }) ?? "", /lensId/);
  });

  it("rejects a non-positive MOQ", () => {
    assert.match(validateReorderRule({ ...base, moq: 0 }) ?? "", /moq/);
    assert.match(validateReorderRule({ ...base, moq: -5 }) ?? "", /moq/);
    assert.equal(validateReorderRule({ ...base, moq: "" }), null);
    assert.equal(validateReorderRule({ ...base, moq: null }), null);
    assert.equal(validateReorderRule({ ...base, moq: 50 }), null);
  });
});

describe("deriveReorderPriority", () => {
  it("marks out-of-stock as CRITICAL", () => {
    assert.equal(deriveReorderPriority(0, 20), "CRITICAL");
  });

  it("marks a SKU at less than half its minimum as HIGH", () => {
    assert.equal(deriveReorderPriority(5, 20), "HIGH");
  });

  it("keeps a SKU just under its minimum as NORMAL", () => {
    assert.equal(deriveReorderPriority(19, 20), "NORMAL");
  });
});

describe("procurement lens helpers", () => {
  it("allows only the lens families stock intake can move", () => {
    assert.equal(isProcurementLensType("SINGLE_VISION"), true);
    assert.equal(isProcurementLensType("KRYPTOK"), true);
    assert.equal(isProcurementLensType("PROGRESSIVE"), true);
    assert.equal(isProcurementLensType("ORI_VISION"), false);
    assert.equal(isProcurementLensType("MAGNUS"), false);
    assert.equal(isProcurementLensType("BIFOCAL"), false);
    assert.equal(isProcurementLensType(undefined), false);
  });

  it("maps every lens type to its order relation field", () => {
    assert.equal(orderLensIdField("SINGLE_VISION"), "singleVisionLensId");
    assert.equal(orderLensIdField("KRYPTOK"), "kryptokLensId");
    assert.equal(orderLensIdField("PROGRESSIVE"), "progressiveLensId");
    assert.equal(orderLensIdField("ORI_VISION"), "oriVisionLensId");
    assert.equal(orderLensIdField("MAGNUS"), "magnusLensId");
    assert.equal(orderLensIdField("BIFOCAL"), "bifocalLensId");
  });

  it("formats powers for the admin grid", () => {
    assert.equal(
      formatLensPower({ sph: -2, cyl: null, crossPower: null, add: null, eye: null }),
      "SPH -2"
    );
    assert.equal(
      formatLensPower({ sph: -2, cyl: -0.5, crossPower: null, add: null, eye: null }),
      "SPH -2 / CYL -0.50"
    );
    assert.equal(
      formatLensPower({ sph: null, cyl: null, crossPower: -2, add: null, eye: null }),
      "cross -2"
    );
    assert.equal(
      formatLensPower({ sph: null, cyl: null, crossPower: null, add: null, eye: null }),
      "PLANO"
    );
    assert.equal(
      formatLensPower({ sph: 1, cyl: null, crossPower: null, add: 4, eye: "RIGHT" }),
      "SPH 1 / ADD 4 · RIGHT"
    );
  });
});

describe("idempotency references", () => {
  it("derives a deterministic reference from the client request id", () => {
    const id = "req_1712345678901_abc123";
    assert.equal(procurementReferenceFor(id), procurementReferenceFor(id));
    assert.equal(procurementBatchReferenceFor(id), procurementBatchReferenceFor(id));
    assert.notEqual(procurementReferenceFor(id), procurementReferenceFor("other"));
  });

  it("prefixes single and batch references distinctly", () => {
    assert.ok(procurementReferenceFor("abc").startsWith("PROC-"));
    assert.ok(procurementBatchReferenceFor("abc").startsWith("PROC-BATCH-"));
  });

  it("strips characters that are unsafe in a unique reference", () => {
    assert.equal(sanitizeReferenceSegment("a b/c#d"), "a-b-c-d");
    assert.equal(sanitizeReferenceSegment("  "), "");
    assert.equal(sanitizeReferenceSegment("!!!"), "");
    assert.ok(sanitizeReferenceSegment("x".repeat(200)).length <= 60);
  });

  it("keeps the sanitized id addressable inside the reference", () => {
    // The replay lookup derives the same string on both attempts.
    const id = "req_1_2";
    assert.equal(
      procurementReferenceFor(id),
      `PROC-${sanitizeReferenceSegment(id)}`
    );
  });
});
