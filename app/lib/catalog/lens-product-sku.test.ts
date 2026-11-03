import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLensProductSkuCode,
  encodeSkuPower,
  sanitizeSkuCodePart,
} from "./lens-product-sku";

describe("lens product SKU helpers", () => {
  it("sanitizes attribute codes", () => {
    assert.equal(sanitizeSkuCodePart("sv"), "SV");
    assert.equal(sanitizeSkuCodePart("1.56"), "1P56");
    assert.equal(sanitizeSkuCodePart("CLIK_COAT"), "CLIKCOAT");
  });

  it("encodes power bounds", () => {
    assert.equal(encodeSkuPower(0), "0");
    assert.equal(encodeSkuPower(10), "10");
    assert.equal(encodeSkuPower(0.25), "0P25");
    assert.equal(encodeSkuPower(-6), "M6");
    assert.equal(encodeSkuPower(-0.5), "M0P5");
  });

  it("builds SKU from required attributes + range", () => {
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "SV",
        baseCode: "HC",
        materialCode: "PLAIN",
        sphMin: 0,
        sphMax: 10,
        cylMin: 0,
        cylMax: 4,
      }),
      "SV-HC-PLAIN-S0T10-C0T4"
    );
  });

  it("omits material from SKU when absent", () => {
    for (const materialCode of [undefined, null, "", "  "]) {
      assert.equal(
        buildLensProductSkuCode({
          familyCode: "SV",
          baseCode: "HC",
          materialCode,
          indexCode: "1.56",
          sphMin: -6,
          sphMax: 2,
          cylMin: -2,
          cylMax: 0,
        }),
        "SV-HC-1P56-SM6T2-CM2T0"
      );
    }
  });

  it("different power-range bounds yield different SKUs", () => {
    const base = {
      familyCode: "SV",
      baseCode: "HC",
      materialCode: "PLAIN",
      indexCode: "1.56",
      cylMin: -2,
      cylMax: 0,
    };
    const a = buildLensProductSkuCode({ ...base, sphMin: -6, sphMax: 2 });
    const b = buildLensProductSkuCode({ ...base, sphMin: -6, sphMax: 4 });
    assert.equal(a, "SV-HC-PLAIN-1P56-SM6T2-CM2T0");
    assert.equal(b, "SV-HC-PLAIN-1P56-SM6T4-CM2T0");
    assert.notEqual(a, b);
  });

  it("requires family and base codes", () => {
    assert.throws(() =>
      buildLensProductSkuCode({
        familyCode: "",
        baseCode: "HC",
        sphMin: 0,
        sphMax: 1,
        cylMin: 0,
        cylMax: 0,
      })
    );
  });

  it("includes optional attributes and CROSS when set", () => {
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "SV",
        baseCode: "HC",
        materialCode: "PLAIN",
        indexCode: "1.56",
        coatingCode: "GREEN",
        colorCode: null,
        sphMin: -6,
        sphMax: 0,
        cylMin: 0,
        cylMax: 2,
        rangeType: "CROSS",
      }),
      "SV-HC-PLAIN-1P56-GREEN-SM6T0-C0T2-CROSS"
    );
  });

  it("normalizes swapped min/max", () => {
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "SV",
        baseCode: "BRC",
        materialCode: "UC",
        sphMin: 1,
        sphMax: 0,
        cylMin: 0.5,
        cylMax: 0,
      }),
      "SV-BRC-UC-S0T1-C0T0P5"
    );
  });
});
