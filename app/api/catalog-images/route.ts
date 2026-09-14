import { NextResponse } from "next/server";
import {
  HOME_CATEGORY_IMAGE_KEYS,
  SHOP_CATEGORY_IMAGE_KEYS,
  resolveAllCatalogImageUrls,
} from "../../lib/lens-catalog-images";

// GET /api/catalog-images
// Returns signed URLs for the 6 lens catalog images + category maps.
export async function GET() {
  try {
    const images = await resolveAllCatalogImageUrls();
    return NextResponse.json({
      images,
      homeCategories: HOME_CATEGORY_IMAGE_KEYS,
      shopCategories: SHOP_CATEGORY_IMAGE_KEYS,
    });
  } catch (error) {
    console.error("GET /api/catalog-images error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
