import { prisma } from "./prisma";
import { listActiveLineNames, type CatalogLensType } from "./catalog-product-lines";
import { resolveKryptokWholesaleItem } from "./kryptok-wholesale-catalog";
import { resolveProgressiveWholesaleItem } from "./progressive-wholesale-catalog";
import { resolveSingleVisionWholesaleItem } from "./single-vision-wholesale-catalog";

export type CatalogItemCount = {
  name: string;
  productCount: number;
  /** True when the card was created from an unmatched DB category. */
  dynamic?: boolean;
};

function sortDynamicNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildFixedNameIndex(fixedItems: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const name of fixedItems) {
    index.set(normalizeKey(name), name);
  }
  return index;
}

function matchCustomFixedName(
  fixedIndex: Map<string, string>,
  candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    const match = fixedIndex.get(normalizeKey(trimmed));
    if (match) return match;
  }
  return null;
}

function buildFixedAndDynamicCounts<
  TRow extends { category: string | null; item?: string | null },
>(
  fixedItems: readonly string[],
  rows: TRow[],
  resolve: (row: TRow) => string | null
): CatalogItemCount[] {
  const fixedCounts = new Map<string, number>();
  for (const item of fixedItems) {
    fixedCounts.set(item, 0);
  }
  const fixedIndex = buildFixedNameIndex(fixedItems);
  const dynamicCounts = new Map<string, number>();

  for (const row of rows) {
    const resolved = resolve(row);
    if (resolved && fixedCounts.has(resolved)) {
      fixedCounts.set(resolved, (fixedCounts.get(resolved) ?? 0) + 1);
      continue;
    }

    // Admin-created fixed lines: SKUs match by category or item name.
    const customMatch = matchCustomFixedName(fixedIndex, [
      row.category,
      row.item ?? null,
    ]);
    if (customMatch) {
      fixedCounts.set(customMatch, (fixedCounts.get(customMatch) ?? 0) + 1);
      continue;
    }

    const categoryName = row.category?.trim() || "Other";
    dynamicCounts.set(categoryName, (dynamicCounts.get(categoryName) ?? 0) + 1);
  }

  const fixed = fixedItems.map((name) => ({
    name,
    productCount: fixedCounts.get(name) ?? 0,
  }));

  const dynamic = [...dynamicCounts.entries()]
    .sort(([a], [b]) => sortDynamicNames(a, b))
    .map(([name, productCount]) => ({
      name,
      productCount,
      dynamic: true as const,
    }));

  return [...fixed, ...dynamic];
}

export async function buildSingleVisionItemCounts(): Promise<CatalogItemCount[]> {
  const [fixedItems, rows] = await Promise.all([
    listActiveLineNames("single-vision"),
    prisma.singleVisionLens.findMany({
      select: {
        category: true,
        brand: true,
        item: true,
        index: true,
        coating: true,
      },
    }),
  ]);

  return buildFixedAndDynamicCounts(fixedItems, rows, (row) =>
    resolveSingleVisionWholesaleItem(
      row.category,
      row.brand,
      row.item,
      row.index !== null && row.index !== undefined ? Number(row.index) : null,
      row.coating
    )
  );
}

export async function buildKryptokItemCounts(): Promise<CatalogItemCount[]> {
  const [fixedItems, rows] = await Promise.all([
    listActiveLineNames("kryptok"),
    prisma.kryptokLens.findMany({
      select: { category: true, coating: true, item: true },
    }),
  ]);

  return buildFixedAndDynamicCounts(fixedItems, rows, (row) =>
    resolveKryptokWholesaleItem(row.category, row.coating, row.item)
  );
}

export async function buildProgressiveItemCounts(): Promise<CatalogItemCount[]> {
  const [fixedItems, rows] = await Promise.all([
    listActiveLineNames("progressive"),
    prisma.progressiveLens.findMany({
      select: { category: true, item: true, type: true },
    }),
  ]);

  return buildFixedAndDynamicCounts(fixedItems, rows, (row) =>
    resolveProgressiveWholesaleItem(row.category, row.item, row.type)
  );
}

export async function countProductsForLine(
  type: CatalogLensType,
  itemName: string
): Promise<number> {
  const items =
    type === "single-vision"
      ? await buildSingleVisionItemCounts()
      : type === "kryptok"
        ? await buildKryptokItemCounts()
        : await buildProgressiveItemCounts();

  const match = items.find(
    (entry) => entry.name.toLowerCase() === itemName.trim().toLowerCase()
  );
  return match?.productCount ?? 0;
}

export function sumCatalogItemCounts(items: CatalogItemCount[]): number {
  return items.reduce((total, item) => total + item.productCount, 0);
}
