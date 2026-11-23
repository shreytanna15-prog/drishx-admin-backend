import { redirect } from "next/navigation";

/**
 * Legacy stock-matrix is replaced by the live catalog parent matrix (S1/S5).
 * Keep this route as a redirect so old bookmarks still land somewhere useful.
 */
export default function LegacyStockMatrixRedirectPage() {
  redirect("/inventory/products-catalog");
}
