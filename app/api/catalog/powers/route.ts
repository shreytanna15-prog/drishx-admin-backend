import { NextRequest, NextResponse } from "next/server";
import { listShopCatalogPowers } from "@/app/lib/catalog/shop-stock";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    return NextResponse.json(await listShopCatalogPowers({
      q: searchParams.get("q") ?? undefined,
      page: Number(searchParams.get("page") ?? 1),
      limit: Number(searchParams.get("limit") ?? 24),
    }));
  } catch (error) {
    console.error("GET /api/catalog/powers", error);
    return NextResponse.json({ error: "Catalog unavailable." }, { status: 500 });
  }
}
