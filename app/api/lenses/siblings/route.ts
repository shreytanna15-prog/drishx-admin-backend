import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  dedupeKryptokLenses,
  dedupeProgressiveLenses,
  dedupeSingleVisionLenses,
} from "../../../lib/resolve-lens-stock";
import {
  applyCompoundNoPlano,
  computeSelectableRangesForLensGroups,
  computeSelectableRangesForLenses,
  kryptokProductKey,
  progressiveProductKey,
  type SelectableRange,
} from "../../../lib/lens-power-range";
import { mapKryptokLensFields } from "../../../lib/kryptok-lens-map";
import { resolveProgressiveWholesaleItem } from "../../../lib/progressive-wholesale-catalog";
import { attachLensTypeImageUrls } from "../../../lib/lens-catalog-images";
import { resolveSingleVisionWholesaleItem } from "../../../lib/single-vision-wholesale-catalog";
import {
  findKryptokSiblings,
  findProgressiveSiblings,
  findSingleVisionSiblings,
} from "../../../lib/related-lenses";

const TYPE_MAP: Record<string, "KRYPTOK" | "PROGRESSIVE" | "SINGLE_VISION"> = {
  kryptok: "KRYPTOK",
  progressive: "PROGRESSIVE",
  "single-vision": "SINGLE_VISION",
  singlevision: "SINGLE_VISION",
};

type SiblingLensResponseItem = {
  id: string;
  lensType: "KRYPTOK" | "PROGRESSIVE" | "SINGLE_VISION";
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
  selectableRange: SelectableRange;
};

function mapKryptok(
  item: Awaited<ReturnType<typeof prisma.kryptokLens.findMany>>[number],
  selectableRange: SelectableRange
): SiblingLensResponseItem {
  const mapped = mapKryptokLensFields(item);
  return {
    ...mapped,
    lensType: "KRYPTOK",
    createdAt: item.createdAt.toISOString(),
    selectableRange,
  };
}

function mapProgressive(
  item: Awaited<ReturnType<typeof prisma.progressiveLens.findMany>>[number],
  selectableRange: SelectableRange
): SiblingLensResponseItem {
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
    selectableRange,
  };
}

function mapSingleVision(
  item: Awaited<ReturnType<typeof prisma.singleVisionLens.findMany>>[number],
  selectableRange: SelectableRange
): SiblingLensResponseItem {
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
    selectableRange,
  };
}

// GET /api/lenses/siblings?id=...&lensType=kryptok|progressive|single-vision
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

    if (lensType === "KRYPTOK") {
      const { siblings } = await findKryptokSiblings(id);
      const rangeById = computeSelectableRangesForLensGroups(siblings, kryptokProductKey);
      const items = await attachLensTypeImageUrls(
        siblings.map((row) =>
          mapKryptok(row, applyCompoundNoPlano(row, rangeById.get(row.id)!))
        )
      );
      return NextResponse.json({ items });
    }

    if (lensType === "PROGRESSIVE") {
      const { siblings } = await findProgressiveSiblings(id);
      const rangeById = computeSelectableRangesForLensGroups(siblings, progressiveProductKey);
      const items = await attachLensTypeImageUrls(
        siblings.map((row) =>
          mapProgressive(row, applyCompoundNoPlano(row, rangeById.get(row.id)!))
        )
      );
      return NextResponse.json({ items });
    }

    const { siblings } = await findSingleVisionSiblings(id);
    const rangeById = computeSelectableRangesForLenses(siblings);
    const items = await attachLensTypeImageUrls(
      siblings.map((row) => mapSingleVision(row, rangeById.get(row.id)!))
    );
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching lens siblings:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
