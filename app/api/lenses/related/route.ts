import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  computeSelectableRangesForLenses,
  type SelectableRange,
} from "../../../lib/lens-power-range";
import { mapKryptokLensFields } from "../../../lib/kryptok-lens-map";
import { resolveProgressiveWholesaleItem } from "../../../lib/progressive-wholesale-catalog";
import { resolveSingleVisionWholesaleItem } from "../../../lib/single-vision-wholesale-catalog";
import {
  findKryptokFallback,
  findKryptokSiblings,
  findProgressiveFallback,
  findProgressiveSiblings,
  findSingleVisionFallback,
  findSingleVisionSiblings,
  isSameLensPower,
  pickRelatedLenses,
} from "../../../lib/related-lenses";
import { dedupeSingleVisionLenses } from "../../../lib/resolve-lens-stock";
import { attachLensTypeImageUrls } from "../../../lib/lens-catalog-images";

const TYPE_MAP: Record<string, "KRYPTOK" | "PROGRESSIVE" | "SINGLE_VISION"> = {
  kryptok: "KRYPTOK",
  progressive: "PROGRESSIVE",
  "single-vision": "SINGLE_VISION",
  singlevision: "SINGLE_VISION",
};

type UnifiedLensType = "KRYPTOK" | "PROGRESSIVE" | "SINGLE_VISION";

type RelatedLensResponseItem = {
  id: string;
  lensType: UnifiedLensType;
  costPrice: number | null;
  price: number;
  sph: number | null;
  sphStartRange?: number | null;
  cyl: number | null;
  cylStartRange?: number | null;
  crossPower: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
  quantity: number;
  createdAt: string;
  brand: string | null;
  item: string | null;
  coating: string | null;
  index?: number | null;
  selectableRange?: SelectableRange | null;
};

function mapKryptok(
  item: Awaited<ReturnType<typeof prisma.kryptokLens.findMany>>[number]
): RelatedLensResponseItem {
  const mapped = mapKryptokLensFields(item);
  return {
    ...mapped,
    lensType: "KRYPTOK",
    createdAt: item.createdAt.toISOString(),
  };
}

function mapProgressive(
  item: Awaited<ReturnType<typeof prisma.progressiveLens.findMany>>[number]
): RelatedLensResponseItem {
  return {
    id: item.id,
    lensType: "PROGRESSIVE",
    costPrice: item.costPrice !== null ? Number(item.costPrice) : null,
    price: Number(item.price),
    sph: Number(item.sph),
    sphStartRange:
      item.sphStartRange !== null && item.sphStartRange !== undefined
        ? Number(item.sphStartRange)
        : null,
    cyl: item.cyl !== null ? Number(item.cyl) : null,
    cylStartRange:
      item.cylStartRange !== null && item.cylStartRange !== undefined
        ? Number(item.cylStartRange)
        : null,
    crossPower: null,
    axis: item.axis,
    add: Number(item.add),
    eye: item.eye,
    quantity: item.quantity,
    createdAt: item.createdAt.toISOString(),
    brand: item.brand,
    item:
      resolveProgressiveWholesaleItem(item.category, item.item, item.type) ?? item.item,
    coating: item.coating,
  };
}

function mapSingleVision(
  item: Awaited<ReturnType<typeof prisma.singleVisionLens.findMany>>[number],
  selectableRange?: RelatedLensResponseItem["selectableRange"]
): RelatedLensResponseItem {
  return {
    id: item.id,
    lensType: "SINGLE_VISION",
    costPrice: item.costPrice !== null ? Number(item.costPrice) : null,
    price: Number(item.price),
    sph: item.sph !== null ? Number(item.sph) : null,
    cyl: item.cyl !== null ? Number(item.cyl) : null,
    crossPower: item.crossPower !== null ? Number(item.crossPower) : null,
    axis: null,
    add: null,
    eye: null,
    quantity: item.quantity,
    createdAt: item.createdAt.toISOString(),
    brand: item.brand,
    item:
      resolveSingleVisionWholesaleItem(
        item.category,
        item.brand,
        item.item,
        Number(item.index),
        item.coating
      ) ?? item.item,
    coating: item.coating,
    index: Number(item.index),
    selectableRange: selectableRange ?? null,
  };
}

async function attachSingleVisionRanges(
  rows: Awaited<ReturnType<typeof prisma.singleVisionLens.findMany>>
): Promise<RelatedLensResponseItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const productFilters = rows.map((lens) => ({
    category: lens.category,
    brand: lens.brand,
    item: lens.item,
    index: lens.index,
    coating: lens.coating,
  }));

  const siblings = dedupeSingleVisionLenses(
    await prisma.singleVisionLens.findMany({
      where: { OR: productFilters },
    })
  );

  const rangeById = computeSelectableRangesForLenses(siblings);

  return rows.map((row) => mapSingleVision(row, rangeById.get(row.id) ?? null));
}

// GET /api/lenses/related?id=...&lensType=kryptok|progressive|single-vision
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    const typeParam = (searchParams.get("lensType") ?? searchParams.get("type") ?? "")
      .toLowerCase()
      .trim();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const lensType = TYPE_MAP[typeParam];
    if (!lensType) {
      return NextResponse.json({ error: "Invalid lensType" }, { status: 400 });
    }

    const limit = 5;
    let pickedRows: RelatedLensResponseItem[] = [];
    let currentPower: { id: string; sph: number; cyl: number | null } | null = null;

    if (lensType === "KRYPTOK") {
      const { lens, siblings } = await findKryptokSiblings(id);
      if (!lens) {
        return NextResponse.json({ items: [] });
      }

      currentPower = {
        id: lens.id,
        sph: Number(lens.sph),
        cyl: lens.cyl !== null ? Number(lens.cyl) : null,
      };
      let picked = pickRelatedLenses(siblings, currentPower, limit);

      if (picked.length < limit) {
        const excludeIds = new Set([id, ...picked.map((row) => row.id)]);
        const fallback = (await findKryptokFallback(lens.brand, [...excludeIds])).filter(
          (row) => !excludeIds.has(row.id)
        );
        for (const row of pickRelatedLenses(fallback, currentPower, limit - picked.length)) {
          excludeIds.add(row.id);
          picked.push(row);
        }
      }

      pickedRows = picked.map(mapKryptok);
    }

    if (lensType === "PROGRESSIVE") {
      const { lens, siblings } = await findProgressiveSiblings(id);
      if (!lens) {
        return NextResponse.json({ items: [] });
      }

      currentPower = {
        id: lens.id,
        sph: Number(lens.sph),
        cyl: lens.cyl !== null ? Number(lens.cyl) : null,
      };
      let picked = pickRelatedLenses(siblings, currentPower, limit);

      if (picked.length < limit) {
        const excludeIds = new Set([id, ...picked.map((row) => row.id)]);
        const fallback = (await findProgressiveFallback(lens.brand, [...excludeIds])).filter(
          (row) => !excludeIds.has(row.id)
        );
        for (const row of pickRelatedLenses(fallback, currentPower, limit - picked.length)) {
          excludeIds.add(row.id);
          picked.push(row);
        }
      }

      pickedRows = picked.map(mapProgressive);
    }

    if (lensType === "SINGLE_VISION") {
      const { lens, siblings } = await findSingleVisionSiblings(id);
      if (!lens) {
        return NextResponse.json({ items: [] });
      }

      currentPower = {
        id: lens.id,
        sph: Number(lens.sph),
        cyl: lens.cyl !== null ? Number(lens.cyl) : null,
      };
      let picked = pickRelatedLenses(siblings, currentPower, limit);

      if (picked.length < limit) {
        const excludeIds = new Set([id, ...picked.map((row) => row.id)]);
        const fallback = (await findSingleVisionFallback(lens.brand, [...excludeIds])).filter(
          (row) => !excludeIds.has(row.id)
        );
        for (const row of pickRelatedLenses(fallback, currentPower, limit - picked.length)) {
          excludeIds.add(row.id);
          picked.push(row);
        }
      }

      pickedRows = await attachSingleVisionRanges(picked);
    }

    const uniqueById = new Map<string, RelatedLensResponseItem>();
    for (const row of pickedRows) {
      if (
        row.id !== id &&
        currentPower &&
        !isSameLensPower(
          { id: row.id, sph: row.sph, cyl: row.cyl },
          currentPower
        )
      ) {
        uniqueById.set(row.id, row);
      }
    }

    return NextResponse.json({
      items: await attachLensTypeImageUrls(
        Array.from(uniqueById.values()).slice(0, limit)
      ),
    });
  } catch (error) {
    console.error("Error fetching related lenses:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
