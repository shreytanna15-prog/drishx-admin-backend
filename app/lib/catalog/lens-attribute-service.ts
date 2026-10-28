/**
 * RW-09 attribute masters for the product-catalog slice (docs/product-catalog).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AuditAction, AuditModule, recordAuditEvent } from "../audit";

export const LENS_ATTRIBUTE_TYPES = [
  "family",
  "base",
  "material",
  "index",
  "coating",
  "color",
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
  value?: Prisma.Decimal | null;
};

function serializeAttribute(row: AttributeRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    value: row.value != null ? Number(row.value) : undefined,
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
  }
}

export async function listLensAttributes(
  type: LensAttributeType,
  activeOnly = false
) {
  const rows = await listByType(type, activeOnly);
  return rows.map(serializeAttribute);
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
  const code = normalizeCode(input.code);
  const name = normalizeName(input.name);
  if (!code || !name) {
    throw new LensAttributeServiceError("code and name are required.");
  }
  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? Math.trunc(input.sortOrder)
      : 0;
  const isActive = input.isActive !== false;

  try {
    let row: AttributeRow;
    switch (type) {
      case "family":
        row = await prisma.lensFamily.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      case "base":
        row = await prisma.lensBase.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      case "material":
        row = await prisma.lensMaterial.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      case "index": {
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
      case "coating":
        row = await prisma.lensCoating.create({
          data: { code, name, sortOrder, isActive },
        });
        break;
      case "color":
        row = await prisma.lensColor.create({
          data: { code, name, sortOrder, isActive },
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
      context: { event: "LENS_ATTRIBUTE_CREATED", type, code, name },
      activityMessage: `Catalog attribute ${type} created: ${code}`,
    });

    return serializeAttribute(row);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new LensAttributeServiceError(
        `Attribute code "${code}" already exists.`,
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
    value?: Prisma.Decimal | null;
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

  if (Object.keys(data).length === 0) {
    throw new LensAttributeServiceError("No fields to update.");
  }

  try {
    let row: AttributeRow;
    switch (type) {
      case "family":
        row = await prisma.lensFamily.update({ where: { id }, data });
        break;
      case "base":
        row = await prisma.lensBase.update({ where: { id }, data });
        break;
      case "material":
        row = await prisma.lensMaterial.update({ where: { id }, data });
        break;
      case "index":
        row = await prisma.lensIndex.update({ where: { id }, data });
        break;
      case "coating":
        row = await prisma.lensCoating.update({ where: { id }, data });
        break;
      case "color":
        row = await prisma.lensColor.update({ where: { id }, data });
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
