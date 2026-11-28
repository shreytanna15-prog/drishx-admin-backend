/**
 * Power-wise Inventory — admin read-only browse (parent → variant → matrix).
 * Spec: docs/stock-management/POWER-WISE-INVENTORY.md
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  buildCatalogMatrix,
  toCatalogMatrixVariants,
  type CatalogMatrixFamilyCaps,
  type CatalogMatrixModel,
} from "@/app/lib/catalog/catalog-matrix";
import {
  getCatalogReservedForPowers,
} from "@/app/lib/catalog/catalog-stock-position";
import {
  encodeStockLeafKey,
} from "@/app/lib/catalog/lens-product-stock-core";
import {
  getLensProduct,
  LensProductServiceError,
} from "@/app/lib/catalog/lens-product-service";
import { formatPowerRangeCompact } from "@/app/lib/catalog/catalog-power-select-options";
import {
  PowerWiseStockError,
  buildPowerWiseLeafCell,
  buildPowerWiseProductName,
  fillMissingPowerWiseCells,
  filterPowerWiseVariants,
  groupPowerWiseVariantsByMatrixSheet,
  isPowerWiseShortage,
  powerWiseMatrixGroupKey,
  powerWiseProductMatchesQuery,
  powerWiseSheetAxis,
  zeroPowerWiseCell,
  type PowerWiseMatrixCell,
  type PowerWiseMatrixGroupRow,
  type PowerWiseUngroupedVariant,
} from "@/app/lib/catalog/power-wise-stock-core";
import { exportSheetsToXlsxBuffer } from "@/app/lib/reports/export-workbook";
import {
  A4_HEIGHT,
  A4_WIDTH,
  PdfDocument,
} from "@/app/lib/pdf/simple-pdf";

export {
  PowerWiseStockError,
  type PowerWiseMatrixCell,
} from "@/app/lib/catalog/power-wise-stock-core";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type PowerWiseProductCard = {
  productId: string;
  name: string;
  familyCode: string;
  familyName: string;
  baseName: string;
  materialName: string | null;
  indexValue: number | null;
  coatingName: string | null;
  colorName: string | null;
  diameterName: string | null;
  progressiveTypeName: string | null;
  familyId: string;
  baseId: string;
  materialId: string | null;
  indexId: string | null;
  coatingId: string | null;
  colorId: string | null;
  diameterId: string | null;
  progressiveTypeId: string | null;
  variantCount: number;
  leafCount: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  totalBlocked: number;
  activeShortagesCount: number;
};

/** Level 2 row — one catalog matrix sheet (range + axis), not one ADD/eye SKU. */
export type PowerWiseVariantRow = PowerWiseMatrixGroupRow;

export type PowerWiseVariantMatrix = {
  productId: string;
  /** URL seed variant; matrix includes all siblings in the same range+axis sheet. */
  variantId: string;
  groupKey: string;
  skuCode: string;
  name: string;
  rangeLabel: string;
  axis: number | null;
  additions: number[];
  eyes: string[];
  variantCount: number;
  family: CatalogMatrixFamilyCaps & { code: string; name: string };
  variants: Array<{
    id: string;
    sphMin: number;
    sphMax: number;
    cylMin: number;
    cylMax: number;
    axis: number | null;
    eye: string | null;
    addition: { value: number | null } | null;
    addMin: number | null;
  }>;
  leaves: Record<string, PowerWiseMatrixCell>;
  matrix: CatalogMatrixModel;
};

export type PowerWiseProductFilters = {
  q?: string;
  familyCode?: string;
  familyId?: string;
  baseId?: string;
  materialId?: string;
  indexId?: string;
  coatingId?: string;
  colorId?: string;
  diameterId?: string;
  progressiveTypeId?: string;
  shortageOnly?: boolean;
};

export type PowerWiseVariantFilters = {
  q?: string;
  includeInactive?: boolean;
  axis?: number;
};

function num(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value.toString());
}

export async function listPowerWiseProducts(
  filters: PowerWiseProductFilters = {},
  client: DbClient = prisma
): Promise<PowerWiseProductCard[]> {
  const where: Prisma.LensProductWhereInput = { isActive: true };
  if (filters.familyId) where.familyId = filters.familyId;
  if (filters.familyCode) where.family = { code: filters.familyCode };
  if (filters.baseId) where.baseId = filters.baseId;
  if (filters.materialId) where.materialId = filters.materialId;
  if (filters.indexId) where.indexId = filters.indexId;
  if (filters.coatingId) where.coatingId = filters.coatingId;
  if (filters.colorId) where.colorId = filters.colorId;
  if (filters.diameterId) where.diameterId = filters.diameterId;
  if (filters.progressiveTypeId) {
    where.progressiveTypeId = filters.progressiveTypeId;
  }

  const [products, rows] = await Promise.all([
    client.lensProduct.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        familyId: true,
        baseId: true,
        materialId: true,
        indexId: true,
        coatingId: true,
        colorId: true,
        diameterId: true,
        progressiveTypeId: true,
        family: { select: { code: true, name: true } },
        base: { select: { name: true } },
        material: { select: { name: true } },
        index: { select: { value: true } },
        coating: { select: { name: true } },
        color: { select: { name: true } },
        diameter: { select: { name: true } },
        progressiveType: { select: { name: true } },
        _count: { select: { variants: { where: { isActive: true } } } },
      },
    }),
    client.lensProductPower.findMany({
      where: {
        lensProductVariant: {
          product: where,
          isActive: true,
        },
      },
      select: {
        id: true,
        quantity: true,
        blockedQty: true,
        minStock: true,
        targetStock: true,
        lensProductVariant: {
          select: { productId: true },
        },
      },
      take: 20000,
    }),
  ]);

  const powerIds = rows.map((r) => r.id);
  const reservedMap = await getCatalogReservedForPowers(powerIds, client);

  const cardMap = new Map<string, PowerWiseProductCard>();
  for (const p of products) {
    const indexValue = p.index?.value != null ? Number(p.index.value) : null;
    cardMap.set(p.id, {
      productId: p.id,
      name: buildPowerWiseProductName([
        p.family.name,
        p.base.name,
        p.material?.name,
        indexValue != null ? indexValue.toFixed(2) : null,
        p.coating?.name,
        p.color?.name,
        p.diameter?.name,
        p.progressiveType?.name,
      ]),
      familyCode: p.family.code,
      familyName: p.family.name,
      baseName: p.base.name,
      materialName: p.material?.name ?? null,
      indexValue,
      coatingName: p.coating?.name ?? null,
      colorName: p.color?.name ?? null,
      diameterName: p.diameter?.name ?? null,
      progressiveTypeName: p.progressiveType?.name ?? null,
      familyId: p.familyId,
      baseId: p.baseId,
      materialId: p.materialId,
      indexId: p.indexId,
      coatingId: p.coatingId,
      colorId: p.colorId,
      diameterId: p.diameterId,
      progressiveTypeId: p.progressiveTypeId,
      variantCount: p._count.variants,
      leafCount: 0,
      totalOnHand: 0,
      totalReserved: 0,
      totalAvailable: 0,
      totalBlocked: 0,
      activeShortagesCount: 0,
    });
  }

  for (const row of rows) {
    const productId = row.lensProductVariant.productId;
    const card = cardMap.get(productId);
    if (!card) continue;
    const reservedQty = reservedMap.get(row.id) ?? 0;
    const leaf = buildPowerWiseLeafCell({
      onHand: row.quantity,
      blockedQty: row.blockedQty,
      reservedQty,
    });
    card.leafCount += 1;
    card.totalOnHand += leaf.onHand;
    card.totalReserved += leaf.reserved;
    card.totalAvailable += leaf.available;
    card.totalBlocked += leaf.blocked;
    if (
      isPowerWiseShortage({
        available: leaf.available,
        minStock: row.minStock,
        targetStock: row.targetStock,
      })
    ) {
      card.activeShortagesCount += 1;
    }
  }

  let cards = Array.from(cardMap.values());
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    cards = cards.filter((card) => powerWiseProductMatchesQuery(card, q));
  }
  if (filters.shortageOnly) {
    cards = cards.filter((card) => card.activeShortagesCount > 0);
  }
  return cards;
}

export async function listPowerWiseVariants(
  productId: string,
  filters: PowerWiseVariantFilters = {},
  client: DbClient = prisma
): Promise<{
  product: {
    productId: string;
    name: string;
    familyCode: string;
    familyName: string;
  };
  variants: PowerWiseVariantRow[];
}> {
  let product;
  try {
    product = await getLensProduct(productId);
  } catch (err) {
    if (err instanceof LensProductServiceError) {
      throw new PowerWiseStockError(err.message, err.status, err.code);
    }
    throw err;
  }

  const includeInactive = filters.includeInactive === true;
  const variantWhere: Prisma.LensProductVariantWhereInput = {
    productId,
  };
  if (!includeInactive) variantWhere.isActive = true;

  const variants = await client.lensProductVariant.findMany({
    where: variantWhere,
    orderBy: [{ skuCode: "asc" }],
    select: {
      id: true,
      skuCode: true,
      name: true,
      isActive: true,
      sphMin: true,
      sphMax: true,
      cylMin: true,
      cylMax: true,
      axis: true,
      eye: true,
      addition: { select: { value: true } },
    },
  });

  const variantIds = variants.map((v) => v.id);
  const powers =
    variantIds.length === 0
      ? []
      : await client.lensProductPower.findMany({
          where: { lensProductVariantId: { in: variantIds } },
          select: {
            id: true,
            quantity: true,
            blockedQty: true,
            lensProductVariantId: true,
          },
        });

  const reservedMap = await getCatalogReservedForPowers(
    powers.map((p) => p.id),
    client
  );

  const rollup = new Map<
    string,
    {
      totalOnHand: number;
      totalReserved: number;
      totalAvailable: number;
      totalBlocked: number;
    }
  >();
  for (const id of variantIds) {
    rollup.set(id, {
      totalOnHand: 0,
      totalReserved: 0,
      totalAvailable: 0,
      totalBlocked: 0,
    });
  }
  for (const power of powers) {
    const bucket = rollup.get(power.lensProductVariantId);
    if (!bucket) continue;
    const reservedQty = reservedMap.get(power.id) ?? 0;
    const leaf = buildPowerWiseLeafCell({
      onHand: power.quantity,
      blockedQty: power.blockedQty,
      reservedQty,
    });
    bucket.totalOnHand += leaf.onHand;
    bucket.totalReserved += leaf.reserved;
    bucket.totalAvailable += leaf.available;
    bucket.totalBlocked += leaf.blocked;
  }

  const mapped: PowerWiseUngroupedVariant[] = variants.map((v) => {
    const sphMin = Number(v.sphMin);
    const sphMax = Number(v.sphMax);
    const cylMin = Number(v.cylMin);
    const cylMax = Number(v.cylMax);
    const totals = rollup.get(v.id)!;
    return {
      id: v.id,
      skuCode: v.skuCode,
      name: v.name,
      isActive: v.isActive,
      sphMin,
      sphMax,
      cylMin,
      cylMax,
      axis: v.axis,
      eye: v.eye,
      addition: num(v.addition?.value),
      rangeLabel: formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax),
      ...totals,
    };
  });

  const grouped = groupPowerWiseVariantsByMatrixSheet(mapped);
  const rows = filterPowerWiseVariants(grouped, {
    q: filters.q,
    axis: filters.axis,
  });

  return {
    product: {
      productId: product.id,
      name: buildPowerWiseProductName([
        product.family.name,
        product.base.name,
        product.material?.name,
        product.index?.value != null
          ? Number(product.index.value).toFixed(2)
          : null,
        product.coating?.name,
        product.color?.name,
      ]),
      familyCode: product.family.code,
      familyName: product.family.name,
    },
    variants: rows,
  };
}

export async function getPowerWiseVariantMatrix(
  productId: string,
  variantId: string,
  client: DbClient = prisma
): Promise<PowerWiseVariantMatrix> {
  let product;
  try {
    product = await getLensProduct(productId);
  } catch (err) {
    if (err instanceof LensProductServiceError) {
      throw new PowerWiseStockError(err.message, err.status, err.code);
    }
    throw err;
  }

  const seed = product.variants.find((v) => v.id === variantId);
  if (!seed) {
    throw new PowerWiseStockError(
      "Variant not found on this product.",
      404,
      "NOT_FOUND"
    );
  }

  const groupKey = powerWiseMatrixGroupKey(seed);
  const sheetAxis = powerWiseSheetAxis(seed);

  // Same sheet as catalog matrix: all ADD/eye siblings for this range+axis.
  const sheetVariants = product.variants.filter(
    (v) => powerWiseMatrixGroupKey(v) === groupKey
  );

  const sheetVariantIds = sheetVariants.map((v) => v.id);
  const powerRows = await client.lensProductPower.findMany({
    where: { lensProductVariantId: { in: sheetVariantIds } },
  });
  const reservedMap = await getCatalogReservedForPowers(
    powerRows.map((r) => r.id),
    client
  );

  const leaves: Record<string, PowerWiseMatrixCell> = {};
  for (const row of powerRows) {
    const sph = Number(row.sph);
    const cyl = Number(row.cyl);
    const reservedQty = reservedMap.get(row.id) ?? 0;
    leaves[encodeStockLeafKey(row.lensProductVariantId, sph, cyl)] =
      buildPowerWiseLeafCell({
        onHand: row.quantity,
        blockedQty: row.blockedQty,
        reservedQty,
      });
  }

  const family: CatalogMatrixFamilyCaps & { code: string; name: string } = {
    code: product.family.code,
    name: product.family.name,
    supportsAdd: product.family.supportsAdd,
    supportsAxis: product.family.supportsAxis,
    supportsEye: product.family.supportsEye,
  };

  const variantInputs = sheetVariants.map((v) => ({
    id: v.id,
    sphMin: v.sphMin,
    sphMax: v.sphMax,
    cylMin: v.cylMin,
    cylMax: v.cylMax,
    axis: v.axis,
    eye: v.eye,
    addition: v.addition,
    addMin: v.addMin,
  }));

  const matrix = buildCatalogMatrix(
    toCatalogMatrixVariants(variantInputs),
    family,
    { familyLabel: product.family.name }
  );

  fillMissingPowerWiseCells(matrix.sheets, leaves);

  const additions = [
    ...new Set(
      sheetVariants
        .map((v) =>
          v.addition?.value != null ? Number(v.addition.value) : null
        )
        .filter((v): v is number => v != null && Number.isFinite(v))
    ),
  ].toSorted((a, b) => a - b);

  const eyes = [
    ...new Set(
      sheetVariants
        .map((v) => {
          if (!v.eye) return null;
          const upper = v.eye.trim().toUpperCase();
          if (upper === "RIGHT" || upper === "RE") return "RE";
          if (upper === "LEFT" || upper === "LE") return "LE";
          return upper;
        })
        .filter((v): v is string => Boolean(v))
    ),
  ].toSorted((a, b) => a.localeCompare(b));

  const titleParts = [
    seed.rangeLabel,
    sheetAxis != null ? `Axis ${sheetAxis}` : null,
  ].filter(Boolean);

  return {
    productId: product.id,
    variantId: seed.id,
    groupKey,
    skuCode: seed.skuCode,
    name: titleParts.join(" · ") || seed.name,
    rangeLabel: seed.rangeLabel,
    axis: sheetAxis,
    additions,
    eyes,
    variantCount: sheetVariants.length,
    family,
    variants: variantInputs,
    leaves,
    matrix,
  };
}

function matrixExportRows(data: PowerWiseVariantMatrix): Array<Array<string | number | null>> {
  const rows: Array<Array<string | number | null>> = [];
  for (const sheet of data.matrix.sheets) {
    rows.push([`Sheet: ${sheet.title}`]);
    rows.push([
      ...sheet.stubColumns.map((s) => s.label),
      ...sheet.dataColumns.map((c) => c.label),
    ]);
    for (const row of sheet.rows) {
      const line: Array<string | number | null> = sheet.stubColumns.map(
        (stub) => row.stub[stub.key] ?? "—"
      );
      for (const col of sheet.dataColumns) {
        const cell = row.cells[col.key];
        if (!cell || !cell.allowed) {
          line.push("×");
          continue;
        }
        if (!cell.present || !cell.variantId) {
          line.push("");
          continue;
        }
        const key = encodeStockLeafKey(
          cell.variantId,
          cell.cellKey.sph,
          cell.cellKey.cyl
        );
        const leaf = data.leaves[key] ?? zeroPowerWiseCell();
        line.push(
          `OH ${leaf.onHand} / R ${leaf.reserved} / Av ${leaf.available} / Bl ${leaf.blocked}`
        );
      }
      rows.push(line);
    }
    rows.push([]);
  }
  return rows;
}

export async function exportPowerWiseVariantMatrix(
  productId: string,
  variantId: string,
  format: "xlsx" | "pdf"
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const data = await getPowerWiseVariantMatrix(productId, variantId);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `power-wise-${data.skuCode.replace(/[^\w.-]+/g, "_")}-${stamp}`;

  if (format === "xlsx") {
    const buffer = await exportSheetsToXlsxBuffer([
      {
        name: data.skuCode.slice(0, 31) || "Matrix",
        headers: [
          "SKU",
          data.skuCode,
          "Range",
          data.rangeLabel,
          "Axis",
          data.axis != null ? String(data.axis) : "",
          "Eye",
          data.eyes.join(", "),
          "ADD",
          data.additions.map((n) => n.toFixed(2)).join(", "),
        ],
        rows: [
          ["On-hand / Reserved / Available / Blocked per cell"],
          [],
          ...matrixExportRows(data),
        ],
      },
    ]);
    return {
      buffer,
      fileName: `${base}.xlsx`,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  const doc = new PdfDocument();
  let page = doc.addPage();
  let y = 40;
  const left = 36;
  const writeLine = (text: string, opts?: { bold?: boolean; size?: number }) => {
    if (y > A4_HEIGHT - 48) {
      page = doc.addPage();
      y = 40;
    }
    page.text(left, y, text, {
      size: opts?.size ?? 9,
      bold: opts?.bold,
      maxWidth: A4_WIDTH - left * 2,
    });
    y += opts?.size ? opts.size + 4 : 12;
  };

  writeLine("Power-wise Inventory — stock matrix", { bold: true, size: 12 });
  writeLine(`${data.skuCode} · ${data.name}`);
  writeLine(
    `Range ${data.rangeLabel}${data.axis != null ? ` · Axis ${data.axis}` : ""}${
      data.eyes.length > 0 ? ` · Eye ${data.eyes.join(", ")}` : ""
    }${
      data.additions.length > 0
        ? ` · ADD ${data.additions.map((n) => n.toFixed(2)).join(", ")}`
        : ""
    }`
  );
  writeLine("Cells: On-hand / Reserved / Available / Blocked");
  y += 6;

  for (const sheet of data.matrix.sheets) {
    writeLine(sheet.title, { bold: true, size: 10 });
    for (const row of sheet.rows) {
      const stub = sheet.stubColumns
        .map((s) => `${s.label} ${row.stub[s.key] ?? "—"}`)
        .join(" ");
      const parts: string[] = [];
      for (const col of sheet.dataColumns) {
        const cell = row.cells[col.key];
        if (!cell || !cell.allowed) {
          parts.push(`${col.label}=×`);
          continue;
        }
        if (!cell.present || !cell.variantId) continue;
        const key = encodeStockLeafKey(
          cell.variantId,
          cell.cellKey.sph,
          cell.cellKey.cyl
        );
        const leaf = data.leaves[key] ?? zeroPowerWiseCell();
        parts.push(
          `${col.label}=${leaf.onHand}/${leaf.reserved}/${leaf.available}/${leaf.blocked}`
        );
      }
      if (parts.length > 0) writeLine(`${stub}  ${parts.join("  ")}`);
    }
    y += 4;
  }

  return {
    buffer: doc.toBuffer(),
    fileName: `${base}.pdf`,
    contentType: "application/pdf",
  };
}
