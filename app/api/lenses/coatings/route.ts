import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { buildKryptokWholesaleItemWhere } from "../../../lib/kryptok-wholesale-catalog";
import { buildProgressiveWholesaleItemWhere } from "../../../lib/progressive-wholesale-catalog";
import { buildSingleVisionWholesaleItemWhere } from "../../../lib/single-vision-wholesale-catalog";
import {
  buildPowerShapeWhere,
  isHardcoatGradeCoating,
  powerShapeNullabilityForType,
  type PowerShapeFilter,
} from "../../../lib/lens-power-shape-filter";
import {
  ensureCoatingFilterLabelsSynced,
  listCoatingFilterLabels,
} from "../../../lib/coating-filter-labels";
import { intersectCoatingsWithManagedLabels } from "../../../lib/coating-filter-intersect";
import type { Prisma } from "@prisma/client";

type LensCoatingsType = "single-vision" | "kryptok" | "progressive";

const TYPE_MAP: Record<string, LensCoatingsType | null> = {
  "single-vision": "single-vision",
  singlevision: "single-vision",
  kryptok: "kryptok",
  progressive: "progressive",
};

const POWER_SHAPE_ORDER: PowerShapeFilter[] = ["sph", "cyl", "compound"];

type CoatingCount = { coating: string; count: number };

/**
 * Dedupe coatings by lowercased trim; keep the casing with the highest count.
 */
function normalizeCoatings(rows: Array<{ coating: string | null; count: number }>): string[] {
  const byKey = new Map<string, CoatingCount>();

  for (const row of rows) {
    const raw = row.coating?.trim() ?? "";
    if (!raw) continue;
    const key = raw.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { coating: raw, count: row.count });
      continue;
    }
    existing.count += row.count;
    if (row.count > existing.count - row.count) {
      existing.coating = raw;
    }
  }

  return Array.from(byKey.values())
    .map((entry) => entry.coating)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Color / surface coatings that are useful chip labels (excludes hardcoat grades). */
function filterColorCoatings(coatings: string[]): string[] {
  return coatings.filter((coating) => !isHardcoatGradeCoating(coating));
}

function itemWhereForType(
  type: LensCoatingsType,
  itemName: string
): Prisma.SingleVisionLensWhereInput | Prisma.KryptokLensWhereInput | Prisma.ProgressiveLensWhereInput {
  const trimmedItem = itemName.trim();
  if (!trimmedItem) return {};

  if (type === "single-vision") {
    return buildSingleVisionWholesaleItemWhere(trimmedItem);
  }
  if (type === "progressive") {
    return buildProgressiveWholesaleItemWhere(trimmedItem);
  }
  return buildKryptokWholesaleItemWhere(trimmedItem);
}

async function loadCoatingsForType(
  type: LensCoatingsType,
  itemName: string
): Promise<string[]> {
  const where = itemWhereForType(type, itemName);

  if (type === "single-vision") {
    const groups = await prisma.singleVisionLens.groupBy({
      by: ["coating"],
      where: where as Prisma.SingleVisionLensWhereInput,
      _count: { _all: true },
    });
    return normalizeCoatings(
      groups.map((g) => ({ coating: g.coating, count: g._count._all }))
    );
  }

  if (type === "progressive") {
    const groups = await prisma.progressiveLens.groupBy({
      by: ["coating"],
      where: where as Prisma.ProgressiveLensWhereInput,
      _count: { _all: true },
    });
    return normalizeCoatings(
      groups.map((g) => ({ coating: g.coating, count: g._count._all }))
    );
  }

  const groups = await prisma.kryptokLens.groupBy({
    by: ["coating"],
    where: {
      AND: [where as Prisma.KryptokLensWhereInput, { coating: { not: null } }],
    },
    _count: { _all: true },
  });
  return normalizeCoatings(
    groups.map((g) => ({ coating: g.coating, count: g._count._all }))
  );
}

async function countPowerShape(
  type: LensCoatingsType,
  itemWhere: Record<string, unknown>,
  shape: PowerShapeFilter
): Promise<number> {
  const shapeWhere = buildPowerShapeWhere(
    shape,
    powerShapeNullabilityForType(type)
  );
  if (!shapeWhere) return 0;

  const where = {
    AND: [itemWhere, shapeWhere],
  };

  if (type === "single-vision") {
    return prisma.singleVisionLens.count({
      where: where as Prisma.SingleVisionLensWhereInput,
    });
  }
  if (type === "progressive") {
    return prisma.progressiveLens.count({
      where: where as Prisma.ProgressiveLensWhereInput,
    });
  }
  return prisma.kryptokLens.count({
    where: where as Prisma.KryptokLensWhereInput,
  });
}

async function loadAvailablePowerShapes(
  type: LensCoatingsType,
  itemName: string
): Promise<PowerShapeFilter[]> {
  const itemWhere = itemWhereForType(type, itemName) as Record<string, unknown>;
  const available: PowerShapeFilter[] = [];

  for (const shape of POWER_SHAPE_ORDER) {
    const count = await countPowerShape(type, itemWhere, shape);
    if (count > 0) {
      available.push(shape);
    }
  }

  return available;
}

// GET /api/lenses/coatings?type=single-vision|kryptok|progressive&item=BRC
// Returns:
//   coatings: managed active coating labels that still have products under this item
//   powerShapes: sph | cyl | compound present in the subcategory
//   When coatings is empty (e.g. hardcoat H/C), the client shows powerShapes chips.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typeParam = (searchParams.get("type") ?? "").toLowerCase();
    const type = TYPE_MAP[typeParam];
    const item = searchParams.get("item") ?? "";

    if (!type) {
      return NextResponse.json(
        {
          error:
            "Query param type is required (single-vision, kryptok, progressive).",
        },
        { status: 400 }
      );
    }

    const [rawCoatings, powerShapes, managedLabels] = await Promise.all([
      loadCoatingsForType(type, item),
      loadAvailablePowerShapes(type, item),
      (async () => {
        try {
          await ensureCoatingFilterLabelsSynced(type);
          return listCoatingFilterLabels(type, { includeInactive: true });
        } catch (error) {
          console.warn(
            "coating filters: managed labels unavailable, falling back to live coatings",
            error
          );
          return [];
        }
      })(),
    ]);

    const coatings =
      managedLabels.length > 0
        ? intersectCoatingsWithManagedLabels(rawCoatings, managedLabels)
        : filterColorCoatings(rawCoatings);

    return NextResponse.json({ coatings, powerShapes });
  } catch (error) {
    console.error("Error fetching lens coatings:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
