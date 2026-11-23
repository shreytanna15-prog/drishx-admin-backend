/**
 * Stock S1 — catalog matrix live Current / Threshold / Target.
 *
 * Leaf identity: (lensProductVariantId, sph, cyl). Axis/ADD/eye stay on the variant.
 * Current (quantity) is read-only here; only minStock / targetStock are upserted.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  type AuditActor,
  type AuditRequestContext,
  AuditAction,
  AuditModule,
  diffFields,
  recordAuditEvent,
} from "@/app/lib/audit";
import {
  buildCatalogMatrix,
  toCatalogMatrixVariants,
  type CatalogMatrixFamilyCaps,
  type CatalogMatrixModel,
} from "@/app/lib/catalog/catalog-matrix";
import { getLensProduct } from "@/app/lib/catalog/lens-product-service";
import {
  assertCellEditableOnMatrix,
  CatalogStockError,
  encodeStockLeafKey,
  normalizeStockPower,
  validateCatalogStockQuantities,
} from "@/app/lib/catalog/lens-product-stock-core";

export {
  assertCellEditableOnMatrix,
  CatalogStockError,
  encodeStockLeafKey,
  normalizeStockPower,
  validateCatalogStockQuantities,
} from "@/app/lib/catalog/lens-product-stock-core";

export type CatalogStockLeafDto = {
  id: string;
  variantId: string;
  sph: number;
  cyl: number;
  /** On hand — never free-edited in S1. */
  current: number;
  blockedQty: number;
  minStock: number;
  targetStock: number;
  updatedAt: string;
};

export type CatalogMatrixStockResponse = {
  productId: string;
  family: CatalogMatrixFamilyCaps & { name: string };
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
  /** Leaves keyed by encodeStockLeafKey(variantId, sph, cyl). Missing → display 0 / –. */
  leaves: Record<string, CatalogStockLeafDto>;
  matrix: CatalogMatrixModel;
};

export type CatalogMatrixRuleEdit = {
  variantId: string;
  sph: number;
  cyl: number;
  minStock: number;
  targetStock: number;
};

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(normalizeStockPower(value).toFixed(2));
}

function num(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

function serializeLeaf(row: {
  id: string;
  lensProductVariantId: string;
  sph: Prisma.Decimal;
  cyl: Prisma.Decimal;
  quantity: number;
  blockedQty: number;
  minStock: number;
  targetStock: number;
  updatedAt: Date;
}): CatalogStockLeafDto {
  const sph = num(row.sph);
  const cyl = num(row.cyl);
  return {
    id: row.id,
    variantId: row.lensProductVariantId,
    sph,
    cyl,
    current: row.quantity,
    blockedQty: row.blockedQty,
    minStock: row.minStock,
    targetStock: row.targetStock,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getCatalogProductMatrixStock(
  productId: string
): Promise<CatalogMatrixStockResponse> {
  const product = await getLensProduct(productId);
  const variantIds = product.variants.map((v) => v.id);

  const rows =
    variantIds.length === 0
      ? []
      : await prisma.lensProductPower.findMany({
          where: { lensProductVariantId: { in: variantIds } },
        });

  const leaves: Record<string, CatalogStockLeafDto> = {};
  for (const row of rows) {
    const dto = serializeLeaf(row);
    leaves[encodeStockLeafKey(dto.variantId, dto.sph, dto.cyl)] = dto;
  }

  const family: CatalogMatrixFamilyCaps & { name: string } = {
    name: product.family.name,
    supportsAdd: product.family.supportsAdd,
    supportsAxis: product.family.supportsAxis,
    supportsEye: product.family.supportsEye,
  };

  const variants = product.variants.map((v) => ({
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

  const matrix = buildCatalogMatrix(toCatalogMatrixVariants(variants), family, {
    familyLabel: product.family.name,
  });

  return {
    productId: product.id,
    family,
    variants,
    leaves,
    matrix,
  };
}

export async function saveCatalogProductMatrixRules(input: {
  productId: string;
  edits: CatalogMatrixRuleEdit[];
  actor: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<{ leaves: CatalogStockLeafDto[]; updated: number }> {
  if (!Array.isArray(input.edits) || input.edits.length === 0) {
    throw new CatalogStockError("edits must be a non-empty array.", 400, "VALIDATION");
  }
  if (input.edits.length > 500) {
    throw new CatalogStockError("Too many edits in one request (max 500).", 400, "VALIDATION");
  }

  const product = await getLensProduct(input.productId);
  const variantById = new Map(product.variants.map((v) => [v.id, v]));

  const family: CatalogMatrixFamilyCaps = {
    supportsAdd: product.family.supportsAdd,
    supportsAxis: product.family.supportsAxis,
    supportsEye: product.family.supportsEye,
  };
  const matrix = buildCatalogMatrix(
    toCatalogMatrixVariants(
      product.variants.map((v) => ({
        id: v.id,
        sphMin: v.sphMin,
        sphMax: v.sphMax,
        cylMin: v.cylMin,
        cylMax: v.cylMax,
        axis: v.axis,
        eye: v.eye,
        addition: v.addition,
        addMin: v.addMin,
      }))
    ),
    family,
    { familyLabel: product.family.name }
  );

  const normalized: CatalogMatrixRuleEdit[] = [];
  const seen = new Set<string>();
  for (const raw of input.edits) {
    const variantId = String(raw.variantId ?? "").trim();
    if (!variantId || !variantById.has(variantId)) {
      throw new CatalogStockError(
        `Unknown variantId for this product: ${variantId || "(empty)"}`,
        400,
        "VARIANT_NOT_FOUND",
        { variantId }
      );
    }
    const sph = normalizeStockPower(Number(raw.sph));
    const cyl = normalizeStockPower(Number(raw.cyl));
    const minStock = Number(raw.minStock);
    const targetStock = Number(raw.targetStock);
    const qtyError = validateCatalogStockQuantities(minStock, targetStock);
    if (qtyError) {
      throw new CatalogStockError(qtyError, 400, "VALIDATION", {
        variantId,
        sph,
        cyl,
      });
    }
    assertCellEditableOnMatrix(matrix, variantId, sph, cyl);
    const key = encodeStockLeafKey(variantId, sph, cyl);
    if (seen.has(key)) {
      throw new CatalogStockError(
        `Duplicate edit for ${key}.`,
        400,
        "DUPLICATE_EDIT",
        { key }
      );
    }
    seen.add(key);
    normalized.push({ variantId, sph, cyl, minStock, targetStock });
  }

  const results: CatalogStockLeafDto[] = [];

  await prisma.$transaction(async (tx) => {
    for (const edit of normalized) {
      const existing = await tx.lensProductPower.findUnique({
        where: {
          lensProductVariantId_sph_cyl: {
            lensProductVariantId: edit.variantId,
            sph: dec(edit.sph),
            cyl: dec(edit.cyl),
          },
        },
      });

      const before = existing
        ? {
            minStock: existing.minStock,
            targetStock: existing.targetStock,
            quantity: existing.quantity,
          }
        : null;

      const row = existing
        ? await tx.lensProductPower.update({
            where: { id: existing.id },
            data: {
              minStock: edit.minStock,
              targetStock: edit.targetStock,
            },
          })
        : await tx.lensProductPower.create({
            data: {
              lensProductVariantId: edit.variantId,
              sph: dec(edit.sph),
              cyl: dec(edit.cyl),
              minStock: edit.minStock,
              targetStock: edit.targetStock,
              quantity: 0,
              blockedQty: 0,
            },
          });

      const after = {
        minStock: row.minStock,
        targetStock: row.targetStock,
        quantity: row.quantity,
      };

      if (
        !before ||
        before.minStock !== after.minStock ||
        before.targetStock !== after.targetStock
      ) {
        const variant = variantById.get(edit.variantId);
        await recordAuditEvent(tx, {
          action: AuditAction.REORDER_RULE_CHANGED,
          module: AuditModule.INVENTORY,
          entityType: "LensProductPower",
          entityId: row.id,
          actor: input.actor,
          request: input.request ?? null,
          changes: diffFields(
            (before ?? {}) as Record<string, unknown>,
            after as Record<string, unknown>,
            ["minStock", "targetStock"]
          ),
          context: {
            productId: input.productId,
            variantId: edit.variantId,
            skuCode: variant?.skuCode ?? null,
            sph: edit.sph,
            cyl: edit.cyl,
          },
          activityMessage: `Catalog stock rules updated — ${variant?.skuCode ?? edit.variantId} ${edit.sph.toFixed(2)}/${edit.cyl.toFixed(2)}`,
        });
      }

      results.push(serializeLeaf(row));
    }
  });

  return { leaves: results, updated: results.length };
}
