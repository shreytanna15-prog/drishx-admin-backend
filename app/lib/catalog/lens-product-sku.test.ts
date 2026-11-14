import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLensProductBaseCode,
  buildLensProductName,
  buildLensProductSkuCode,
  buildPowerNameToken,
  encodeSkuPower,
  sanitizeSkuCodePart,
} from "./lens-product-sku";

describe("lens product SKU + name", () => {
  it("sanitizes SKU code parts", () => {
    assert.equal(sanitizeSkuCodePart("1.56"), "1P56");
    assert.equal(sanitizeSkuCodePart(" green "), "GREEN");
    assert.equal(sanitizeSkuCodePart("KT-BR"), "KTBR");
  });

  it("encodes power bounds for SKU", () => {
    assert.equal(encodeSkuPower(-6), "M6");
    assert.equal(encodeSkuPower(0.25), "0P25");
    assert.equal(encodeSkuPower(10), "10");
    assert.equal(encodeSkuPower(2), "2");
  });

  it("builds parent base code without ADD/eye/power", () => {
    assert.equal(
      buildLensProductBaseCode({
        familyCode: "SV",
        baseCode: "HC",
        materialCode: "PLAIN",
        indexCode: "1.56",
        colorCode: "CLEAR",
      }),
      "PLAIN-HC-1P56-SV-CLEAR"
    );
    assert.equal(
      buildLensProductBaseCode({
        familyCode: "KT",
        baseCode: "BR",
        diameterCode: "D65",
      }),
      "BR-KT-D65"
    );
    assert.equal(
      buildLensProductBaseCode({
        familyCode: "V2",
        baseCode: "BR",
        indexCode: "1.56",
        progressiveTypeCode: "DIGITAL",
        colorCode: "GREEN",
      }),
      "BR-1P56-V2-DIGITAL-GREEN"
    );
  });

  it("SKU encodes bounds, optional ADD/eye/axis", () => {
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "SV",
        baseCode: "HC",
        materialCode: "PLAIN",
        indexCode: "1.56",
        colorCode: "CLEAR",
        sphMin: 0,
        sphMax: 2,
        cylMin: 0,
        cylMax: 1,
      }),
      "PLAIN-HC-1P56-SV-CLEAR-S0T2-C0T1"
    );
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "KT",
        baseCode: "HC",
        sphMin: 2,
        sphMax: -6,
        cylMin: 1,
        cylMax: 0,
        axisValue: 90,
      }),
      "HC-KT-SM6T2-C0T1-A90"
    );
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "V2",
        baseCode: "BR",
        additionCode: "ADD_3P00",
        diameterCode: "D65",
        eye: "LEFT",
        sphMin: 0,
        sphMax: -4,
        cylMin: 0,
        cylMax: -2,
        axisValue: 90,
      }),
      "BR-V2-ADD3P00-D65-LEFT-SM4T0-CM2T0-A90"
    );
    assert.equal(
      buildLensProductSkuCode({
        familyCode: "V2",
        baseCode: "BR",
        progressiveTypeCode: "DIGITAL",
        colorCode: "GREEN",
        eye: "RIGHT",
        sphMin: 0,
        sphMax: 2,
        cylMin: 0,
        cylMax: 0,
      }),
      "BR-V2-DIGITAL-GREEN-RIGHT-S0T2-C0T0"
    );
  });

  it("name power token is compact for plano→extreme bands", () => {
    assert.equal(buildPowerNameToken(0, 2, 0, 1), "+2.00/+1.00");
    assert.equal(buildPowerNameToken(0, -6, 0, 4), "-6.00/+4.00");
  });

  it("builds human name with compact power and optional axis only", () => {
    assert.equal(
      buildLensProductName({
        materialCode: "PG",
        indexCode: "1.56",
        familyCode: "KT",
        baseCode: "BR",
        colorLabel: "Green",
        sphMin: 0,
        sphMax: -6,
        cylMin: 0,
        cylMax: -2,
        axisValue: 90,
      }),
      "PG 1.56 KT BR Green -6.00/-2.00 90"
    );
    assert.equal(
      buildLensProductName({
        familyCode: "SV",
        baseCode: "HC",
        sphMin: 0,
        sphMax: 4,
        cylMin: 0,
        cylMax: 2,
      }),
      "SV HC +4.00/+2.00"
    );
  });
});
