/**
 * RW-09 LensProduct SKU master (docs/product-catalog).
 * No power-leaf / stock insert in this slice.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AuditAction, AuditModule, recordAuditEvent } from "../audit";
import {
  assertMaterialAllowedForBase,
  LensAttributeServiceError,
} from "./lens-attribute-service";
import { steppedRange } from "./lens-product-range";
import { buildLensProductSkuCode } from "./lens-product-sku";

export { steppedRange };
export { buildLensProductSkuCode } from "./lens-product-sku";

export class LensProductServiceError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    code = "LENS_PRODUCT_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LensProductServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function ensureBaseMaterialCompat(baseId: string, materialId: string) {
  try {
    await assertMaterialAllowedForBase(baseId, materialId);
  } catch (err) {
    if (err instanceof LensAttributeServiceError) {
      throw new LensProductServiceError(err.message, err.status, err.code);
    }
    throw err;
  }
}

const productInclude = {
  family: true,
  base: true,
  material: true,
  index: true,
  coating: true,
  color: true,
} as const;

type ProductWithAttrs = Prisma.LensProductGetPayload<{
  include: typeof productInclude;
}>;

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function num(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  return Number(d);
}

export function serializeLensProduct(row: ProductWithAttrs) {
  return {
    id: row.id,
    skuCode: row.skuCode,
    name: row.name,
    familyId: row.familyId,
    baseId: row.baseId,
    materialId: row.materialId,
    indexId: row.indexId,
    coatingId: row.coatingId,
    colorId: row.colorId,
    rangeType: row.rangeType,
    sphMin: Number(row.sphMin),
    sphMax: Number(row.sphMax),
    cylMin: Number(row.cylMin),
    cylMax: Number(row.cylMax),
    addMin: num(row.addMin),
    addMax: num(row.addMax),
    axis: row.axis,
    eye: row.eye,
    defaultPrice: num(row.defaultPrice),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    family: {
      id: row.family.id,
      code: row.family.code,
      name: row.family.name,
    },
    base: { id: row.base.id, code: row.base.code, name: row.base.name },
    material: {
      id: row.material.id,
      code: row.material.code,
      name: row.material.name,
    },
    index: row.index
      ? {
          id: row.index.id,
          code: row.index.code,
          name: row.index.name,
          value: num(row.index.value),
        }
      : null,
    coating: row.coating
      ? { id: row.coating.id, code: row.coating.code, name: row.coating.name }
      : null,
    color: row.color
      ? { id: row.color.id, code: row.color.code, name: row.color.name }
      : null,
    attributeSummary: [
      row.family.code,
      row.base.code,
      row.material.code,
      row.index?.code,
      row.coating?.code,
      row.color?.code,
    ]
      .filter(Boolean)
      .join(" · "),
    rangeSummary: `SPH ${Number(row.sphMin)}…${Number(row.sphMax)} / CYL ${Number(row.cylMin)}…${Number(row.cylMax)}`,
  };
}

function requireFinite(label: string, value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new LensProductServiceError(`${label} must be a number.`);
  }
  return n;
}

function validateRange(bounds: {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
}) {
  if (bounds.sphMin > bounds.sphMax) {
    throw new LensProductServiceError(
      "sphMin must be less than or equal to sphMax.",
      400,
      "INVALID_RANGE"
    );
  }
  if (bounds.cylMin > bounds.cylMax) {
    throw new LensProductServiceError(
      "cylMin must be less than or equal to cylMax.",
      400,
      "INVALID_RANGE"
    );
  }
}

async function assertActiveFk(
  label: string,
  id: string | null | undefined,
  loader: (id: string) => Promise<{ isActive: boolean } | null>
) {
  if (!id) return;
  const row = await loader(id);
  if (!row) {
    throw new LensProductServiceError(`${label} not found.`, 400, "INVALID_FK");
  }
  if (!row.isActive) {
    throw new LensProductServiceError(
      `${label} is inactive and cannot be used.`,
      400,
      "INACTIVE_FK"
    );
  }
}

export type CreateLensProductInput = {
  /** Ignored when present — SKU is generated from attribute codes + range. */
  skuCode?: string | null;
  name: string;
  familyId: string;
  baseId: string;
  materialId: string;
  indexId?: string | null;
  coatingId?: string | null;
  colorId?: string | null;
  rangeType?: string;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  addMin?: number | null;
  addMax?: number | null;
  axis?: number | null;
  eye?: string | null;
  defaultPrice?: number | null;
  isActive?: boolean;
  actorUserId: string;
};

export async function createLensProduct(input: CreateLensProductInput) {
  const name = input.name.trim();
  if (!name) {
    throw new LensProductServiceError("name is required.");
  }

  const sphMin = requireFinite("sphMin", input.sphMin);
  const sphMax = requireFinite("sphMax", input.sphMax);
  const cylMin = requireFinite("cylMin", input.cylMin);
  const cylMax = requireFinite("cylMax", input.cylMax);
  validateRange({ sphMin, sphMax, cylMin, cylMax });

  const [family, base, material, indexRow, coating, color] = await Promise.all([
    prisma.lensFamily.findUnique({ where: { id: input.familyId } }),
    prisma.lensBase.findUnique({ where: { id: input.baseId } }),
    prisma.lensMaterial.findUnique({ where: { id: input.materialId } }),
    input.indexId
      ? prisma.lensIndex.findUnique({ where: { id: input.indexId } })
      : Promise.resolve(null),
    input.coatingId
      ? prisma.lensCoating.findUnique({ where: { id: input.coatingId } })
      : Promise.resolve(null),
    input.colorId
      ? prisma.lensColor.findUnique({ where: { id: input.colorId } })
      : Promise.resolve(null),
  ]);

  await assertActiveFk("Family", input.familyId, async () => family);
  await assertActiveFk("Base", input.baseId, async () => base);
  await assertActiveFk("Material", input.materialId, async () => material);
  await assertActiveFk("Index", input.indexId, async () => indexRow);
  await assertActiveFk("Coating", input.coatingId, async () => coating);
  await assertActiveFk("Color", input.colorId, async () => color);

  await ensureBaseMaterialCompat(input.baseId, input.materialId);

  const rangeType = (input.rangeType?.trim() || "NORMAL").toUpperCase();
  if (rangeType !== "NORMAL" && rangeType !== "CROSS") {
    throw new LensProductServiceError("rangeType must be NORMAL or CROSS.");
  }

  const eye = input.eye?.trim() || null;
  if (eye && !["LEFT", "RIGHT", "BOTH"].includes(eye.toUpperCase())) {
    throw new LensProductServiceError("eye must be LEFT, RIGHT, or BOTH.");
  }

  // Codes are guaranteed after assertActiveFk for required FKs
  const skuCode = buildLensProductSkuCode({
    familyCode: family!.code,
    baseCode: base!.code,
    materialCode: material!.code,
    indexCode: indexRow?.code ?? null,
    coatingCode: coating?.code ?? null,
    colorCode: color?.code ?? null,
    sphMin,
    sphMax,
    cylMin,
    cylMax,
    rangeType,
  });

  // Phase D: reject exact duplicate attribute combo + identical range
  const duplicate = await prisma.lensProduct.findFirst({
    where: {
      familyId: input.familyId,
      baseId: input.baseId,
      materialId: input.materialId,
      indexId: input.indexId ?? null,
      coatingId: input.coatingId ?? null,
      colorId: input.colorId ?? null,
      rangeType,
      sphMin: dec(sphMin),
      sphMax: dec(sphMax),
      cylMin: dec(cylMin),
      cylMax: dec(cylMax),
    },
    select: { id: true, skuCode: true },
  });
  if (duplicate) {
    throw new LensProductServiceError(
      `A product with the same attributes and range already exists (${duplicate.skuCode}).`,
      409,
      "DUPLICATE_COMBO_RANGE",
      { productId: duplicate.id, skuCode: duplicate.skuCode }
    );
  }

  try {
    const created = await prisma.lensProduct.create({
      data: {
        skuCode,
        name,
        familyId: input.familyId,
        baseId: input.baseId,
        materialId: input.materialId,
        indexId: input.indexId || null,
        coatingId: input.coatingId || null,
        colorId: input.colorId || null,
        rangeType,
        sphMin: dec(sphMin),
        sphMax: dec(sphMax),
        cylMin: dec(cylMin),
        cylMax: dec(cylMax),
        addMin:
          input.addMin != null && Number.isFinite(input.addMin)
            ? dec(input.addMin)
            : null,
        addMax:
          input.addMax != null && Number.isFinite(input.addMax)
            ? dec(input.addMax)
            : null,
        axis:
          input.axis != null && Number.isFinite(input.axis)
            ? Math.trunc(input.axis)
            : null,
        eye: eye ? eye.toUpperCase() : null,
        defaultPrice:
          input.defaultPrice != null && Number.isFinite(input.defaultPrice)
            ? dec(input.defaultPrice)
            : null,
        isActive: input.isActive !== false,
      },
      include: productInclude,
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.SETTINGS_UPDATED,
      module: AuditModule.INVENTORY,
      entityType: "LensProduct",
      entityId: created.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: input.actorUserId,
        actorName: null,
      },
      context: {
        event: "LENS_PRODUCT_CREATED",
        skuCode,
        familyId: input.familyId,
        baseId: input.baseId,
        materialId: input.materialId,
      },
      activityMessage: `Lens product created: ${skuCode}`,
    });

    return serializeLensProduct(created);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new LensProductServiceError(
        `SKU code "${skuCode}" already exists.`,
        409,
        "DUPLICATE_SKU"
      );
    }
    throw err;
  }
}

export async function getLensProduct(id: string) {
  const row = await prisma.lensProduct.findUnique({
    where: { id },
    include: productInclude,
  });
  if (!row) {
    throw new LensProductServiceError("Product not found.", 404, "NOT_FOUND");
  }
  return serializeLensProduct(row);
}

export async function listLensProducts(params: {
  q?: string;
  familyId?: string;
  baseId?: string;
  materialId?: string;
  isActive?: boolean | null;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const where: Prisma.LensProductWhereInput = {};

  if (params.familyId) where.familyId = params.familyId;
  if (params.baseId) where.baseId = params.baseId;
  if (params.materialId) where.materialId = params.materialId;
  if (params.isActive === true || params.isActive === false) {
    where.isActive = params.isActive;
  }
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { skuCode: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { family: { code: { contains: q, mode: "insensitive" } } },
      { base: { code: { contains: q, mode: "insensitive" } } },
      { material: { code: { contains: q, mode: "insensitive" } } },
      { coating: { code: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.lensProduct.count({ where }),
    prisma.lensProduct.findMany({
      where,
      include: productInclude,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map(serializeLensProduct),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

export type UpdateLensProductInput = {
  id: string;
  skuCode?: string;
  name?: string;
  familyId?: string;
  baseId?: string;
  materialId?: string;
  indexId?: string | null;
  coatingId?: string | null;
  colorId?: string | null;
  rangeType?: string;
  sphMin?: number;
  sphMax?: number;
  cylMin?: number;
  cylMax?: number;
  addMin?: number | null;
  addMax?: number | null;
  axis?: number | null;
  eye?: string | null;
  defaultPrice?: number | null;
  isActive?: boolean;
  actorUserId: string;
};

export async function updateLensProduct(input: UpdateLensProductInput) {
  const existing = await prisma.lensProduct.findUnique({
    where: { id: input.id },
  });
  if (!existing) {
    throw new LensProductServiceError("Product not found.", 404, "NOT_FOUND");
  }

  const familyId = input.familyId ?? existing.familyId;
  const baseId = input.baseId ?? existing.baseId;
  const materialId = input.materialId ?? existing.materialId;
  const indexId =
    input.indexId !== undefined ? input.indexId : existing.indexId;
  const coatingId =
    input.coatingId !== undefined ? input.coatingId : existing.coatingId;
  const colorId =
    input.colorId !== undefined ? input.colorId : existing.colorId;

  if (input.familyId) {
    await assertActiveFk("Family", familyId, (id) =>
      prisma.lensFamily.findUnique({ where: { id } })
    );
  }
  if (input.baseId || input.materialId) {
    await assertActiveFk("Base", baseId, (id) =>
      prisma.lensBase.findUnique({ where: { id } })
    );
    await assertActiveFk("Material", materialId, (id) =>
      prisma.lensMaterial.findUnique({ where: { id } })
    );
    await ensureBaseMaterialCompat(baseId, materialId);
  }
  if (input.indexId) {
    await assertActiveFk("Index", indexId, (id) =>
      prisma.lensIndex.findUnique({ where: { id } })
    );
  }
  if (input.coatingId) {
    await assertActiveFk("Coating", coatingId, (id) =>
      prisma.lensCoating.findUnique({ where: { id } })
    );
  }
  if (input.colorId) {
    await assertActiveFk("Color", colorId, (id) =>
      prisma.lensColor.findUnique({ where: { id } })
    );
  }

  const sphMin =
    input.sphMin != null ? requireFinite("sphMin", input.sphMin) : Number(existing.sphMin);
  const sphMax =
    input.sphMax != null ? requireFinite("sphMax", input.sphMax) : Number(existing.sphMax);
  const cylMin =
    input.cylMin != null ? requireFinite("cylMin", input.cylMin) : Number(existing.cylMin);
  const cylMax =
    input.cylMax != null ? requireFinite("cylMax", input.cylMax) : Number(existing.cylMax);
  validateRange({ sphMin, sphMax, cylMin, cylMax });

  const rangeType = (
    input.rangeType?.trim() ||
    existing.rangeType ||
    "NORMAL"
  ).toUpperCase();
  if (rangeType !== "NORMAL" && rangeType !== "CROSS") {
    throw new LensProductServiceError("rangeType must be NORMAL or CROSS.");
  }

  const eyeRaw =
    input.eye !== undefined ? input.eye?.trim() || null : existing.eye;
  if (eyeRaw && !["LEFT", "RIGHT", "BOTH"].includes(eyeRaw.toUpperCase())) {
    throw new LensProductServiceError("eye must be LEFT, RIGHT, or BOTH.");
  }

  const data: Prisma.LensProductUpdateInput = {
    family: { connect: { id: familyId } },
    base: { connect: { id: baseId } },
    material: { connect: { id: materialId } },
    index: indexId ? { connect: { id: indexId } } : { disconnect: true },
    coating: coatingId ? { connect: { id: coatingId } } : { disconnect: true },
    color: colorId ? { connect: { id: colorId } } : { disconnect: true },
    rangeType,
    sphMin: dec(sphMin),
    sphMax: dec(sphMax),
    cylMin: dec(cylMin),
    cylMax: dec(cylMax),
  };

  if (input.skuCode != null) {
    const skuCode = input.skuCode.trim();
    if (!skuCode) throw new LensProductServiceError("skuCode cannot be empty.");
    data.skuCode = skuCode;
  }
  if (input.name != null) {
    const name = input.name.trim();
    if (!name) throw new LensProductServiceError("name cannot be empty.");
    data.name = name;
  }
  if (input.addMin !== undefined) {
    data.addMin =
      input.addMin != null && Number.isFinite(input.addMin)
        ? dec(input.addMin)
        : null;
  }
  if (input.addMax !== undefined) {
    data.addMax =
      input.addMax != null && Number.isFinite(input.addMax)
        ? dec(input.addMax)
        : null;
  }
  if (input.axis !== undefined) {
    data.axis =
      input.axis != null && Number.isFinite(input.axis)
        ? Math.trunc(input.axis)
        : null;
  }
  if (input.eye !== undefined) {
    data.eye = eyeRaw ? eyeRaw.toUpperCase() : null;
  }
  if (input.defaultPrice !== undefined) {
    data.defaultPrice =
      input.defaultPrice != null && Number.isFinite(input.defaultPrice)
        ? dec(input.defaultPrice)
        : null;
  }
  if (input.isActive != null) data.isActive = Boolean(input.isActive);

  try {
    const updated = await prisma.lensProduct.update({
      where: { id: input.id },
      data,
      include: productInclude,
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.SETTINGS_UPDATED,
      module: AuditModule.INVENTORY,
      entityType: "LensProduct",
      entityId: updated.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: input.actorUserId,
        actorName: null,
      },
      context: { event: "LENS_PRODUCT_UPDATED", skuCode: updated.skuCode },
      activityMessage: `Lens product updated: ${updated.skuCode}`,
    });

    return serializeLensProduct(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new LensProductServiceError(
        "SKU code already exists.",
        409,
        "DUPLICATE_SKU"
      );
    }
    throw err;
  }
}
