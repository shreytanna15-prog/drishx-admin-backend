import { NextRequest, NextResponse } from "next/server";
import {
  listPublicStorefrontFacets,
  StorefrontCatalogError,
} from "@/app/lib/storefront/storefront-catalog";

// GET /api/storefront/facets?cardId=
export async function GET(req: NextRequest) {
  try {
    const cardId = req.nextUrl.searchParams.get("cardId")?.trim() ?? "";
    if (!cardId) {
      return NextResponse.json(
        { error: "cardId is required." },
        { status: 400 }
      );
    }
    const result = await listPublicStorefrontFacets(cardId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/storefront/facets", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}