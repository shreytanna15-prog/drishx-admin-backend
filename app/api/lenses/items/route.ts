import { NextRequest, NextResponse } from "next/server";
import {
  buildKryptokItemCounts,
  buildProgressiveItemCounts,
  buildSingleVisionItemCounts,
} from "../../../lib/wholesale-catalog-counts";

type LensItemsType = "single-vision" | "kryptok" | "progressive";

const TYPE_MAP: Record<string, LensItemsType | null> = {
  "single-vision": "single-vision",
  singlevision: "single-vision",
  kryptok: "kryptok",
  progressive: "progressive",
};

// GET /api/lenses/items?type=single-vision|kryptok|progressive
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typeParam = (searchParams.get("type") ?? "").toLowerCase();
    const type = TYPE_MAP[typeParam];

    if (!type) {
      return NextResponse.json(
        { error: "Query param type is required (single-vision, kryptok, progressive)." },
        { status: 400 }
      );
    }

    if (type === "single-vision") {
      const items = await buildSingleVisionItemCounts();
      return NextResponse.json({ items });
    }

    if (type === "progressive") {
      const items = await buildProgressiveItemCounts();
      return NextResponse.json({ items });
    }

    const items = await buildKryptokItemCounts();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching lens items:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
