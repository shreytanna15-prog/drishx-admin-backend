import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agingBucket } from "./aging";
import {
  REPORT_MAX_RANGE_DAYS,
  formatDateKey,
  resolveReportDateRange,
} from "./date-range";
import {
  gstSummaryToReportPayload,
  type GstSummaryResult,
} from "./gst-summary-format";
import { bucketInvoicesByDay } from "./daily-sales-format";
import {
  bucketInvoicesByMonth,
  formatMonthKey,
} from "./monthly-sales-format";
import {
  paymentCollectionSource,
  sumPaymentCollectionAmounts,
} from "./payment-collection-format";
import { sumPurchaseBills } from "./purchase-aggregate-format";
import {
  getReportDefinition,
  groupReportsByCategory,
  listReportDefinitions,
} from "./registry";
import {
  formatQuarterKey,
  formatYearKey,
  bucketInvoicesByQuarter,
  bucketInvoicesByYear,
} from "./period-sales-format";
import { RX_ORDER_NOTES_MARKER, notesIsRxOrder } from "./rx-marker";
import { sumInvoiceSales } from "./sales-aggregate-format";
import {
  analyzeInvoiceSettlement,
  classifyInvoiceSettlement,
} from "./sales-payment-analysis-format";
import {
  INVENTORY_REPORT_ROW_LIMIT,
  aggregateCommittedByLens,
  aggregatePowerWise,
  aggregateProductWise,
  availableUnitsFromOnHand,
  buildInventoryStockPositions,
  classifyOutOfStock,
  collectLowStockRows,
  collectOutOfStockRows,
  committedUnitsFromReservation,
  formatInventoryPowerLabel,
  inventoryStockToReportPayload,
  isLowStockAgainstMin,
  partitionEnabledCatalog,
  sumInventoryQty,
  type InventoryCatalogRowInput,
} from "./inventory-stock-format";
import { LensType } from "@prisma/client";

const PHASE1_KEYS = [
  "available-stock",
  "cancelled-orders",
  "completed-orders",
  "current-stock",
  "daily-sales",
  "gst-summary",
  "low-stock",
  "monthly-sales",
  "out-of-stock",
  "outstanding-customers",
  "payment-collection",
  "pending-orders",
  "power-wise-stock",
  "product-wise-stock",
  "purchase-summary",
  "quarterly-sales",
  "reserved-stock",
  "rx-orders",
  "sales-summary",
  "stock-valuation",
  "yearly-sales",
];

function catalogRow(
  partial: Partial<InventoryCatalogRowInput> &
    Pick<InventoryCatalogRowInput, "lensType" | "lensId" | "onHand">
): InventoryCatalogRowInput {
  return {
    category: null,
    brand: null,
    item: null,
    coating: null,
    progressiveType: null,
    index: null,
    sph: null,
    cyl: null,
    add: null,
    axis: null,
    eye: null,
    crossPower: null,
    isDisabled: false,
    ...partial,
  };
}

const SAMPLE_INVOICES = [
  {
    issuedAt: new Date(2026, 0, 5),
    taxableAmount: 100,
    cgstAmount: 9,
    sgstAmount: 9,
    igstAmount: 0,
    amount: 118,
  },
  {
    issuedAt: new Date(2026, 0, 20),
    taxableAmount: 200,
    cgstAmount: 18,
    sgstAmount: 18,
    igstAmount: 0,
    amount: 236,
  },
  {
    issuedAt: new Date(2026, 1, 1),
    taxableAmount: 50,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 9,
    amount: 59,
  },
  {
    issuedAt: null,
    taxableAmount: 999,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    amount: 999,
  },
];

describe("reports registry", () => {
  it("exposes Stage 1–5C report keys", () => {
    const keys = listReportDefinitions({ phaseMax: 1 }).map((r) => r.key);
    assert.deepEqual(keys.sort(), PHASE1_KEYS);
  });

  it("does not register ready-stock-orders until defined", () => {
    assert.equal(getReportDefinition("ready-stock-orders"), null);
  });

  it("returns null for unknown keys", () => {
    assert.equal(getReportDefinition("not-a-real-report"), null);
  });

  it("groups categories without empty sections", () => {
    const groups = groupReportsByCategory(
      listReportDefinitions({ phaseMax: 1 })
    );
    assert.ok(groups.every((g) => g.reports.length > 0));
    assert.ok(groups.some((g) => g.category === "financial"));
    assert.ok(groups.some((g) => g.category === "orders"));
    assert.ok(groups.some((g) => g.category === "sales"));
    assert.ok(groups.some((g) => g.category === "inventory"));
  });

  it("registers Stage 5 inventory reports with no date filters", () => {
    for (const key of [
      "current-stock",
      "reserved-stock",
      "available-stock",
      "product-wise-stock",
      "power-wise-stock",
      "out-of-stock",
      "low-stock",
    ]) {
      const def = getReportDefinition(key);
      assert.ok(def);
      assert.equal(def?.category, "inventory");
      assert.equal(def?.filters, "none");
    }
  });
});

describe("inventory stock calculations", () => {
  it("matches order-inventory committed and available formulas", () => {
    assert.equal(committedUnitsFromReservation(10, 3), 7);
    assert.equal(committedUnitsFromReservation(5, 5), 0);
    assert.equal(committedUnitsFromReservation(2, 5), 0);
    assert.equal(availableUnitsFromOnHand(20, 7), 13);
    assert.equal(availableUnitsFromOnHand(5, 5), 0);
    assert.equal(availableUnitsFromOnHand(3, 10), 0);
  });

  it("batches multi-item reservations across all six lens families", () => {
    const map = aggregateCommittedByLens([
      {
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-1",
        reservedQuantity: 10,
        pickedQuantity: 2,
      },
      {
        lensType: LensType.SINGLE_VISION,
        lensId: "sv-1",
        reservedQuantity: 4,
        pickedQuantity: 1,
      },
      {
        lensType: LensType.KRYPTOK,
        lensId: "kt-1",
        reservedQuantity: 3,
        pickedQuantity: 0,
      },
      {
        lensType: LensType.ORI_VISION,
        lensId: "ov-1",
        reservedQuantity: 99,
        pickedQuantity: 0,
      },
      {
        lensType: LensType.MAGNUS,
        lensId: "mg-1",
        reservedQuantity: 5,
        pickedQuantity: 2,
      },
      {
        lensType: LensType.BIFOCAL,
        lensId: "bf-1",
        reservedQuantity: 4,
        pickedQuantity: 0,
      },
      {
        lensType: LensType.PROGRESSIVE,
        lensId: null,
        reservedQuantity: 5,
        pickedQuantity: 0,
      },
    ]);
    assert.equal(map.get("SINGLE_VISION:sv-1"), 11);
    assert.equal(map.get("KRYPTOK:kt-1"), 3);
    assert.equal(map.get("ORI_VISION:ov-1"), 99);
    assert.equal(map.get("MAGNUS:mg-1"), 3);
    assert.equal(map.get("BIFOCAL:bf-1"), 4);
    assert.equal(map.has("PROGRESSIVE:"), false);
  });

  it("builds positions with available never negative", () => {
    const positions = buildInventoryStockPositions(
      [
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "sv-1",
          category: "WHITE",
          brand: "ASH",
          coating: "HC",
          sph: -1,
          cyl: -0.5,
          onHand: 5,
        }),
      ],
      new Map([["SINGLE_VISION:sv-1", 12]])
    );
    assert.equal(positions[0].committed, 12);
    assert.equal(positions[0].available, 0);
    assert.match(positions[0].power, /SPH/);
  });

  it("formats power labels for cross and progressive rows", () => {
    assert.equal(
      formatInventoryPowerLabel({
        sph: null,
        cyl: null,
        add: null,
        axis: null,
        eye: null,
        crossPower: -2,
      }),
      "CROSS -2.00"
    );
    assert.match(
      formatInventoryPowerLabel({
        sph: 1.25,
        cyl: -0.5,
        add: 2,
        axis: 90,
        eye: "RIGHT",
        crossPower: null,
      }),
      /ADD/
    );
  });

  it("excludes disabled rows from tables and reports disabledProductCount only", () => {
    const positions = buildInventoryStockPositions(
      [
        catalogRow({
          lensType: LensType.PROGRESSIVE,
          lensId: "p1",
          category: "BLUE CUT",
          brand: "PROX",
          item: "WHITE PROG",
          coating: "Green",
          progressiveType: "HMC",
          index: 1.56,
          sph: -2,
          add: 1.5,
          eye: "LEFT",
          onHand: 8,
          isDisabled: true,
        }),
        catalogRow({
          lensType: LensType.ORI_VISION,
          lensId: "ov1",
          brand: "MARI-BLU",
          coating: "GREEN",
          index: 1.56,
          sph: -1,
          onHand: 3,
        }),
      ],
      new Map()
    );

    const available = inventoryStockToReportPayload(positions, "available");
    assert.equal(available.rows.length, 1);
    assert.equal(available.rows[0].lensType, "ORI_VISION");
    assert.equal(available.rows[0].available, 3);
    assert.equal(available.summary?.disabledProductCount, 1);
    assert.equal(available.summary?.catalogEnabledCount, 1);
    assert.equal(
      available.columns.some((c) => c.key === "disabled"),
      false
    );
  });

  it("reserved report omits zero-commit rows; totals cover full match set before cap", () => {
    const positions = buildInventoryStockPositions(
      [
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "a",
          brand: "A",
          coating: "HC",
          sph: 0,
          onHand: 10,
        }),
        catalogRow({
          lensType: LensType.KRYPTOK,
          lensId: "b",
          brand: "B",
          coating: "HMC",
          sph: 1,
          add: 2,
          onHand: 4,
        }),
      ],
      new Map([["SINGLE_VISION:a", 3]])
    );

    const reserved = inventoryStockToReportPayload(positions, "reserved");
    assert.equal(reserved.rows.length, 1);
    assert.equal(reserved.summary?.matchingCount, 1);
    assert.equal(reserved.summary?.totalCommitted, 3);
    assert.equal(reserved.summary?.catalogEnabledCount, 2);

    const many = Array.from({ length: INVENTORY_REPORT_ROW_LIMIT + 5 }, (_, i) => ({
      ...positions[0],
      lensId: `id-${i}`,
      onHand: 1,
      committed: 1,
      available: 0,
    }));
    const capped = inventoryStockToReportPayload(many, "reserved", {
      rowLimit: INVENTORY_REPORT_ROW_LIMIT,
    });
    assert.equal(capped.rows.length, INVENTORY_REPORT_ROW_LIMIT);
    assert.equal(capped.meta?.truncated, true);
    assert.equal(capped.summary?.matchingCount, many.length);
    assert.equal(capped.summary?.totalCommitted, many.length);
    assert.equal(capped.summary?.returnedCount, INVENTORY_REPORT_ROW_LIMIT);
  });

  it("product-wise and power-wise totals reconcile with enabled SKU rows", () => {
    const positions = buildInventoryStockPositions(
      [
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "sv-a",
          category: "WHITE",
          brand: "ASH",
          coating: "HC",
          index: 1.56,
          sph: -1,
          cyl: -0.25,
          onHand: 10,
        }),
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "sv-b",
          category: "WHITE",
          brand: "ASH",
          coating: "HC",
          index: 1.56,
          sph: -1.25,
          cyl: -0.25,
          onHand: 4,
        }),
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "sv-c",
          category: "WHITE",
          brand: "ASH",
          coating: "HC",
          index: 1.67,
          sph: -1,
          onHand: 2,
        }),
        catalogRow({
          lensType: LensType.BIFOCAL,
          lensId: "bf-1",
          brand: "STARK",
          item: "HC KT",
          coating: "KT",
          sph: 1,
          add: 2,
          axis: 90,
          onHand: 7,
          isDisabled: false,
        }),
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "sv-disabled",
          brand: "X",
          coating: "HC",
          onHand: 99,
          isDisabled: true,
        }),
      ],
      new Map([
        ["SINGLE_VISION:sv-a", 3],
        ["BIFOCAL:bf-1", 1],
      ])
    );

    const { enabled, disabledProductCount } = partitionEnabledCatalog(positions);
    assert.equal(disabledProductCount, 1);
    assert.equal(enabled.length, 4);

    const skuTotals = sumInventoryQty(enabled);
    const productGroups = aggregateProductWise(enabled);
    const powerGroups = aggregatePowerWise(enabled);
    const productTotals = sumInventoryQty(productGroups);
    const powerTotals = sumInventoryQty(powerGroups);

    // Qty totals must match; rowCount differs (SKU vs grouped rows).
    assert.equal(productTotals.onHand, skuTotals.onHand);
    assert.equal(productTotals.committed, skuTotals.committed);
    assert.equal(productTotals.available, skuTotals.available);
    assert.equal(powerTotals.onHand, skuTotals.onHand);
    assert.equal(powerTotals.committed, skuTotals.committed);
    assert.equal(powerTotals.available, skuTotals.available);
    // Same product (ASH HC 1.56) has two power SKUs → one product group, two power groups
    assert.equal(
      productGroups.filter(
        (g) => g.brand === "ASH" && g.index === "1.56"
      ).length,
      1
    );
    assert.equal(
      powerGroups.filter((g) => g.brand === "ASH" && g.index === "1.56").length,
      2
    );

    const productPayload = inventoryStockToReportPayload(positions, "product");
    assert.equal(productPayload.summary?.totalOnHand, skuTotals.onHand);
    assert.equal(productPayload.summary?.totalCommitted, skuTotals.committed);
    assert.equal(productPayload.summary?.totalAvailable, skuTotals.available);
    assert.equal(productPayload.summary?.disabledProductCount, 1);

    const powerPayload = inventoryStockToReportPayload(positions, "power");
    assert.equal(powerPayload.summary?.totalOnHand, skuTotals.onHand);
    assert.equal(powerPayload.summary?.totalCommitted, skuTotals.committed);
    assert.equal(powerPayload.summary?.totalAvailable, skuTotals.available);
  });

  it("classifies physical vs fully-committed out of stock without double-counting", () => {
    assert.equal(classifyOutOfStock({ onHand: 0, available: 0 }), "physical");
    assert.equal(classifyOutOfStock({ onHand: -1, available: 0 }), "physical");
    assert.equal(
      classifyOutOfStock({ onHand: 5, available: 0 }),
      "fully_committed"
    );
    assert.equal(classifyOutOfStock({ onHand: 5, available: 2 }), null);

    const positions = buildInventoryStockPositions(
      [
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "empty",
          brand: "A",
          coating: "HC",
          onHand: 0,
        }),
        catalogRow({
          lensType: LensType.KRYPTOK,
          lensId: "held",
          brand: "B",
          coating: "HMC",
          onHand: 4,
        }),
        catalogRow({
          lensType: LensType.PROGRESSIVE,
          lensId: "ok",
          brand: "C",
          coating: "Green",
          onHand: 10,
        }),
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "disabled-empty",
          brand: "D",
          coating: "HC",
          onHand: 0,
          isDisabled: true,
        }),
        catalogRow({
          lensType: LensType.ORI_VISION,
          lensId: "ov-empty",
          brand: "OV",
          coating: "GREEN",
          onHand: 0,
        }),
      ],
      new Map([
        ["KRYPTOK:held", 4],
        ["PROGRESSIVE:ok", 1],
      ])
    );

    const { enabled } = partitionEnabledCatalog(positions);
    const oos = collectOutOfStockRows(enabled);
    assert.equal(oos.length, 3);
    assert.equal(
      oos.filter((r) => r.classification === "physical").length,
      2
    );
    assert.equal(
      oos.filter((r) => r.classification === "fully_committed").length,
      1
    );

    const payload = inventoryStockToReportPayload(positions, "out-of-stock");
    assert.equal(payload.summary?.affectedSkuCount, 3);
    assert.equal(payload.summary?.physicalOutOfStockCount, 2);
    assert.equal(payload.summary?.fullyCommittedCount, 1);
    assert.equal(payload.summary?.unavailableForOrdersCount, 3);
    assert.equal(payload.summary?.disabledProductCount, 1);
    assert.equal(payload.rows.length, 3);
  });

  it("flags low stock at available <= minStock and skips SKUs without active rules", () => {
    assert.equal(isLowStockAgainstMin(5, 5), true);
    assert.equal(isLowStockAgainstMin(4, 5), true);
    assert.equal(isLowStockAgainstMin(6, 5), false);
    assert.equal(isLowStockAgainstMin(0, 0), true);

    const positions = buildInventoryStockPositions(
      [
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "low",
          brand: "A",
          coating: "HC",
          onHand: 10,
        }),
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "ok",
          brand: "B",
          coating: "HC",
          onHand: 20,
        }),
        catalogRow({
          lensType: LensType.BIFOCAL,
          lensId: "bf-low",
          brand: "STARK",
          item: "HC KT",
          onHand: 2,
        }),
        catalogRow({
          lensType: LensType.SINGLE_VISION,
          lensId: "no-rule",
          brand: "C",
          coating: "HC",
          onHand: 1,
        }),
      ],
      new Map([
        ["SINGLE_VISION:low", 6],
        ["BIFOCAL:bf-low", 2],
      ])
    );
    const { enabled } = partitionEnabledCatalog(positions);
    // low: available 4, min 5 → low; ok: available 20, min 5 → not; bf: available 0, min 1 → low; no-rule omitted
    const low = collectLowStockRows(enabled, [
      {
        lensType: LensType.SINGLE_VISION,
        lensId: "low",
        minStock: 5,
        targetStock: 20,
      },
      {
        lensType: LensType.SINGLE_VISION,
        lensId: "ok",
        minStock: 5,
        targetStock: 20,
      },
      {
        lensType: LensType.BIFOCAL,
        lensId: "bf-low",
        minStock: 1,
        targetStock: 10,
      },
    ]);
    assert.equal(low.length, 2);
    assert.ok(low.some((r) => r.lensId === "low" && r.deficit === 1));
    assert.ok(
      low.some(
        (r) =>
          r.lensId === "bf-low" &&
          r.outOfStockClass === "fully_committed" &&
          r.deficit === 1
      )
    );

    const payload = inventoryStockToReportPayload(positions, "low-stock", {
      reorderRules: [
        {
          lensType: LensType.SINGLE_VISION,
          lensId: "low",
          minStock: 5,
          targetStock: 20,
        },
        {
          lensType: LensType.SINGLE_VISION,
          lensId: "ok",
          minStock: 5,
          targetStock: 20,
        },
        {
          lensType: LensType.BIFOCAL,
          lensId: "bf-low",
          minStock: 1,
          targetStock: 10,
        },
      ],
    });
    assert.equal(payload.summary?.lowStockSkuCount, 2);
    assert.equal(payload.summary?.alsoFullyCommittedCount, 1);
    assert.equal(payload.summary?.activeReorderRuleCount, 3);
  });
});

describe("resolveReportDateRange", () => {
  it("defaults to financial year when from/to omitted", () => {
    const result = resolveReportDateRange({ fy: "25-26" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.range.fromKey, "2025-04-01");
    assert.equal(result.range.toKey, "2026-03-31");
  });

  it("rejects inverted ranges", () => {
    const result = resolveReportDateRange({
      from: "2026-02-01",
      to: "2026-01-01",
    });
    assert.equal(result.ok, false);
  });

  it("rejects ranges beyond the max day cap", () => {
    const result = resolveReportDateRange({
      from: "2024-01-01",
      to: "2026-01-01",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, new RegExp(String(REPORT_MAX_RANGE_DAYS)));
  });

  it("accepts an inclusive 30-day window", () => {
    const result = resolveReportDateRange({
      from: "2026-01-01",
      to: "2026-01-30",
    });
    assert.equal(result.ok, true);
  });
});

describe("agingBucket (receivables parity)", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("buckets 0-30 / 31-60 / 61-90 / 90+", () => {
    assert.equal(agingBucket(new Date("2026-06-01T00:00:00.000Z"), now), "0-30");
    assert.equal(agingBucket(new Date("2026-05-01T00:00:00.000Z"), now), "31-60");
    assert.equal(agingBucket(new Date("2026-04-01T00:00:00.000Z"), now), "61-90");
    assert.equal(agingBucket(new Date("2026-01-01T00:00:00.000Z"), now), "90+");
  });
});

describe("gstSummaryToReportPayload", () => {
  it("preserves net GST as output − input", () => {
    const summary: GstSummaryResult = {
      financialYear: "25-26",
      output: {
        taxable: 1000,
        cgst: 50,
        sgst: 50,
        igst: 0,
        totalGst: 100,
      },
      input: {
        taxable: 200,
        cgst: 10,
        sgst: 10,
        igst: 0,
        totalGst: 20,
      },
      netGstPayable: 80,
    };
    const payload = gstSummaryToReportPayload(summary);
    assert.equal(payload.kind, "cards");
    assert.equal(payload.summary?.netGstPayable, 80);
    assert.equal(payload.cards[2]?.value, 80);
    assert.equal(payload.rows?.length, 2);
  });
});

describe("formatDateKey", () => {
  it("formats local calendar dates as YYYY-MM-DD", () => {
    assert.equal(formatDateKey(new Date(2026, 0, 5)), "2026-01-05");
  });
});

describe("payment collection (no claim double-count)", () => {
  it("tags claim-linked vs direct payments", () => {
    assert.equal(paymentCollectionSource(null), "direct");
    assert.equal(paymentCollectionSource(undefined), "direct");
    assert.equal(paymentCollectionSource("claim_1"), "confirmed_claim");
  });

  it("sums Payment amounts once even when claimId is set", () => {
    const sums = sumPaymentCollectionAmounts([
      { amount: 100, claimId: null },
      { amount: 50, claimId: "c1" },
      { amount: 25.5, claimId: "c2" },
    ]);
    assert.equal(sums.totalCollected, 175.5);
    assert.equal(sums.directAmount, 100);
    assert.equal(sums.claimLinkedAmount, 75.5);
    assert.equal(sums.directCount, 1);
    assert.equal(sums.claimLinkedCount, 2);
  });
});

describe("RX order marker (admin parity)", () => {
  it("matches notes containing [RX Order] only", () => {
    assert.equal(notesIsRxOrder(`[RX Order]\nOD -2.00`), true);
    assert.equal(notesIsRxOrder("Regular order"), false);
    assert.equal(notesIsRxOrder(null), false);
    assert.equal(notesIsRxOrder("[Color Lens]"), false);
    assert.equal(RX_ORDER_NOTES_MARKER, "[RX Order]");
  });
});

describe("monthly sales bucketing", () => {
  it("formats calendar month keys", () => {
    assert.equal(formatMonthKey(new Date(2026, 3, 15)), "2026-04");
  });

  it("aggregates by calendar month on issuedAt", () => {
    const { rows, totals } = bucketInvoicesByMonth(SAMPLE_INVOICES);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.month, "2026-02");
    assert.equal(rows[1]?.month, "2026-01");
    assert.equal(rows[1]?.invoiceCount, 2);
    assert.equal(rows[1]?.taxable, 300);
    assert.equal(rows[1]?.gst, 54);
    assert.equal(totals.invoiceCount, 3);
    assert.equal(totals.total, 413);
  });
});

describe("sales summary vs daily/monthly reconciliation", () => {
  it("matches daily and monthly totals for the same invoices", () => {
    const summary = sumInvoiceSales(SAMPLE_INVOICES);
    const daily = bucketInvoicesByDay(SAMPLE_INVOICES);
    const monthly = bucketInvoicesByMonth(SAMPLE_INVOICES);

    assert.deepEqual(summary, daily.totals);
    assert.deepEqual(summary, monthly.totals);
    assert.equal(summary.invoiceCount, 3);
    assert.equal(summary.taxable, 350);
    assert.equal(summary.gst, 63);
    assert.equal(summary.total, 413);
  });

  it("returns zeros for an empty set", () => {
    assert.deepEqual(sumInvoiceSales([]), {
      invoiceCount: 0,
      taxable: 0,
      gst: 0,
      total: 0,
    });
  });
});

describe("purchase summary vs GST input reconciliation", () => {
  it("sums each bill header once (taxable + GST match GST input fields)", () => {
    const bills = [
      {
        taxableAmount: 1000,
        cgstAmount: 50,
        sgstAmount: 50,
        igstAmount: 0,
        totalAmount: 1100,
      },
      {
        taxableAmount: 200,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 36,
        totalAmount: 236,
      },
    ];
    const totals = sumPurchaseBills(bills);
    // Same reduce as computeGstSummary input side
    const gstInput = bills.reduce(
      (acc, b) => {
        acc.taxable += Number(b.taxableAmount);
        acc.gst +=
          Number(b.cgstAmount) + Number(b.sgstAmount) + Number(b.igstAmount);
        return acc;
      },
      { taxable: 0, gst: 0 }
    );
    assert.equal(totals.billCount, 2);
    assert.equal(totals.taxable, Math.round(gstInput.taxable * 100) / 100);
    assert.equal(totals.gst, Math.round(gstInput.gst * 100) / 100);
    assert.equal(totals.total, 1336);
  });

  it("returns zeros for an empty set", () => {
    assert.deepEqual(sumPurchaseBills([]), {
      billCount: 0,
      taxable: 0,
      gst: 0,
      total: 0,
    });
  });
});

describe("calendar quarter / year boundaries", () => {
  it("maps months to calendar quarters Q1–Q4", () => {
    assert.equal(formatQuarterKey(new Date(2026, 0, 1)), "2026-Q1");
    assert.equal(formatQuarterKey(new Date(2026, 2, 31)), "2026-Q1");
    assert.equal(formatQuarterKey(new Date(2026, 3, 1)), "2026-Q2");
    assert.equal(formatQuarterKey(new Date(2026, 5, 30)), "2026-Q2");
    assert.equal(formatQuarterKey(new Date(2026, 6, 1)), "2026-Q3");
    assert.equal(formatQuarterKey(new Date(2026, 8, 30)), "2026-Q3");
    assert.equal(formatQuarterKey(new Date(2026, 9, 1)), "2026-Q4");
    assert.equal(formatQuarterKey(new Date(2026, 11, 31)), "2026-Q4");
  });

  it("formats calendar years", () => {
    assert.equal(formatYearKey(new Date(2025, 11, 31)), "2025");
    assert.equal(formatYearKey(new Date(2026, 0, 1)), "2026");
  });

  it("reconciles quarter/year totals with daily/monthly for the same set", () => {
    const spanning = [
      ...SAMPLE_INVOICES,
      {
        issuedAt: new Date(2026, 3, 10),
        taxableAmount: 40,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 7.2,
        amount: 47.2,
      },
      {
        issuedAt: new Date(2025, 11, 15),
        taxableAmount: 10,
        cgstAmount: 0.9,
        sgstAmount: 0.9,
        igstAmount: 0,
        amount: 11.8,
      },
    ];
    const summary = sumInvoiceSales(spanning);
    assert.deepEqual(summary, bucketInvoicesByDay(spanning).totals);
    assert.deepEqual(summary, bucketInvoicesByMonth(spanning).totals);
    assert.deepEqual(summary, bucketInvoicesByQuarter(spanning).totals);
    assert.deepEqual(summary, bucketInvoicesByYear(spanning).totals);

    const quarters = bucketInvoicesByQuarter(spanning).rows;
    assert.ok(quarters.some((r) => r.quarter === "2026-Q1"));
    assert.ok(quarters.some((r) => r.quarter === "2026-Q2"));
    assert.ok(quarters.some((r) => r.quarter === "2025-Q4"));

    const years = bucketInvoicesByYear(spanning).rows;
    assert.ok(years.some((r) => r.year === "2026"));
    assert.ok(years.some((r) => r.year === "2025"));
  });
});

describe("sales settlement analysis (invoice balances)", () => {
  it("classifies paid / partial / unpaid from amountPaid and outstanding", () => {
    assert.equal(
      classifyInvoiceSettlement({
        amount: 100,
        amountPaid: 100,
        amountOutstanding: 0,
      }),
      "paid"
    );
    assert.equal(
      classifyInvoiceSettlement({
        amount: 100,
        amountPaid: 40,
        amountOutstanding: 60,
      }),
      "partial"
    );
    assert.equal(
      classifyInvoiceSettlement({
        amount: 100,
        amountPaid: 0,
        amountOutstanding: 100,
      }),
      "unpaid"
    );
    assert.equal(
      classifyInvoiceSettlement({
        amount: 100,
        amountPaid: 99.995,
        amountOutstanding: 0.005,
      }),
      "paid"
    );
  });

  it("does not treat missing payments as unpaid when outstanding is cleared", () => {
    const analysis = analyzeInvoiceSettlement([
      {
        issuedAt: new Date(2026, 0, 1),
        amount: 118,
        amountPaid: 118,
        amountOutstanding: 0,
        status: "PAID",
      },
      {
        issuedAt: new Date(2026, 0, 2),
        amount: 236,
        amountPaid: 100,
        amountOutstanding: 136,
        status: "PARTIALLY_PAID",
      },
      {
        issuedAt: new Date(2026, 0, 3),
        amount: 59,
        amountPaid: 0,
        amountOutstanding: 59,
        status: "ISSUED",
      },
    ]);
    assert.equal(analysis.paidInvoiceCount, 1);
    assert.equal(analysis.paidInvoiceSales, 118);
    assert.equal(analysis.partialInvoiceCount, 1);
    assert.equal(analysis.partialCollected, 100);
    assert.equal(analysis.partialOutstanding, 136);
    assert.equal(analysis.unpaidInvoiceCount, 1);
    assert.equal(analysis.unpaidOutstanding, 59);
    assert.equal(analysis.totalOutstanding, 195);
    assert.equal(analysis.totalCollectedOnInvoices, 218);
  });
});
