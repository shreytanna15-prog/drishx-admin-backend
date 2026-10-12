import { LensType } from "@prisma/client";
import { ACTIVE_RESERVATION_STATUSES } from "@/app/lib/order-inventory";
import { orderLensIdField } from "@/app/lib/procurement-rules";
import { prisma } from "@/app/lib/prisma";
import {
  SUPPORTED_INVENTORY_REPORT_LENS_TYPES,
  aggregateCommittedByLens,
  buildInventoryStockPositions,
  inventoryStockToReportPayload,
  type ActiveReorderRuleInput,
  type InventoryCatalogRowInput,
  type InventoryOrderCommitInput,
  type InventoryStockPosition,
  type InventoryStockReportMode,
} from "./inventory-stock-format";
import { stockValuationToReportPayload } from "./stock-valuation-format";
import type { ReportCardsPayload, ReportTablePayload } from "./types";

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadSupportedCatalogRows(): Promise<InventoryCatalogRowInput[]> {
  const [sv, kryptok, progressive, oriVision, magnus, bifocal] =
    await Promise.all([
      prisma.singleVisionLens.findMany({
        select: {
          id: true,
          category: true,
          brand: true,
          item: true,
          coating: true,
          index: true,
          sph: true,
          cyl: true,
          crossPower: true,
          costPrice: true,
          price: true,
          quantity: true,
          isDisabled: true,
        },
      }),
      prisma.kryptokLens.findMany({
        select: {
          id: true,
          category: true,
          brand: true,
          item: true,
          coating: true,
          sph: true,
          cyl: true,
          add: true,
          axis: true,
          crossPower: true,
          costPrice: true,
          price: true,
          quantity: true,
          isDisabled: true,
        },
      }),
      prisma.progressiveLens.findMany({
        select: {
          id: true,
          category: true,
          brand: true,
          item: true,
          coating: true,
          type: true,
          index: true,
          sph: true,
          cyl: true,
          add: true,
          axis: true,
          eye: true,
          costPrice: true,
          price: true,
          quantity: true,
          isDisabled: true,
        },
      }),
      prisma.oriVisionLens.findMany({
        select: {
          id: true,
          category: true,
          brand: true,
          item: true,
          coating: true,
          index: true,
          sph: true,
          cyl: true,
          price: true,
          quantity: true,
        },
      }),
      prisma.magnusLens.findMany({
        select: {
          id: true,
          category: true,
          item: true,
          coating: true,
          index: true,
          sph: true,
          cyl: true,
          add: true,
          axis: true,
          price: true,
          quantity: true,
        },
      }),
      prisma.bifocalLens.findMany({
        select: {
          id: true,
          brand: true,
          item: true,
          coating: true,
          sph: true,
          cyl: true,
          add: true,
          axis: true,
          price: true,
          quantity: true,
        },
      }),
    ]);

  const rows: InventoryCatalogRowInput[] = [];

  for (const lens of sv) {
    rows.push({
      lensType: LensType.SINGLE_VISION,
      lensId: lens.id,
      category: lens.category,
      brand: lens.brand,
      item: lens.item,
      coating: lens.coating,
      progressiveType: null,
      index: num(lens.index),
      sph: num(lens.sph),
      cyl: num(lens.cyl),
      add: null,
      axis: null,
      eye: null,
      crossPower: num(lens.crossPower),
      onHand: lens.quantity,
      isDisabled: lens.isDisabled,
      costPrice: num(lens.costPrice),
      sellingPrice: num(lens.price),
    });
  }

  for (const lens of kryptok) {
    rows.push({
      lensType: LensType.KRYPTOK,
      lensId: lens.id,
      category: lens.category,
      brand: lens.brand,
      item: lens.item,
      coating: lens.coating,
      progressiveType: null,
      index: null,
      sph: num(lens.sph),
      cyl: num(lens.cyl),
      add: num(lens.add),
      axis: lens.axis,
      eye: null,
      crossPower: num(lens.crossPower),
      onHand: lens.quantity,
      isDisabled: lens.isDisabled,
      costPrice: num(lens.costPrice),
      sellingPrice: num(lens.price),
    });
  }

  for (const lens of progressive) {
    rows.push({
      lensType: LensType.PROGRESSIVE,
      lensId: lens.id,
      category: lens.category,
      brand: lens.brand,
      item: lens.item,
      coating: lens.coating,
      progressiveType: lens.type,
      index: num(lens.index),
      sph: num(lens.sph),
      cyl: num(lens.cyl),
      add: num(lens.add),
      axis: lens.axis,
      eye: lens.eye,
      crossPower: null,
      onHand: lens.quantity,
      isDisabled: lens.isDisabled,
      costPrice: num(lens.costPrice),
      sellingPrice: num(lens.price),
    });
  }

  for (const lens of oriVision) {
    rows.push({
      lensType: LensType.ORI_VISION,
      lensId: lens.id,
      category: lens.category,
      brand: lens.brand,
      item: lens.item,
      coating: lens.coating,
      progressiveType: null,
      index: num(lens.index),
      sph: num(lens.sph),
      cyl: num(lens.cyl),
      add: null,
      axis: null,
      eye: null,
      crossPower: null,
      onHand: lens.quantity,
      isDisabled: false,
      costPrice: null,
      sellingPrice: num(lens.price),
    });
  }

  for (const lens of magnus) {
    rows.push({
      lensType: LensType.MAGNUS,
      lensId: lens.id,
      category: lens.category,
      brand: null,
      item: lens.item,
      coating: lens.coating,
      progressiveType: null,
      index: num(lens.index),
      sph: num(lens.sph),
      cyl: num(lens.cyl),
      add: num(lens.add),
      axis: lens.axis,
      eye: null,
      crossPower: null,
      onHand: lens.quantity,
      isDisabled: false,
      costPrice: null,
      sellingPrice: num(lens.price),
    });
  }

  for (const lens of bifocal) {
    rows.push({
      lensType: LensType.BIFOCAL,
      lensId: lens.id,
      category: null,
      brand: lens.brand,
      item: lens.item,
      coating: lens.coating,
      progressiveType: null,
      index: null,
      sph: num(lens.sph),
      cyl: num(lens.cyl),
      add: num(lens.add),
      axis: lens.axis,
      eye: null,
      crossPower: null,
      onHand: lens.quantity,
      isDisabled: false,
      costPrice: null,
      sellingPrice: num(lens.price),
    });
  }

  return rows;
}

/**
 * One batched query for open reservations across all report lens families.
 * Resolves lens id via the same Order FK map as procurement (orderLensIdField).
 */
async function loadBatchedCommittedOrders(): Promise<
  InventoryOrderCommitInput[]
> {
  const orders = await prisma.order.findMany({
    where: {
      lensType: { in: [...SUPPORTED_INVENTORY_REPORT_LENS_TYPES] },
      status: { in: ACTIVE_RESERVATION_STATUSES },
    },
    select: {
      lensType: true,
      singleVisionLensId: true,
      kryptokLensId: true,
      progressiveLensId: true,
      oriVisionLensId: true,
      magnusLensId: true,
      bifocalLensId: true,
      reservedQuantity: true,
      pickedQuantity: true,
    },
  });

  return orders.map((order) => {
    const field = orderLensIdField(order.lensType);
    const lensId = order[field] ?? null;
    return {
      lensType: order.lensType,
      lensId,
      reservedQuantity: order.reservedQuantity,
      pickedQuantity: order.pickedQuantity,
    };
  });
}

/** Batched load of active reorder rules (isActive only — no autoProcure filter). */
async function loadActiveReorderRules(): Promise<ActiveReorderRuleInput[]> {
  const rules = await prisma.reorderRule.findMany({
    where: { isActive: true },
    select: {
      lensType: true,
      lensId: true,
      minStock: true,
      targetStock: true,
    },
  });
  return rules.map((rule) => ({
    lensType: rule.lensType,
    lensId: rule.lensId,
    minStock: rule.minStock,
    targetStock: rule.targetStock,
  }));
}

async function loadInventoryPositions(): Promise<InventoryStockPosition[]> {
  const [catalog, orders] = await Promise.all([
    loadSupportedCatalogRows(),
    loadBatchedCommittedOrders(),
  ]);
  const committedByKey = aggregateCommittedByLens(orders);
  return buildInventoryStockPositions(catalog, committedByKey);
}

export type InventoryStockRunOptions = {
  rowLimit?: number;
};

async function computeInventoryStockReport(
  mode: InventoryStockReportMode,
  runOptions?: InventoryStockRunOptions
): Promise<ReportTablePayload> {
  const formatOptions = {
    ...(runOptions?.rowLimit != null ? { rowLimit: runOptions.rowLimit } : {}),
  };

  if (mode === "low-stock") {
    const [positions, reorderRules] = await Promise.all([
      loadInventoryPositions(),
      loadActiveReorderRules(),
    ]);
    return inventoryStockToReportPayload(positions, mode, {
      ...formatOptions,
      reorderRules,
    });
  }

  const positions = await loadInventoryPositions();
  return inventoryStockToReportPayload(positions, mode, formatOptions);
}

export async function computeCurrentStockReport(
  runOptions?: InventoryStockRunOptions
): Promise<ReportTablePayload> {
  return computeInventoryStockReport("current", runOptions);
}

export async function computeReservedStockReport(
  runOptions?: InventoryStockRunOptions
): Promise<ReportTablePayload> {
  return computeInventoryStockReport("reserved", runOptions);
}

export async function computeAvailableStockReport(
  runOptions?: InventoryStockRunOptions
): Promise<ReportTablePayload> {
  return computeInventoryStockReport("available", runOptions);
}

export async function computeProductWiseStockReport(
  runOptions?: InventoryStockRunOptions
): Promise<ReportTablePayload> {
  return computeInventoryStockReport("product", runOptions);
}

export async function computePowerWiseStockReport(
  runOptions?: InventoryStockRunOptions
): Promise<ReportTablePayload> {
  return computeInventoryStockReport("power", runOptions);
}

export async function computeOutOfStockReport(
  runOptions?: InventoryStockRunOptions
): Promise<ReportTablePayload> {
  return computeInventoryStockReport("out-of-stock", runOptions);
}

export async function computeLowStockReport(
  runOptions?: InventoryStockRunOptions
): Promise<ReportTablePayload> {
  return computeInventoryStockReport("low-stock", runOptions);
}

/**
 * Stock Valuation: on-hand × costPrice and on-hand × selling price (catalog `price`).
 * Read-only catalog load; does not use reservation math. Disabled SKUs counted only.
 */
export async function computeStockValuationReport(
  runOptions?: InventoryStockRunOptions
): Promise<ReportCardsPayload> {
  const catalog = await loadSupportedCatalogRows();
  return stockValuationToReportPayload(catalog, {
    ...(runOptions?.rowLimit != null ? { rowLimit: runOptions.rowLimit } : {}),
  });
}
