import { NextRequest, NextResponse } from "next/server";
import {
  listPublicStorefrontCards,
  StorefrontCatalogError,
} from "@/app/lib/storefront/storefront-catalog";

// GET /api/storefront/cards?family=SV|single-vision
export async function GET(req: NextRequest) {
  try {
    const family =
      req.nextUrl.searchParams.get("family") ??
      req.nextUrl.searchParams.get("type") ??
      "";
    const items = await listPublicStorefrontCards(family);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/storefront/cards", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
