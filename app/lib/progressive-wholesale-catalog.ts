import type { Prisma } from "@prisma/client";

/** Wholesale Progressive (V2) item cards — fixed order from product catalog. */
export const PROGRESSIVE_WHOLESALE_ITEMS = [
  "HC V2",
  "PG HC V2",
  "BRC V2",
  "Poly BRC V2",
  "PG BRC V2",
  "PG Poly BRC V2",
] as const;

export type ProgressiveWholesaleItem = (typeof PROGRESSIVE_WHOLESALE_ITEMS)[number];

const WHOLESALE_ITEM_SET = new Set<string>(PROGRESSIVE_WHOLESALE_ITEMS);

/**
 * `category` values written by price-sheet seed scripts.
 * Mapped to wholesale cards without changing stored DB rows.
 */
const DB_CATEGORY = {
  whiteProgressive: "WHITE PROGRESSIVE",
  pgProgressive: "PG PROGRESSIVE",
  pgBrHmc: "PG BR HMC",
  photoBrownBrProg: "PHOTO BROWN BR PROG",
  brcV2: "BRC V2",
  proTron94: "Pro-Tron 9+4 Design",
  polyProgressiveBlueCut: "POLY PROGRESSIVE BLUE CUT",
  polyProgressive: "POLY PROGRESSIVE",
  polyPgBr: "POLY PG BR",
} as const;

/** More specific lines first when resolving a single lens row. */
const RESOLVE_PRIORITY: ProgressiveWholesaleItem[] = [
  "PG Poly BRC V2",
  "PG BRC V2",
  "Poly BRC V2",
  "BRC V2",
  "PG HC V2",
  "HC V2",
];

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function categoryEquals(category: string, expected: string): boolean {
  return normalizeKey(category) === normalizeKey(expected);
}

function itemContains(item: string | null | undefined, fragment: string): boolean {
  if (!item?.trim()) {
    return false;
  }
  return normalizeKey(item).includes(normalizeKey(fragment));
}

function isBlueCutCategory(category: string | null | undefined): boolean {
  if (!category?.trim()) {
    return false;
  }
  const norm = normalizeKey(category);
  if (norm.includes("WITHOUT")) {
    return false;
  }
  return norm === "BLUE CUT" || norm.endsWith("BLUE CUT");
}

function isWithoutBlueCutCategory(category: string | null | undefined): boolean {
  if (!category?.trim()) {
    return false;
  }
  const norm = normalizeKey(category);
  return norm.includes("WITHOUT") || norm === "WHITE";
}

/** Photogrey progressive lines (non blue-cut). */
export function isPhotogreyProgressiveItem(item: string | null | undefined): boolean {
  if (!item?.trim()) {
    return false;
  }
  const norm = normalizeKey(item);
  return (
    norm.includes("PG BR") ||
    norm.includes("PHOTO") ||
    norm.includes("BROWN") ||
    norm.includes("POLY PG BR") ||
    (norm.startsWith("PG ") && !norm.includes("BLUE CUT"))
  );
}

function isHcType(type: string | null | undefined): boolean {
  if (!type?.trim()) {
    return false;
  }
  const norm = normalizeKey(type);
  return norm === "HC" || norm === "H.C." || norm === "HARD COAT";
}

function categoryFilter(value: string): Prisma.ProgressiveLensWhereInput {
  return { category: { equals: value, mode: "insensitive" } };
}

function hcTypeFilter(): Prisma.ProgressiveLensWhereInput {
  return {
    OR: [
      { type: { equals: "HC", mode: "insensitive" } },
      { type: { equals: "H.C.", mode: "insensitive" } },
    ],
  };
}

function mergeOr(clauses: Prisma.ProgressiveLensWhereInput[]): Prisma.ProgressiveLensWhereInput {
  if (clauses.length === 0) {
    return {};
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return { OR: clauses };
}

export function isProgressiveWholesaleItem(value: string): value is ProgressiveWholesaleItem {
  return WHOLESALE_ITEM_SET.has(value.trim());
}

function matchesDbPgPolyBrcV2(category: string): boolean {
  return categoryEquals(category, DB_CATEGORY.polyPgBr);
}

function matchesDbPolyBrcV2(category: string): boolean {
  return (
    categoryEquals(category, DB_CATEGORY.polyProgressiveBlueCut) ||
    categoryEquals(category, DB_CATEGORY.polyProgressive)
  );
}

function matchesDbBrcV2(category: string): boolean {
  return (
    categoryEquals(category, DB_CATEGORY.brcV2) ||
    categoryEquals(category, DB_CATEGORY.proTron94)
  );
}

function matchesDbPgBrcV2(category: string): boolean {
  return categoryEquals(category, DB_CATEGORY.pgBrHmc);
}

function matchesDbPgHcV2(category: string): boolean {
  return (
    categoryEquals(category, DB_CATEGORY.pgProgressive) ||
    categoryEquals(category, DB_CATEGORY.photoBrownBrProg)
  );
}

function matchesDbHcV2(category: string, item: string, type?: string | null): boolean {
  return categoryEquals(category, DB_CATEGORY.whiteProgressive) && isHcType(type);
}

function lensMatchesWholesaleItem(
  itemName: ProgressiveWholesaleItem,
  category: string,
  item: string,
  type?: string | null
): boolean {
  switch (itemName) {
    case "PG Poly BRC V2":
      return (
        (isBlueCutCategory(category) && itemContains(item, "POLY PG")) ||
        matchesDbPgPolyBrcV2(category)
      );
    case "PG BRC V2":
      return (
        (isBlueCutCategory(category) &&
          itemContains(item, "PG") &&
          itemContains(item, "BLUE CUT") &&
          !itemContains(item, "POLY PG")) ||
        matchesDbPgBrcV2(category)
      );
    case "Poly BRC V2":
      return (
        (isBlueCutCategory(category) &&
          itemContains(item, "POLY") &&
          itemContains(item, "BLUE CUT") &&
          !itemContains(item, "PG")) ||
        matchesDbPolyBrcV2(category)
      );
    case "BRC V2":
      return (
        (isBlueCutCategory(category) &&
          !itemContains(item, "PG") &&
          !itemContains(item, "POLY")) ||
        matchesDbBrcV2(category)
      );
    case "PG HC V2":
      return (
        (isWithoutBlueCutCategory(category) && isPhotogreyProgressiveItem(item)) ||
        matchesDbPgHcV2(category)
      );
    case "HC V2":
      return (
        (isWithoutBlueCutCategory(category) &&
          isHcType(type) &&
          !isPhotogreyProgressiveItem(item)) ||
        matchesDbHcV2(category, item, type)
      );
    default:
      return false;
  }
}

/** Resolve a lens row to its wholesale catalog item name. */
export function resolveProgressiveWholesaleItem(
  category: string | null | undefined,
  item: string | null | undefined,
  type?: string | null | undefined
): ProgressiveWholesaleItem | null {
  const categoryName = category?.trim();
  const itemName = item?.trim();
  if (!categoryName || !itemName) {
    return null;
  }

  if (isProgressiveWholesaleItem(itemName)) {
    return itemName;
  }

  for (const wholesaleItem of RESOLVE_PRIORITY) {
    if (lensMatchesWholesaleItem(wholesaleItem, categoryName, itemName, type)) {
      return wholesaleItem;
    }
  }

  return null;
}

function legacyPgPolyBrcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    AND: [
      { category: { equals: "BLUE CUT", mode: "insensitive" } },
      { item: { contains: "POLY PG", mode: "insensitive" } },
    ],
  };
}

function dbPgPolyBrcV2Where(): Prisma.ProgressiveLensWhereInput {
  return categoryFilter(DB_CATEGORY.polyPgBr);
}

function legacyPgBrcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    AND: [
      { category: { equals: "BLUE CUT", mode: "insensitive" } },
      { item: { contains: "PG", mode: "insensitive" } },
      { item: { contains: "BLUE CUT", mode: "insensitive" } },
      { NOT: { item: { contains: "POLY PG", mode: "insensitive" } } },
    ],
  };
}

function dbPgBrcV2Where(): Prisma.ProgressiveLensWhereInput {
  return categoryFilter(DB_CATEGORY.pgBrHmc);
}

function legacyPolyBrcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    AND: [
      { category: { equals: "BLUE CUT", mode: "insensitive" } },
      { item: { contains: "POLY", mode: "insensitive" } },
      { item: { contains: "BLUE CUT", mode: "insensitive" } },
      { NOT: { item: { contains: "PG", mode: "insensitive" } } },
    ],
  };
}

function dbPolyBrcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    OR: [
      categoryFilter(DB_CATEGORY.polyProgressiveBlueCut),
      categoryFilter(DB_CATEGORY.polyProgressive),
    ],
  };
}

function legacyBrcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    AND: [
      { category: { equals: "BLUE CUT", mode: "insensitive" } },
      { NOT: { item: { contains: "PG", mode: "insensitive" } } },
      { NOT: { item: { contains: "POLY", mode: "insensitive" } } },
    ],
  };
}

function dbBrcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    OR: [categoryFilter(DB_CATEGORY.brcV2), categoryFilter(DB_CATEGORY.proTron94)],
  };
}

function legacyPgHcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    AND: [
      {
        OR: [
          { category: { equals: "WITHOUT BLUE CUT", mode: "insensitive" } },
          { category: { equals: "WHITE", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { item: { contains: "PG BR", mode: "insensitive" } },
          { item: { contains: "PHOTO", mode: "insensitive" } },
          { item: { contains: "BROWN", mode: "insensitive" } },
          { item: { contains: "POLY PG BR", mode: "insensitive" } },
        ],
      },
    ],
  };
}

function dbPgHcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    OR: [
      categoryFilter(DB_CATEGORY.pgProgressive),
      categoryFilter(DB_CATEGORY.photoBrownBrProg),
    ],
  };
}

function legacyHcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    AND: [
      {
        OR: [
          { category: { equals: "WITHOUT BLUE CUT", mode: "insensitive" } },
          { category: { equals: "WHITE", mode: "insensitive" } },
        ],
      },
      hcTypeFilter(),
      { NOT: { item: { contains: "PG BR", mode: "insensitive" } } },
      { NOT: { item: { contains: "PHOTO", mode: "insensitive" } } },
      { NOT: { item: { contains: "BROWN", mode: "insensitive" } } },
      { NOT: { item: { contains: "POLY PG BR", mode: "insensitive" } } },
    ],
  };
}

function dbHcV2Where(): Prisma.ProgressiveLensWhereInput {
  return {
    AND: [categoryFilter(DB_CATEGORY.whiteProgressive), hcTypeFilter()],
  };
}

/** Prisma filter for products under a wholesale Progressive item. */
export function buildProgressiveWholesaleItemWhere(
  displayItem: string
): Prisma.ProgressiveLensWhereInput {
  const trimmed = displayItem.trim();

  if (!isProgressiveWholesaleItem(trimmed)) {
    return {
      OR: [
        { category: { equals: trimmed, mode: "insensitive" } },
        { item: { equals: trimmed, mode: "insensitive" } },
      ],
    };
  }

  switch (trimmed) {
    case "PG Poly BRC V2":
      return mergeOr([legacyPgPolyBrcV2Where(), dbPgPolyBrcV2Where()]);
    case "PG BRC V2":
      return mergeOr([legacyPgBrcV2Where(), dbPgBrcV2Where()]);
    case "Poly BRC V2":
      return mergeOr([legacyPolyBrcV2Where(), dbPolyBrcV2Where()]);
    case "BRC V2":
      return mergeOr([legacyBrcV2Where(), dbBrcV2Where()]);
    case "PG HC V2":
      return mergeOr([legacyPgHcV2Where(), dbPgHcV2Where()]);
    case "HC V2":
      return mergeOr([legacyHcV2Where(), dbHcV2Where()]);
    default:
      return { item: { equals: trimmed, mode: "insensitive" } };
  }
}
