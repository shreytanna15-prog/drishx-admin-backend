import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LensType } from "@prisma/client";
import type { InventoryCatalogRowInput } from "./inventory-stock-format";
import {
  buildReportExport,
  exportSheetsToCsv,
  isReportPayloadTruncated,
} from "./export-format";
import { exportSheetsToXlsxBuffer } from "./export-workbook";
import { getReportDefinition, listReportDefinitions } from "./registry";
import {
  COST_PRICE_FIELD_LENS_TYPES,
  NO_COST_PRICE_FIELD_LENS_TYPES,
  buildStockValuationLines,
  lensFamilyHasCostPriceField,
  lineValuation,
  resolveUnitCostPrice,
  resolveUnitSellingPrice,
  selectStockValuationDetailRows,
  stockValuationToReportPayload,
  summarizeStockValuation,
} from "./stock-valuation-format";

function row(
  partial: Partial<InventoryCatalogRowInput> &
    Pick<InventoryCatalogRowInput, "lensType" | "lensId" | "onHand">
): InventoryCatalogRowInput {
  return {
    category: null,
    brand: "Brand",
    item: "Item",
    coating: "HC",
    progressiveType: null,
    index: null,
    sph: null,
    cyl: null,
    add: null,
    axis: null,
    eye: null,
    crossPower: null,
    isDisabled: false,
    costPrice: null,
    sellingPrice: null,
    ...partial,
  };
}

describe("lens family cost-price field map", () => {
  it("marks SV / Kryptok / Progressive as having costPrice", () => {
    for (const t of COST_PRICE_FIELD_LENS_TYPES) {
      assert.equal(lensFamilyHasCostPriceField(t), true);
    }
  });

  it("marks OriVision / Magnus / Bifocal as lacking costPrice", () => {
    for (const t of NO_COST_PRICE_FIELD_LENS_TYPES) {
      assert.equal(lensFamilyHasCostPriceField(t), false);
      assert.equal(
        resolveUnitCostPrice({ lensType: t, costPrice: 50 }),
        null,
        "even a numeric costPrice is ignored when the family has no schema field"
      );
    }
  });
});

describe("unit price resolution", () => {
  it("resolves optional costPrice only for cost-capable families", () => {
    assert.equal(
      resolveUnitCostPrice({
        lensType: LensType.SINGLE_VISION,
        costPrice: 72.5,
      }),
      72.5
    );
    assert.equal(
      resolveUnitCostPrice({
        lensType: LensType.SINGLE_VISION,
        costPrice: null,
      }),
      null
    );
    assert.equal(
      resolveUnitCostPrice({
        lensType: LensType.KRYPTOK,
        costPrice: undefined,
      }),
      null
    );
  });

  it("resolves selling price; never invents zero for missing", () => {
    assert.equal(resolveUnitSellingPrice({ sellingPrice: 120 }), 120);
    assert.equal(resolveUnitSellingPrice({ sellingPrice: null }), null);
    assert.equal(resolveUnitSellingPrice({ sellingPrice: Number.NaN }), null);
  });
});

describe("lineValuation", () => {
  it("multiplies on-hand × unit without treating missing as zero", () => {
    assert.equal(lineValuation(10, 12.5), 125);
    assert.equal(lineValuation(0, 12.5), 0);
    assert.equal(lineValuation(10, null), null);
    assert.equal(lineValuation(0, null), null);
  });

  it("avoids premature rounding on fractional unit prices", () => {
    // Keep full IEEE product (no intermediate round) — 7 × 12.34 = 86.38 exactly in binary-friendly form
    assert.equal(lineValuation(7, 12.34), 7 * 12.34);
    assert.equal(lineValuation(2, 0.1), 2 * 0.1);
  });
});

describe("stock valuation across six families", () => {
  const catalog: InventoryCatalogRowInput[] = [
    row({
      lensType: LensType.SINGLE_VISION,
      lensId: "sv-1",
      onHand: 10,
      costPrice: 50,
      sellingPrice: 80,
    }),
    row({
      lensType: LensType.KRYPTOK,
      lensId: "kt-1",
      onHand: 4,
      costPrice: 40,
      sellingPrice: 70,
    }),
    row({
      lensType: LensType.PROGRESSIVE,
      lensId: "pg-1",
      onHand: 2,
      costPrice: 100,
      sellingPrice: 150,
      progressiveType: "HMC",
      eye: "RIGHT",
    }),
    row({
      lensType: LensType.ORI_VISION,
      lensId: "ov-1",
      onHand: 5,
      costPrice: null,
      sellingPrice: 90,
    }),
    row({
      lensType: LensType.MAGNUS,
      lensId: "mg-1",
      onHand: 3,
      sellingPrice: 110,
    }),
    row({
      lensType: LensType.BIFOCAL,
      lensId: "bf-1",
      onHand: 1,
      sellingPrice: 95,
    }),
  ];

  it("computes known cost and selling subtotals without substituting prices", () => {
    const { lines, disabledProductCount } = buildStockValuationLines(catalog);
    assert.equal(disabledProductCount, 0);
    assert.equal(lines.length, 6);

    const totals = summarizeStockValuation(lines, disabledProductCount);
    // Cost: SV 500 + KT 160 + PG 200 = 860; OV/MG/BF contribute nothing
    assert.equal(totals.costKnownSubtotal, 500 + 160 + 200);
    // Selling: 800 + 280 + 300 + 450 + 330 + 95 = 2255
    assert.equal(totals.sellingKnownSubtotal, 800 + 280 + 300 + 450 + 330 + 95);
    assert.equal(totals.costValuationComplete, false);
    assert.equal(totals.sellingValuationComplete, true);
    assert.equal(totals.skusWithMissingCost, 3);
    assert.equal(totals.skusMissingCostOnStocked, 3);
    assert.equal(totals.familiesWithoutCostField, "ORI_VISION, MAGNUS, BIFOCAL");
  });

  it("reconciles on-hand coverage with enabled catalog quantities", () => {
    const { lines } = buildStockValuationLines(catalog);
    const totals = summarizeStockValuation(lines, 0);
    assert.equal(totals.totalOnHandEnabled, 10 + 4 + 2 + 5 + 3 + 1);
    assert.equal(
      totals.onHandCoveredByKnownCost + totals.onHandMissingCost,
      totals.totalOnHandEnabled
    );
    assert.equal(
      totals.onHandCoveredByKnownSelling + totals.onHandMissingSelling,
      totals.totalOnHandEnabled
    );
  });
});

describe("missing cost / selling and zero stock", () => {
  it("counts missing cost on stocked vs zero-stock separately", () => {
    const catalog = [
      row({
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-missing-stocked",
        onHand: 8,
        costPrice: null,
        sellingPrice: 100,
      }),
      row({
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-missing-zero",
        onHand: 0,
        costPrice: null,
        sellingPrice: 100,
      }),
      row({
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-known-zero",
        onHand: 0,
        costPrice: 20,
        sellingPrice: 30,
      }),
    ];
    const { lines } = buildStockValuationLines(catalog);
    const totals = summarizeStockValuation(lines, 0);
    assert.equal(totals.skusWithMissingCost, 2);
    assert.equal(totals.skusMissingCostOnStocked, 1);
    assert.equal(totals.skusMissingCostOnZeroStock, 1);
    assert.equal(totals.costKnownSubtotal, 0);
    assert.equal(totals.sellingKnownSubtotal, 800);
    assert.equal(lineValuation(0, 20), 0);
  });

  it("never treats missing selling as zero in subtotals", () => {
    const catalog = [
      row({
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-no-sell",
        onHand: 10,
        costPrice: 40,
        sellingPrice: null,
      }),
    ];
    const { lines } = buildStockValuationLines(catalog);
    const totals = summarizeStockValuation(lines, 0);
    assert.equal(totals.sellingKnownSubtotal, 0);
    assert.equal(totals.skusWithMissingSelling, 1);
    assert.equal(totals.skusMissingSellingOnStocked, 1);
    assert.equal(totals.costKnownSubtotal, 400);
    assert.equal(totals.sellingValuationComplete, false);
  });
});

describe("disabled product exclusion", () => {
  it("excludes disabled rows from valuation and counts them only", () => {
    const catalog = [
      row({
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-ok",
        onHand: 2,
        costPrice: 10,
        sellingPrice: 20,
      }),
      row({
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-off",
        onHand: 100,
        costPrice: 10,
        sellingPrice: 20,
        isDisabled: true,
      }),
    ];
    const { lines, disabledProductCount } = buildStockValuationLines(catalog);
    assert.equal(disabledProductCount, 1);
    assert.equal(lines.length, 1);
    const totals = summarizeStockValuation(lines, disabledProductCount);
    assert.equal(totals.costKnownSubtotal, 20);
    assert.equal(totals.sellingKnownSubtotal, 40);
    assert.equal(totals.disabledProductCount, 1);
  });
});

describe("payload + export compatibility", () => {
  it("registers stock-valuation in phase 1 catalog", () => {
    const def = getReportDefinition("stock-valuation");
    assert.ok(def);
    assert.equal(def!.phase, 1);
    assert.equal(def!.filters, "none");
    assert.ok(
      listReportDefinitions({ phaseMax: 1 }).some(
        (r) => r.key === "stock-valuation"
      )
    );
  });

  it("builds cards payload with full summary and row cap meta", () => {
    const catalog = [
      row({
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-1",
        onHand: 5,
        costPrice: 10,
        sellingPrice: 20,
      }),
      row({
        lensType: LensType.ORI_VISION,
        lensId: "ov-1",
        onHand: 2,
        sellingPrice: 30,
      }),
    ];
    const payload = stockValuationToReportPayload(catalog, { rowLimit: 2000 });
    assert.equal(payload.kind, "cards");
    assert.equal(payload.summary?.costKnownSubtotal, 50);
    assert.equal(payload.summary?.sellingKnownSubtotal, 100 + 60);
    assert.equal(payload.summary?.costValuationComplete, "no");
    assert.equal(payload.meta?.truncated, false);
    assert.equal(isReportPayloadTruncated(payload), false);

    const detail = selectStockValuationDetailRows(
      buildStockValuationLines(catalog).lines
    );
    assert.equal(detail.length, 2);

    const built = buildReportExport({
      report: "stock-valuation",
      title: "Stock Valuation",
      category: "inventory",
      params: { fy: null, from: null, to: null },
      data: payload,
    });
    const csv = exportSheetsToCsv(built.sheets);
    assert.match(csv, /Cost valuation \(known subtotal\)/);
    assert.match(csv, /Unit cost/);
    assert.match(csv, /50/);
  });

  it("marks truncated detail tables so export can refuse incomplete files", () => {
    const catalog = Array.from({ length: 5 }, (_, i) =>
      row({
        lensType: LensType.SINGLE_VISION,
        lensId: `sv-${i}`,
        onHand: 1,
        costPrice: 10,
        sellingPrice: 20,
      })
    );
    const payload = stockValuationToReportPayload(catalog, { rowLimit: 2 });
    assert.equal(payload.meta?.truncated, true);
    assert.equal(payload.rows?.length, 2);
    assert.equal(payload.summary?.costKnownSubtotal, 50);
    assert.equal(isReportPayloadTruncated(payload), true);
  });

  it("exports xlsx buffer for valuation payload", async () => {
    const payload = stockValuationToReportPayload([
      row({
        lensType: LensType.KRYPTOK,
        lensId: "kt-x",
        onHand: 3,
        costPrice: 11,
        sellingPrice: 22,
      }),
    ]);
    const built = buildReportExport({
      report: "stock-valuation",
      title: "Stock Valuation",
      category: "inventory",
      params: { fy: null, from: null, to: null },
      data: payload,
    });
    const buf = await exportSheetsToXlsxBuffer(built.sheets);
    assert.ok(buf.byteLength > 100);
  });
});
