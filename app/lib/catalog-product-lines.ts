import { prisma } from "./prisma";
import {
  KRYPTOK_WHOLESALE_ITEMS,
  isKryptokWholesaleItem,
} from "./kryptok-wholesale-catalog";
import {
  PROGRESSIVE_WHOLESALE_ITEMS,
  isProgressiveWholesaleItem,
} from "./progressive-wholesale-catalog";
import {
  SINGLE_VISION_WHOLESALE_ITEMS,
  isSingleVisionWholesaleItem,
} from "./single-vision-wholesale-catalog";

export type CatalogLensType = "single-vision" | "kryptok" | "progressive";

export const CATALOG_LENS_TYPES: CatalogLensType[] = [
  "single-vision",
  "kryptok",
  "progressive",
];

export function isCatalogLensType(value: string): value is CatalogLensType {
  return (CATALOG_LENS_TYPES as string[]).includes(value);
}

export type CatalogProductLineRecord = {
  id: string;
  lensType: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const FALLBACK_ITEMS: Record<CatalogLensType, readonly string[]> = {
  "single-vision": SINGLE_VISION_WHOLESALE_ITEMS,
  kryptok: KRYPTOK_WHOLESALE_ITEMS,
  progressive: PROGRESSIVE_WHOLESALE_ITEMS,
};

/** True when the display name is a built-in wholesale card with code resolvers. */
export function isSystemWholesaleName(
  type: CatalogLensType,
  name: string
): boolean {
  const trimmed = name.trim();
  if (type === "single-vision") return isSingleVisionWholesaleItem(trimmed);
  if (type === "kryptok") return isKryptokWholesaleItem(trimmed);
  return isProgressiveWholesaleItem(trimmed);
}

/**
 * Active product-line names for a lens type (shop fixed cards).
 * Falls back to hardcoded wholesale arrays if the table is empty.
 */
export async function listActiveLineNames(
  type: CatalogLensType
): Promise<string[]> {
  try {
    const rows = await prisma.catalogProductLine.findMany({
      where: { lensType: type, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true },
    });
    if (rows.length > 0) {
      return rows.map((row) => row.name);
    }
  } catch (error) {
    console.warn("listActiveLineNames: falling back to constants", error);
  }
  return [...FALLBACK_ITEMS[type]];
}

export async function listProductLines(
  type: CatalogLensType,
  options?: { includeInactive?: boolean }
): Promise<CatalogProductLineRecord[]> {
  const includeInactive = options?.includeInactive ?? true;
  return prisma.catalogProductLine.findMany({
    where: {
      lensType: type,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getProductLineById(
  id: string
): Promise<CatalogProductLineRecord | null> {
  return prisma.catalogProductLine.findUnique({ where: { id } });
}

export async function getProductLineByName(
  type: CatalogLensType,
  name: string
): Promise<CatalogProductLineRecord | null> {
  return prisma.catalogProductLine.findUnique({
    where: {
      lensType_name: { lensType: type, name: name.trim() },
    },
  });
}

export type CreateProductLineInput = {
  lensType: CatalogLensType;
  name: string;
  description?: string | null;
  sortOrder?: number;
};

export async function createProductLine(
  input: CreateProductLineInput
): Promise<CatalogProductLineRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Name is required.");
  }

  return prisma.catalogProductLine.create({
    data: {
      lensType: input.lensType,
      name,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 999,
      isActive: true,
      isSystem: false,
    },
  });
}

export type UpdateProductLineInput = {
  name?: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export async function updateProductLine(
  id: string,
  input: UpdateProductLineInput
): Promise<CatalogProductLineRecord> {
  const existing = await getProductLineById(id);
  if (!existing) {
    throw new Error("Product line not found.");
  }

  const data: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  } = {};

  if (input.name !== undefined) {
    const nextName = input.name.trim();
    if (!nextName) {
      throw new Error("Name is required.");
    }
    if (existing.isSystem && nextName !== existing.name) {
      throw new Error("System product lines cannot be renamed.");
    }
    data.name = nextName;
  }

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  return prisma.catalogProductLine.update({
    where: { id },
    data,
  });
}

/**
 * Soft-deactivate a line. Hard-delete only custom lines with zero stock.
 * Returns { mode: 'deactivated' | 'deleted', line }.
 */
export async function deactivateOrDeleteProductLine(
  id: string,
  productCount: number,
  forceHardDelete: boolean
): Promise<{ mode: "deactivated" | "deleted"; line: CatalogProductLineRecord }> {
  const existing = await getProductLineById(id);
  if (!existing) {
    throw new Error("Product line not found.");
  }

  if (forceHardDelete) {
    if (existing.isSystem) {
      throw new Error("System product lines cannot be permanently deleted.");
    }
    if (productCount > 0) {
      throw new Error(
        "Cannot permanently delete a product line that still has stock. Deactivate instead."
      );
    }
    await prisma.catalogProductLine.delete({ where: { id } });
    return { mode: "deleted", line: existing };
  }

  const line = await prisma.catalogProductLine.update({
    where: { id },
    data: { isActive: false },
  });
  return { mode: "deactivated", line };
}

/** Ensure all system wholesale names exist as catalog rows (idempotent). */
export async function ensureSystemProductLinesSeeded(): Promise<void> {
  const batches: Array<{ type: CatalogLensType; names: readonly string[] }> = [
    { type: "single-vision", names: SINGLE_VISION_WHOLESALE_ITEMS },
    { type: "kryptok", names: KRYPTOK_WHOLESALE_ITEMS },
    { type: "progressive", names: PROGRESSIVE_WHOLESALE_ITEMS },
  ];

  for (const batch of batches) {
    for (let index = 0; index < batch.names.length; index += 1) {
      const name = batch.names[index];
      await prisma.catalogProductLine.upsert({
        where: {
          lensType_name: { lensType: batch.type, name },
        },
        create: {
          lensType: batch.type,
          name,
          sortOrder: index,
          isSystem: true,
          isActive: true,
        },
        update: {
          sortOrder: index,
          isSystem: true,
        },
      });
    }
  }
}
