/**
 * RW-09 LensProduct SKU master (docs/product-catalog).
 * RC-03: material optional; power range comes from a LensPowerRange master.
 * No power-leaf / stock insert in this slice.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AuditAction, AuditModule, recordAuditEvent } from "../audit";
import {
  assertMaterialAllowedForBase,
  LensAttributeServiceError,
} from "./lens-attribute-service";
import {
  formatCylSummary,
  formatPowerRangeLabel,
} from "./catalog-power-select-options";
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
  powerRange: true,
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
  const sphMin = Number(row.sphMin);
  const sphMax = Number(row.sphMax);
  const cylMin = Number(row.cylMin);
  const cylMax = Number(row.cylMax);
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
    powerRangeId: row.powerRangeId,
    rangeType: row.rangeType,
    sphMin,
    sphMax,
    cylMin,
    cylMax,
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
    material: row.material
      ? {
          id: row.material.id,
          code: row.material.code,
          name: row.material.name,
        }
      : null,
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
    powerRange: row.powerRange
      ? {
          id: row.powerRange.id,
          label: formatPowerRangeLabel(
            Number(row.powerRange.sphMin),
            Number(row.powerRange.sphMax)
          ),
          cylSummary: formatCylSummary(
            Number(row.powerRange.cylMin),
            Number(row.powerRange.cylMax)
          ),
        }
      : null,
    attributeSummary: [
      row.family.code,
      row.base.code,
      row.material?.code,
      row.index?.code,
      row.coating?.code,
      row.color?.code,
    ]
      .filter(Boolean)
      .join(" · "),
    rangeLabel: formatPowerRangeLabel(sphMin, sphMax),
    rangeSummary: `SPH ${sphMin}…${sphMax} / CYL ${cylMin}…${cylMax}`,
  };
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

function normalizeOptionalId(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function parseRangeType(raw: string | null | undefined): string {
  const rangeType = (raw?.trim() || "NORMAL").toUpperCase();
  if (rangeType !== "NORMAL" && rangeType !== "CROSS") {
    throw new LensProductServiceError("rangeType must be NORMAL or CROSS.");
  }
  return rangeType;
}

type IdentityIds = {
  familyId: string;
  baseId: string;
  materialId: string | null;
  indexId: string | null;
  coatingId: string | null;
  colorId: string | null;
  powerRangeId: string;
  rangeType: string;
};

/**
 * Loads the attribute rows for an identity, validates FKs (active, compatible) as asked,
 * and returns the generated interim SKU + power bounds copied from the range master.
 */
async function resolveIdentity(
  ids: IdentityIds,
  opts: { validate: Set<keyof IdentityIds> | "all" }
) {
  const [family, base, material, indexRow, coating, color, powerRange] =
    await Promise.all([
      prisma.lensFamily.findUnique({ where: { id: ids.familyId } }),
      prisma.lensBase.findUnique({ where: { id: ids.baseId } }),
      ids.materialId
        ? prisma.lensMaterial.findUnique({ where: { id: ids.materialId } })
        : Promise.resolve(null),
      ids.indexId
        ? prisma.lensIndex.findUnique({ where: { id: ids.indexId } })
        : Promise.resolve(null),
      ids.coatingId
        ? prisma.lensCoating.findUnique({ where: { id: ids.coatingId } })
        : Promise.resolve(null),
      ids.colorId
        ? prisma.lensColor.findUnique({ where: { id: ids.colorId } })
        : Promise.resolve(null),
      prisma.lensPowerRange.findUnique({ where: { id: ids.powerRangeId } }),
    ]);

  const check = (key: keyof IdentityIds) =>
    opts.validate === "all" || opts.validate.has(key);

  if (check("familyId")) await assertActiveFk("Family", ids.familyId, async () => family);
  if (check("baseId")) await assertActiveFk("Base", ids.baseId, async () => base);
  if (check("materialId"))
    await assertActiveFk("Material", ids.materialId, async () => material);
  if (check("indexId")) await assertActiveFk("Index", ids.indexId, async () => indexRow);
  if (check("coatingId"))
    await assertActiveFk("Coating", ids.coatingId, async () => coating);
  if (check("colorId")) await assertActiveFk("Color", ids.colorId, async () => color);
  if (check("powerRangeId"))
    await assertActiveFk("Power range", ids.powerRangeId, async () => powerRange);

  if (!family || !base) {
    throw new LensProductServiceError(
      "Family or base not found.",
      400,
      "INVALID_FK"
    );
  }
  if (!powerRange) {
    throw new LensProductServiceError(
      "Power range not found.",
      400,
      "INVALID_FK"
    );
  }
  if (ids.materialId && !material) {
    throw new LensProductServiceError("Material not found.", 400, "INVALID_FK");
  }

  if (
    ids.materialId &&
    (check("materialId") || check("baseId"))
  ) {
    await ensureBaseMaterialCompat(ids.baseId, ids.materialId);
  }

  const bounds = {
    sphMin: Number(powerRange.sphMin),
    sphMax: Number(powerRange.sphMax),
    cylMin: Number(powerRange.cylMin),
    cylMax: Number(powerRange.cylMax),
  };

  const skuCode = buildLensProductSkuCode({
    familyCode: family.code,
    baseCode: base.code,
    materialCode: material?.code ?? null,
    indexCode: indexRow?.code ?? null,
    coatingCode: coating?.code ?? null,
    colorCode: color?.code ?? null,
    ...bounds,
    rangeType: ids.rangeType,
  });

  return { skuCode, bounds };
}

/** Same attrs + same power-range master (or identical bounds) ⇒ duplicate. */
async function findDuplicate(
  ids: IdentityIds,
  bounds: { sphMin: number; sphMax: number; cylMin: number; cylMax: number },
  excludeId?: string
) {
  return prisma.lensProduct.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      familyId: ids.familyId,
      baseId: ids.baseId,
      materialId: ids.materialId,
      indexId: ids.indexId,
      coatingId: ids.coatingId,
      colorId: ids.colorId,
      rangeType: ids.rangeType,
      OR: [
        { powerRangeId: ids.powerRangeId },
        {
          sphMin: dec(bounds.sphMin),
          sphMax: dec(bounds.sphMax),
          cylMin: dec(bounds.cylMin),
          cylMax: dec(bounds.cylMax),
        },
      ],
    },
    select: { id: true, skuCode: true },
  });
}

function duplicateError(dup: { id: string; skuCode: string }) {
  return new LensProductServiceError(
    `A product with the same attributes and power range already exists (${dup.skuCode}).`,
    409,
    "DUPLICATE_COMBO_RANGE",
    { productId: dup.id, skuCode: dup.skuCode }
  );
}

export type CreateLensProductInput = {
  /** Ignored when present — SKU is generated from attribute codes + range. */
  skuCode?: string | null;
  name: string;
  familyId: string;
  baseId: string;
  /** Optional (RC-03). */
  materialId?: string | null;
  indexId?: string | null;
  coatingId?: string | null;
  colorId?: string | null;
  /** Required: active LensPowerRange master. Bounds are copied from it. */
  powerRangeId: string;
  rangeType?: string;
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
  const powerRangeId = normalizeOptionalId(input.powerRangeId);
  if (!powerRangeId) {
    throw new LensProductServiceError(
      "powerRangeId is required.",
      400,
      "POWER_RANGE_REQUIRED"
    );
  }

  const ids: IdentityIds = {
    familyId: input.familyId,
    baseId: input.baseId,
    materialId: normalizeOptionalId(input.materialId),
    indexId: normalizeOptionalId(input.indexId),
    coatingId: normalizeOptionalId(input.coatingId),
    colorId: normalizeOptionalId(input.colorId),
    powerRangeId,
    rangeType: parseRangeType(input.rangeType),
  };

  const eye = input.eye?.trim() || null;
  if (eye && !["LEFT", "RIGHT", "BOTH"].includes(eye.toUpperCase())) {
    throw new LensProductServiceError("eye must be LEFT, RIGHT, or BOTH.");
  }

  const { skuCode, bounds } = await resolveIdentity(ids, { validate: "all" });

  const duplicate = await findDuplicate(ids, bounds);
  if (duplicate) throw duplicateError(duplicate);

  try {
    const created = await prisma.lensProduct.create({
      data: {
        skuCode,
        name,
        familyId: ids.familyId,
        baseId: ids.baseId,
        materialId: ids.materialId,
        indexId: ids.indexId,
        coatingId: ids.coatingId,
        colorId: ids.colorId,
        powerRangeId: ids.powerRangeId,
        rangeType: ids.rangeType,
        sphMin: dec(bounds.sphMin),
        sphMax: dec(bounds.sphMax),
        cylMin: dec(bounds.cylMin),
        cylMax: dec(bounds.cylMax),
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
        familyId: ids.familyId,
        baseId: ids.baseId,
        materialId: ids.materialId,
        powerRangeId: ids.powerRangeId,
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
  powerRangeId?: string;
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
  if (params.powerRangeId) where.powerRangeId = params.powerRangeId;
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
  /** `null` clears material (optional); `undefined` keeps the existing value. */
  materialId?: string | null;
  indexId?: string | null;
  coatingId?: string | null;
  colorId?: string | null;
  powerRangeId?: string;
  rangeType?: string;
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

  const identityTouched =
    input.familyId !== undefined ||
    input.baseId !== undefined ||
    input.materialId !== undefined ||
    input.indexId !== undefined ||
    input.coatingId !== undefined ||
    input.colorId !== undefined ||
    input.powerRangeId !== undefined ||
    input.rangeType !== undefined;

  const eyeRaw =
    input.eye !== undefined ? input.eye?.trim() || null : existing.eye;
  if (eyeRaw && !["LEFT", "RIGHT", "BOTH"].includes(eyeRaw.toUpperCase())) {
    throw new LensProductServiceError("eye must be LEFT, RIGHT, or BOTH.");
  }

  const data: Prisma.LensProductUpdateInput = {};

  if (identityTouched) {
    const powerRangeId =
      input.powerRangeId !== undefined
        ? normalizeOptionalId(input.powerRangeId)
        : existing.powerRangeId;
    if (!powerRangeId) {
      throw new LensProductServiceError(
        "powerRangeId is required.",
        400,
        "POWER_RANGE_REQUIRED"
      );
    }

    const ids: IdentityIds = {
      familyId: input.familyId ?? existing.familyId,
      baseId: input.baseId ?? existing.baseId,
      materialId:
        input.materialId !== undefined
          ? normalizeOptionalId(input.materialId)
          : existing.materialId,
      indexId:
        input.indexId !== undefined
          ? normalizeOptionalId(input.indexId)
          : existing.indexId,
      coatingId:
        input.coatingId !== undefined
          ? normalizeOptionalId(input.coatingId)
          : existing.coatingId,
      colorId:
        input.colorId !== undefined
          ? normalizeOptionalId(input.colorId)
          : existing.colorId,
      powerRangeId,
      rangeType: parseRangeType(input.rangeType ?? existing.rangeType),
    };

    // Only re-validate pieces the caller actually changed (legacy rows stay editable).
    const validate = new Set<keyof IdentityIds>();
    if (input.familyId !== undefined) validate.add("familyId");
    if (input.baseId !== undefined || input.materialId !== undefined) {
      validate.add("baseId");
      validate.add("materialId");
    }
    if (input.indexId) validate.add("indexId");
    if (input.coatingId) validate.add("coatingId");
    if (input.colorId) validate.add("colorId");
    if (input.powerRangeId !== undefined) validate.add("powerRangeId");

    const { skuCode, bounds } = await resolveIdentity(ids, { validate });

    const duplicate = await findDuplicate(ids, bounds, input.id);
    if (duplicate) throw duplicateError(duplicate);

    data.family = { connect: { id: ids.familyId } };
    data.base = { connect: { id: ids.baseId } };
    data.material = ids.materialId
      ? { connect: { id: ids.materialId } }
      : { disconnect: true };
    data.index = ids.indexId
      ? { connect: { id: ids.indexId } }
      : { disconnect: true };
    data.coating = ids.coatingId
      ? { connect: { id: ids.coatingId } }
      : { disconnect: true };
    data.color = ids.colorId
      ? { connect: { id: ids.colorId } }
      : { disconnect: true };
    data.powerRange = { connect: { id: ids.powerRangeId } };
    data.rangeType = ids.rangeType;
    data.sphMin = dec(bounds.sphMin);
    data.sphMax = dec(bounds.sphMax);
    data.cylMin = dec(bounds.cylMin);
    data.cylMax = dec(bounds.cylMax);
    // Regenerate interim SKU when identity changes (explicit skuCode below still wins).
    data.skuCode = skuCode;
  }

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
