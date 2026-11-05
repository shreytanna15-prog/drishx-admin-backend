/**
 * RW-09 attribute masters for the product-catalog slice (docs/product-catalog).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AuditAction, AuditModule, recordAuditEvent } from "../audit";
import {
  additionCodeFromValue,
  axisCodeFromValue,
  diameterCodeFromValue,
  formatAdditionLabel,
  formatAxisLabel,
  formatDiameterLabel,
  isAllowedAdditionValue,
  isAllowedAxisValue,
  isAllowedDiameterValue,
} from "./catalog-axis-add-diameter-options";

export const LENS_ATTRIBUTE_TYPES = [
  "family",
  "base",
  "material",
  "index",
  "coating",
  "color",
  "axis",
  "addition",
  "diameter",
] as const;

export type LensAttributeType = (typeof LENS_ATTRIBUTE_TYPES)[number];

export class LensAttributeServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "ATTRIBUTE_ERROR") {
    super(message);
    this.name = "LensAttributeServiceError";
    this.status = status;
    this.code = code;
  }
}

export function isLensAttributeType(value: string): value is LensAttributeType {
  return (LENS_ATTRIBUTE_TYPES as readonly string[]).includes(value);
}

type AttributeRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  value?: Prisma.Decimal | number | null;
  supportsAxis?: boolean;
  supportsAdd?: boolean;
  supportsEye?: boolean;
};

function serializeAttribute(row: AttributeRow) {
  const value =
    row.value != null
      ? typeof row.value === "number"
        ? row.value
        : Number(row.value)
      : undefined;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    value,
    supportsAxis: row.supportsAxis,
    supportsAdd: row.supportsAdd,
    supportsEye: row.supportsEye,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "_");
}

function normalizeName(raw: string): string {
  return raw.trim();
}

async function listByType(
  type: LensAttributeType,
  activeOnly: boolean
): Promise<AttributeRow[]> {
  const where = activeOnly ? { isActive: true } : {};
  const orderBy = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

  switch (type) {
    case "family":
      return prisma.lensFamily.findMany({ where, orderBy });
    case "base":
      return prisma.lensBase.findMany({ where, orderBy });
    case "material":
      return prisma.lensMaterial.findMany({ where, orderBy });
    case "index":
      return prisma.lensIndex.findMany({ where, orderBy });
    case "coating":
      return prisma.lensCoating.findMany({ where, orderBy });
    case "color":
      return prisma.lensColor.findMany({ where, orderBy });
    case "axis":
      return prisma.lensAxis.findMany({ where, orderBy });
    case "addition":
      return prisma.lensAddition.findMany({ where, orderBy });
    case "diameter":
      return prisma.lensDiameter.findMany({ where, orderBy });
  }
}

export async function listLensAttributes(
  type: LensAttributeType,
  activeOnly = false
) {
  const rows = await listByType(type, activeOnly);
  return rows.map(serializeAttribute);
}

function resolveNumericCreate(
  type: "axis" | "addition" | "diameter",
  input: { code: string; name: string; value?: number | null }
): { code: string; name: string; value: number; sortOrder: number } {
  const rawValue =
    input.value != null && Number.isFinite(input.value)
      ? input.value
      : Number(input.code.replace(/^A|^ADD_|^D/i, "").replace("P", ".").replace("M", "-"));

  if (type === "axis") {
    const value = Math.trunc(Number(input.value ?? rawValue));
    if (!isAllowedAxisValue(value)) {
      throw new LensAttributeServiceError(
        "Axis must be 10…180 step 10, or 45 / 135.",
        400,
        "INVALID_AXIS"
      );
    }
    return {
      code: normalizeCode(input.code) || axisCodeFromValue(value),
      name: normalizeName(input.name) || formatAxisLabel(value),
      value,
      sortOrder: value,
    };
  }

  if (type === "addition") {
    const value = Number(Number(input.value ?? rawValue).toFixed(2));
    if (!isAllowedAdditionValue(value)) {
      throw new LensAttributeServiceError(
        "Addition must be 0 or 0.25…6.00 step 0.25.",
        400,
        "INVALID_ADDITION"
      );
    }
    return {
      code: normalizeCode(input.code) || additionCodeFromValue(value),
      name: normalizeName(input.name) || formatAdditionLabel(value),
      value,
      sortOrder: Math.round(value * 100),
    };
  }

  const value = Math.trunc(Number(input.value ?? rawValue));
  if (!isAllowedDiameterValue(value)) {
    throw new LensAttributeServiceError(
      "Diameter must be 55…120 step 5 (mm).",
      400,
      "INVALID_DIAMETER"
    );
  }
  return {
    code: normalizeCode(input.code) || diameterCodeFromValue(value),
    name: normalizeName(input.name) || formatDiameterLabel(value),
    value,
    sortOrder: value,
  };
}

export async function createLensAttribute(
  type: LensAttributeType,
  input: {
    code: string;
    name: string;
    sortOrder?: number;
    isActive?: boolean;
    value?: number | null;
    actorUserId: string;
  }
) {
  const isActive = input.isActive !== false;

  try {
    let row: AttributeRow;
    switch (type) {
      case "family": {
        const code = normalizeCode(input.code);
        const name = normalizeName(input.name);
        if (!code || !name) {
          throw new LensAttributeServiceError("code and name are required.");
        }
        const sortOrder =
          typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
            ? Math.trunc(input.sortOrder)
            : 0;
        row = await prisma.lensFamily.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      }
      case "base": {
        const code = normalizeCode(input.code);
        const name = normalizeName(input.name);
        if (!code || !name) {
          throw new LensAttributeServiceError("code and name are required.");
        }
        const sortOrder =
          typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
            ? Math.trunc(input.sortOrder)
            : 0;
        row = await prisma.lensBase.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      }
      case "material": {
        const code = normalizeCode(input.code);
        const name = normalizeName(input.name);
        if (!code || !name) {
          throw new LensAttributeServiceError("code and name are required.");
        }
        const sortOrder =
          typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
            ? Math.trunc(input.sortOrder)
            : 0;
        row = await prisma.lensMaterial.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      }
      case "index": {
        const code = normalizeCode(input.code);
        const name = normalizeName(input.name);
        if (!code || !name) {
          throw new LensAttributeServiceError("code and name are required.");
        }
        const sortOrder =
          typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
            ? Math.trunc(input.sortOrder)
            : 0;
        const value =
          input.value != null && Number.isFinite(input.value)
            ? new Prisma.Decimal(input.value)
            : Number.isFinite(Number(code))
              ? new Prisma.Decimal(code)
              : null;
        row = await prisma.lensIndex.create({
          data: { code, name, sortOrder, isActive, value },
        });
        break;
      }
      case "coating": {
        const code = normalizeCode(input.code);
        const name = normalizeName(input.name);
        if (!code || !name) {
          throw new LensAttributeServiceError("code and name are required.");
        }
        const sortOrder =
          typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
            ? Math.trunc(input.sortOrder)
            : 0;
        row = await prisma.lensCoating.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      }
      case "color": {
        const code = normalizeCode(input.code);
        const name = normalizeName(input.name);
        if (!code || !name) {
          throw new LensAttributeServiceError("code and name are required.");
        }
        const sortOrder =
          typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
            ? Math.trunc(input.sortOrder)
            : 0;
        row = await prisma.lensColor.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      }
      case "axis": {
        const resolved = resolveNumericCreate("axis", input);
        row = await prisma.lensAxis.create({
          data: {
            code: resolved.code,
            name: resolved.name,
            value: resolved.value,
            sortOrder:
              typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
                ? Math.trunc(input.sortOrder)
                : resolved.sortOrder,
            isActive,
          },
        });
        break;
      }
      case "addition": {
        const resolved = resolveNumericCreate("addition", input);
        row = await prisma.lensAddition.create({
          data: {
            code: resolved.code,
            name: resolved.name,
            value: resolved.value,
            sortOrder:
              typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
                ? Math.trunc(input.sortOrder)
                : resolved.sortOrder,
            isActive,
          },
        });
        break;
      }
      case "diameter": {
        const resolved = resolveNumericCreate("diameter", input);
        row = await prisma.lensDiameter.create({
          data: {
            code: resolved.code,
            name: resolved.name,
            value: resolved.value,
            sortOrder:
              typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
                ? Math.trunc(input.sortOrder)
                : resolved.sortOrder,
            isActive,
          },
        });
        break;
      }
    }

    await recordAuditEvent(prisma, {
      action: AuditAction.SETTINGS_UPDATED,
      module: AuditModule.INVENTORY,
      entityType: `LensAttribute:${type}`,
      entityId: row.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: input.actorUserId,
        actorName: null,
      },
      context: { event: "LENS_ATTRIBUTE_CREATED", type, code: row.code, name: row.name },
      activityMessage: `Catalog attribute ${type} created: ${row.code}`,
    });

    return serializeAttribute(row);
  } catch (err) {
    if (err instanceof LensAttributeServiceError) throw err;
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new LensAttributeServiceError(
        `Attribute code already exists.`,
        409,
        "DUPLICATE_CODE"
      );
    }
    throw err;
  }
}

export async function updateLensAttribute(
  type: LensAttributeType,
  id: string,
  input: {
    code?: string;
    name?: string;
    sortOrder?: number;
    isActive?: boolean;
    value?: number | null;
    actorUserId: string;
  }
) {
  const data: {
    code?: string;
    name?: string;
    sortOrder?: number;
    isActive?: boolean;
    value?: Prisma.Decimal | number | null;
  } = {};

  if (input.code != null) {
    const code = normalizeCode(input.code);
    if (!code) throw new LensAttributeServiceError("code cannot be empty.");
    data.code = code;
  }
  if (input.name != null) {
    const name = normalizeName(input.name);
    if (!name) throw new LensAttributeServiceError("name cannot be empty.");
    data.name = name;
  }
  if (input.sortOrder != null) {
    if (!Number.isFinite(input.sortOrder)) {
      throw new LensAttributeServiceError("sortOrder must be a number.");
    }
    data.sortOrder = Math.trunc(input.sortOrder);
  }
  if (input.isActive != null) data.isActive = Boolean(input.isActive);

  if (type === "index" && input.value !== undefined) {
    data.value =
      input.value != null && Number.isFinite(input.value)
        ? new Prisma.Decimal(input.value)
        : null;
  }
  if (type === "axis" && input.value !== undefined) {
    if (input.value == null || !isAllowedAxisValue(Math.trunc(input.value))) {
      throw new LensAttributeServiceError(
        "Axis must be 10…180 step 10, or 45 / 135.",
        400,
        "INVALID_AXIS"
      );
    }
    data.value = Math.trunc(input.value);
  }
  if (type === "addition" && input.value !== undefined) {
    if (input.value == null || !isAllowedAdditionValue(Number(input.value))) {
      throw new LensAttributeServiceError(
        "Addition must be 0 or 0.25…6.00 step 0.25.",
        400,
        "INVALID_ADDITION"
      );
    }
    data.value = Number(Number(input.value).toFixed(2));
  }
  if (type === "diameter" && input.value !== undefined) {
    if (input.value == null || !isAllowedDiameterValue(Math.trunc(input.value))) {
      throw new LensAttributeServiceError(
        "Diameter must be 55…120 step 5 (mm).",
        400,
        "INVALID_DIAMETER"
      );
    }
    data.value = Math.trunc(input.value);
  }

  if (Object.keys(data).length === 0) {
    throw new LensAttributeServiceError("No fields to update.");
  }

  try {
    let row: AttributeRow;
    switch (type) {
      case "family":
        row = await prisma.lensFamily.update({
          where: { id },
          data: {
            code: data.code,
            name: data.name,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
          },
        });
        break;
      case "base":
        row = await prisma.lensBase.update({ where: { id }, data: data as never });
        break;
      case "material":
        row = await prisma.lensMaterial.update({
          where: { id },
          data: data as never,
        });
        break;
      case "index":
        row = await prisma.lensIndex.update({
          where: { id },
          data: {
            code: data.code,
            name: data.name,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
            value:
              data.value === undefined
                ? undefined
                : data.value == null
                  ? null
                  : new Prisma.Decimal(data.value as number),
          },
        });
        break;
      case "coating":
        row = await prisma.lensCoating.update({
          where: { id },
          data: data as never,
        });
        break;
      case "color":
        row = await prisma.lensColor.update({ where: { id }, data: data as never });
        break;
      case "axis":
        row = await prisma.lensAxis.update({
          where: { id },
          data: {
            code: data.code,
            name: data.name,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
            value: data.value === undefined ? undefined : (data.value as number),
          },
        });
        break;
      case "addition":
        row = await prisma.lensAddition.update({
          where: { id },
          data: {
            code: data.code,
            name: data.name,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
            value:
              data.value === undefined
                ? undefined
                : new Prisma.Decimal(data.value as number),
          },
        });
        break;
      case "diameter":
        row = await prisma.lensDiameter.update({
          where: { id },
          data: {
            code: data.code,
            name: data.name,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
            value: data.value === undefined ? undefined : (data.value as number),
          },
        });
        break;
    }

    await recordAuditEvent(prisma, {
      action: AuditAction.SETTINGS_UPDATED,
      module: AuditModule.INVENTORY,
      entityType: `LensAttribute:${type}`,
      entityId: row.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: input.actorUserId,
        actorName: null,
      },
      context: { event: "LENS_ATTRIBUTE_UPDATED", type, ...data },
      activityMessage: `Catalog attribute ${type} updated: ${row.code}`,
    });

    return serializeAttribute(row);
  } catch (err) {
    if (err instanceof LensAttributeServiceError) throw err;
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new LensAttributeServiceError("Attribute not found.", 404, "NOT_FOUND");
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new LensAttributeServiceError(
        "Attribute code already exists.",
        409,
        "DUPLICATE_CODE"
      );
    }
    throw err;
  }
}

export async function getBaseMaterialCompatibility(baseId?: string | null) {
  const where = baseId ? { baseId } : {};
  const links = await prisma.lensBaseMaterialLink.findMany({
    where,
    include: {
      base: true,
      material: true,
    },
    orderBy: [{ base: { sortOrder: "asc" } }, { material: { sortOrder: "asc" } }],
  });

  const byBase = new Map<
    string,
    {
      baseId: string;
      baseCode: string;
      baseName: string;
      materials: Array<{
        id: string;
        code: string;
        name: string;
        isActive: boolean;
      }>;
    }
  >();

  for (const link of links) {
    let entry = byBase.get(link.baseId);
    if (!entry) {
      entry = {
        baseId: link.base.id,
        baseCode: link.base.code,
        baseName: link.base.name,
        materials: [],
      };
      byBase.set(link.baseId, entry);
    }
    entry.materials.push({
      id: link.material.id,
      code: link.material.code,
      name: link.material.name,
      isActive: link.material.isActive,
    });
  }

  return { bases: Array.from(byBase.values()) };
}

export async function assertMaterialAllowedForBase(
  baseId: string,
  materialId: string
) {
  const link = await prisma.lensBaseMaterialLink.findUnique({
    where: { baseId_materialId: { baseId, materialId } },
  });
  if (!link) {
    throw new LensAttributeServiceError(
      "Selected material is not allowed for this base.",
      400,
      "INCOMPATIBLE_BASE_MATERIAL"
    );
  }
}
