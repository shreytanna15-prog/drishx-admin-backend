import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { discoverLegacyProductGroups } from "../../../../lib/catalog/legacy-leaves";
import { prisma } from "../../../../lib/prisma";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

/**
 * GET /api/admin/catalog/legacy-unlinked
 * Read-only discovery of legacy lens identity groups not yet in CatalogProduct.
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get("limit") ?? "40") || 40)
    );

    const [groups, existing, linked] = await Promise.all([
      discoverLegacyProductGroups({ takePerFamily: 20000 }),
      prisma.catalogProduct.findMany({
        select: { id: true, identityKey: true },
      }),
      prisma.catalogRangeLeaf.findMany({
        select: { lensType: true, lensId: true },
      }),
    ]);

    const existingByKey = new Map(
      existing.map((p) => [p.identityKey, p.id] as const)
    );
    const linkedKeys = new Set(
      linked.map((l) => `${l.lensType}:${l.lensId}`)
    );

    const unlinked = groups
      .map((g) => {
        const productId = existingByKey.get(g.identityKey) ?? null;
        const unlinkedLeafCount = g.leaves.filter((leaf) => {
          const lensType =
            g.lensFamily === "SINGLE_VISION"
              ? "SINGLE_VISION"
              : g.lensFamily === "KRYPTOK"
                ? "KRYPTOK"
                : "PROGRESSIVE";
          return !linkedKeys.has(`${lensType}:${leaf.id}`);
        }).length;
        return {
          identityKey: g.identityKey,
          lensFamily: g.lensFamily,
          category: g.category,
          brand: g.brand,
          item: g.item,
          index: g.index,
          coating: g.coating,
          progressiveType: g.progressiveType,
          leafCount: g.leafCount,
          unlinkedLeafCount,
          existingCatalogProductId: productId,
          needsProductFacade: !productId,
          needsRangeLinks: unlinkedLeafCount > 0,
        };
      })
      .filter((g) => g.needsProductFacade || g.needsRangeLinks)
      .slice(0, limit);

    return NextResponse.json({
      totalGroups: groups.length,
      unlinkedCount: unlinked.length,
      groups: unlinked,
    });
  } catch (error) {
    console.error("GET /api/admin/catalog/legacy-unlinked", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
