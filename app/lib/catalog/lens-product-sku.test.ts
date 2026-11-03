import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLensProductBaseCode,
  buildLensProductName,
  buildLensProductSkuCode,
  encodeSkuPower,
  sanitizeSkuCodePart,
} from "./lens-product-sku";

describe("lens product SKU helpers (RC-04)", () => {
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

  it("builds base code MATERIAL-BASE-INDEX-FAMILY-COLOR", () => {
    assert.equal(
      buildLensProductBaseCode({
        familyCode: "KT",
        baseCode: "BR",
        materialCode: "PG",
        indexCode: "1.56",
        colorCode: "GREEN",
      }),
      "PG-BR-1P56-KT-GREEN"
    );
  });

  it("omits material from base/SKU when absent", () => {
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "SV",
        baseCode: "HC",
        materialCode: null,
        indexCode: "1.56",
        colorCode: "BLUE",
        sphMin: -6,
        sphMax: 2,
        cylMin: -2,
        cylMax: 0,
      }),
      "HC-1P56-SV-BLUE-SM6T2-CM2T0"
    );
  });

  it("builds full SKU with material and color", () => {
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "KT",
        baseCode: "BR",
        materialCode: "PG",
        indexCode: "1.56",
        colorCode: "GREEN",
        sphMin: -6,
        sphMax: 2,
        cylMin: 0,
        cylMax: -2,
      }),
      "PG-BR-1P56-KT-GREEN-SM6T2-CM2T0"
    );
  });

  it("builds human name with power label (CLIENT-PLAN color display)", () => {
    assert.equal(
      buildLensProductName({
        familyCode: "KT",
        baseCode: "BR",
        materialCode: "PG",
        indexCode: "1.56",
        colorLabel: "Green",
        sphMin: -6,
        sphMax: 2,
      }),
      "PG 1.56 KT BR Green -6.00/+2.00"
    );
  });

  it("different power ranges yield different SKUs", () => {
    const base = {
      familyCode: "KT",
      baseCode: "BR",
      materialCode: "PG",
      indexCode: "1.56",
      colorCode: "GREEN",
      cylMin: 0,
      cylMax: -2,
    };
    const a = buildLensProductSkuCode({ ...base, sphMin: -6, sphMax: 2 });
    const b = buildLensProductSkuCode({ ...base, sphMin: -6, sphMax: 4 });
    assert.notEqual(a, b);
  });

  it("requires family, base, and index", () => {
    assert.throws(() =>
      buildLensProductBaseCode({
        familyCode: "",
        baseCode: "HC",
        indexCode: "1.56",
      })
    );
  });
});
