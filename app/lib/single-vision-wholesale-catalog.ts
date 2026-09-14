import type { Prisma } from "@prisma/client";

/** Wholesale Single Vision item cards — fixed order from product catalog. */
export const SINGLE_VISION_WHOLESALE_ITEMS = [
  "BRC",
  "Poly BRC",
  "PG BRC",
  "PG Poly BRC",
  "H/C",
  "PG H/C",
  "MARI-BLUE",
  "BRC 1.67",
  "VIOLET",
  "Eyeconic-DUAL",
] as const;

export type SingleVisionWholesaleItem = (typeof SINGLE_VISION_WHOLESALE_ITEMS)[number];

const WHOLESALE_ITEM_SET = new Set<string>(SINGLE_VISION_WHOLESALE_ITEMS);

const INDEX_167 = 1.67;

/**
 * `category` / `item` values from price-sheet seed scripts.
 * Mapped to wholesale cards without changing stored DB rows.
 */
const DB_CATEGORY = {
  dualCoating: "DUAL COATING",
  hardcoat: "Hardcoat",
  optimaxPgBlueCut: "OPTIMAX SV PG BLUE CUT",
  pgBlueCut: "PG BLUE CUT",
  pgBrGreen: "PG BR Green",
  blueCutSv: "BLUE CUT SV",
  brc: "BRC",
  blueCut: "BLUE CUT",
  blueCutSv156Premium: "BLUE CUT SV 1.56 Premium Range",
  whiteSvBlueCut: "WHITE SV BLUE CUT",
} as const;

const DB_ITEM = {
  hardcoat: "single vision hard coat",
  pgSvHiIndex: "PG SV Hi-index",
} as const;

/** More specific lines first when resolving a single lens row. */
const RESOLVE_PRIORITY: SingleVisionWholesaleItem[] = [
  "VIOLET",
  "Eyeconic-DUAL",
  "PG Poly BRC",
  "PG BRC",
  "Poly BRC",
  "BRC 1.67",
  "MARI-BLUE",
  "PG H/C",
  "BRC",
  "H/C",
];

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function categoryEquals(category: string | null | undefined, expected: string): boolean {
  if (!category?.trim()) {
    return false;
  }
  return normalizeKey(category) === normalizeKey(expected);
}

function textContains(value: string | null | undefined, fragment: string): boolean {
  if (!value?.trim()) {
    return false;
  }
  return normalizeKey(value).includes(normalizeKey(fragment));
}

function categoryFilter(value: string): Prisma.SingleVisionLensWhereInput {
  return { category: { equals: value, mode: "insensitive" } };
}

function mergeOr(clauses: Prisma.SingleVisionLensWhereInput[]): Prisma.SingleVisionLensWhereInput {
  if (clauses.length === 0) {
    return {};
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return { OR: clauses };
}

function isPhotogreyLine(
  category: string | null | undefined,
  brand: string | null | undefined,
  item: string | null | undefined
): boolean {
  return (
    textContains(category, "PHOTOGREY") ||
    textContains(category, "PG SV") ||
    textContains(brand, "PG HC") ||
    textContains(brand, "SOLAR-X") ||
    (textContains(brand, "PG") && !textContains(item, "POLY PG"))
  );
}

function isPolyLine(
  category: string | null | undefined,
  brand: string | null | undefined,
  item: string | null | undefined
): boolean {
  return (
    textContains(category, "POLY") ||
    textContains(item, "POLY") ||
    textContains(brand, "POLY")
  );
}

function isBlueCutLine(
  category: string | null | undefined,
  item: string | null | undefined
): boolean {
  return textContains(category, "BLUE CUT") || textContains(item, "BLUE CUT");
}

function isMariBlueBrand(brand: string | null | undefined): boolean {
  if (!brand?.trim()) {
    return false;
  }
  const norm = normalizeKey(brand);
  return norm === "MARI-BLU" || norm === "MARI BLU" || norm === "MARI-BLUE";
}

function isHcCoating(coating: string | null | undefined): boolean {
  if (!coating?.trim()) {
    return false;
  }
  const norm = normalizeKey(coating);
  return norm === "HC" || norm === "H.C." || norm === "HARD COAT";
}

function isIndex167(index: number | string | null | undefined): boolean {
  if (index === null || index === undefined) {
    return false;
  }
  return Math.abs(Number(index) - INDEX_167) < 0.001;
}

function isVioletCoating(coating: string | null | undefined): boolean {
  return textContains(coating, "VIOLET");
}

export function isSingleVisionWholesaleItem(value: string): value is SingleVisionWholesaleItem {
  return WHOLESALE_ITEM_SET.has(value.trim());
}

function matchesDbViolet(
  category: string | null | undefined,
  item: string | null | undefined,
  coating: string | null | undefined
): boolean {
  if (!isVioletCoating(coating)) {
    return false;
  }
  return (
    textContains(item, "SPECIAL COLORS") ||
    categoryEquals(category, DB_CATEGORY.whiteSvBlueCut) ||
    textContains(category, "BLUE CUT")
  );
}

function matchesDbEyeconicDual(category: string | null | undefined): boolean {
  return categoryEquals(category, DB_CATEGORY.dualCoating);
}

function matchesDbPgPolyBrc(
  category: string | null | undefined,
  brand: string | null | undefined,
  item: string | null | undefined
): boolean {
  return (
    (categoryEquals(category, DB_CATEGORY.blueCutSv) &&
      (textContains(item, "POLY PG") || textContains(brand, "POLY PG"))) ||
    categoryEquals(category, "SUPER PG POLY BLUE CUT")
  );
}

function matchesDbPgBrc(category: string | null | undefined): boolean {
  return (
    categoryEquals(category, DB_CATEGORY.optimaxPgBlueCut) ||
    categoryEquals(category, DB_CATEGORY.pgBlueCut)
  );
}

function matchesDbPgHc(
  category: string | null | undefined,
  item: string | null | undefined
): boolean {
  return (
    categoryEquals(category, DB_CATEGORY.pgBrGreen) ||
    textContains(item, DB_ITEM.pgSvHiIndex)
  );
}

function matchesDbHc(
  category: string | null | undefined,
  item: string | null | undefined
): boolean {
  return (
    categoryEquals(category, DB_CATEGORY.hardcoat) ||
    textContains(item, DB_ITEM.hardcoat)
  );
}

function matchesDbBrc167(category: string | null | undefined, index: number | string | null | undefined): boolean {
  return categoryEquals(category, DB_CATEGORY.brc) && isIndex167(index);
}

function matchesDbBrc(
  category: string | null | undefined,
  brand: string | null | undefined,
  item: string | null | undefined,
  index: number | string | null | undefined
): boolean {
  if (isMariBlueBrand(brand)) {
    return false;
  }
  if (matchesDbBrc167(category, index)) {
    return false;
  }
  return (
    categoryEquals(category, DB_CATEGORY.blueCut) ||
    categoryEquals(category, DB_CATEGORY.blueCutSv156Premium) ||
    categoryEquals(category, DB_CATEGORY.brc)
  );
}

function lensMatchesWholesaleItem(
  itemName: SingleVisionWholesaleItem,
  category: string | null | undefined,
  brand: string | null | undefined,
  item: string | null | undefined,
  index: number | string | null | undefined,
  coating: string | null | undefined
): boolean {
  switch (itemName) {
    case "VIOLET":
      return (
        matchesDbViolet(category, item, coating) ||
        (textContains(item, "SPECIAL COLORS") && isVioletCoating(coating))
      );
    case "Eyeconic-DUAL":
      return (
        matchesDbEyeconicDual(category) ||
        (textContains(item, "SPECIAL COLORS") &&
          textContains(brand, "EYECONIC") &&
          textContains(coating, "DUAL"))
      );
    case "PG Poly BRC":
      return (
        matchesDbPgPolyBrc(category, brand, item) ||
        (isPhotogreyLine(category, brand, item) &&
          isPolyLine(category, brand, item) &&
          isBlueCutLine(category, item))
      );
    case "PG BRC":
      return (
        matchesDbPgBrc(category) ||
        (isPhotogreyLine(category, brand, item) &&
          isBlueCutLine(category, item) &&
          !isPolyLine(category, brand, item))
      );
    case "Poly BRC":
      return (
        isPolyLine(category, brand, item) &&
        isBlueCutLine(category, item) &&
        !isPhotogreyLine(category, brand, item)
      );
    case "BRC 1.67":
      return (
        matchesDbBrc167(category, index) ||
        (isIndex167(index) &&
          isBlueCutLine(category, item) &&
          !isPhotogreyLine(category, brand, item) &&
          !isPolyLine(category, brand, item) &&
          !isMariBlueBrand(brand))
      );
    case "MARI-BLUE":
      return isMariBlueBrand(brand);
    case "PG H/C":
      return (
        matchesDbPgHc(category, item) ||
        (isPhotogreyLine(category, brand, item) &&
          !isBlueCutLine(category, item) &&
          (textContains(category, "WITHOUT BLUE") ||
            isHcCoating(coating) ||
            textContains(brand, "PG HC")))
      );
    case "H/C":
      return (
        matchesDbHc(category, item) ||
        ((textContains(category, "HC SV") || isHcCoating(coating)) &&
          !isPhotogreyLine(category, brand, item) &&
          !textContains(item, "SPECIAL COLORS"))
      );
    case "BRC":
      return (
        matchesDbBrc(category, brand, item, index) ||
        (isBlueCutLine(category, item) &&
          !isPhotogreyLine(category, brand, item) &&
          !isPolyLine(category, brand, item) &&
          !textContains(item, "SPECIAL COLORS") &&
          !isIndex167(index) &&
          !isMariBlueBrand(brand))
      );
    default:
      return false;
  }
}

/** Resolve a lens row to its wholesale catalog item name. */
export function resolveSingleVisionWholesaleItem(
  category: string | null | undefined,
  brand: string | null | undefined,
  item: string | null | undefined,
  index?: number | string | null | undefined,
  coating?: string | null | undefined
): SingleVisionWholesaleItem | null {
  if (isSingleVisionWholesaleItem(item ?? "")) {
    return item as SingleVisionWholesaleItem;
  }

  for (const wholesaleItem of RESOLVE_PRIORITY) {
    if (lensMatchesWholesaleItem(wholesaleItem, category, brand, item, index, coating)) {
      return wholesaleItem;
    }
  }

  return null;
}

function legacyVioletWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    AND: [
      { item: { equals: "SPECIAL COLORS", mode: "insensitive" } },
      { coating: { equals: "VIOLET", mode: "insensitive" } },
    ],
  };
}

function dbVioletWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    AND: [
      { coating: { equals: "VIOLET", mode: "insensitive" } },
      {
        OR: [
          { item: { equals: "SPECIAL COLORS", mode: "insensitive" } },
          categoryFilter(DB_CATEGORY.whiteSvBlueCut),
          { category: { contains: "BLUE CUT", mode: "insensitive" } },
        ],
      },
    ],
  };
}

function legacyEyeconicDualWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    AND: [
      { item: { equals: "SPECIAL COLORS", mode: "insensitive" } },
      { brand: { contains: "EYECONIC", mode: "insensitive" } },
      { coating: { equals: "DUAL", mode: "insensitive" } },
    ],
  };
}

function dbEyeconicDualWhere(): Prisma.SingleVisionLensWhereInput {
  return categoryFilter(DB_CATEGORY.dualCoating);
}

function legacyPgPolyBrcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    AND: [
      {
        OR: [
          { category: { equals: "SUPER PG POLY BLUE CUT", mode: "insensitive" } },
          { category: { contains: "PHOTOGREY", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { category: { contains: "POLY", mode: "insensitive" } },
          { item: { contains: "POLY", mode: "insensitive" } },
          { brand: { contains: "POLY", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { category: { contains: "BLUE CUT", mode: "insensitive" } },
          { item: { contains: "BLUE CUT", mode: "insensitive" } },
        ],
      },
    ],
  };
}

function dbPgPolyBrcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    OR: [
      {
        AND: [
          categoryFilter(DB_CATEGORY.blueCutSv),
          {
            OR: [
              { item: { contains: "POLY PG", mode: "insensitive" } },
              { brand: { contains: "POLY PG", mode: "insensitive" } },
            ],
          },
        ],
      },
      { category: { equals: "SUPER PG POLY BLUE CUT", mode: "insensitive" } },
    ],
  };
}

function legacyPgBrcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    AND: [
      {
        OR: [
          { category: { equals: "PHOTOGREY BLUE CUT SV", mode: "insensitive" } },
          { category: { contains: "PHOTOGREY", mode: "insensitive" } },
          { brand: { contains: "SOLAR-X", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { category: { contains: "BLUE CUT", mode: "insensitive" } },
          { item: { contains: "BLUE CUT", mode: "insensitive" } },
        ],
      },
      { NOT: { category: { contains: "POLY", mode: "insensitive" } } },
      { NOT: { item: { contains: "POLY", mode: "insensitive" } } },
    ],
  };
}

function dbPgBrcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    OR: [
      categoryFilter(DB_CATEGORY.optimaxPgBlueCut),
      categoryFilter(DB_CATEGORY.pgBlueCut),
    ],
  };
}

function legacyPgHcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    OR: [
      { category: { equals: "PHOTOGREY WITHOUT BLUE", mode: "insensitive" } },
      { category: { contains: "PHOTOGREY WITHOUT", mode: "insensitive" } },
      { brand: { contains: "PG HC", mode: "insensitive" } },
      {
        AND: [
          { category: { contains: "PHOTOGREY", mode: "insensitive" } },
          { coating: { equals: "HC", mode: "insensitive" } },
          { NOT: { category: { contains: "BLUE CUT", mode: "insensitive" } } },
          { NOT: { item: { contains: "BLUE CUT", mode: "insensitive" } } },
        ],
      },
    ],
  };
}

function dbPgHcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    OR: [
      categoryFilter(DB_CATEGORY.pgBrGreen),
      { item: { equals: DB_ITEM.pgSvHiIndex, mode: "insensitive" } },
    ],
  };
}

function legacyHcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    OR: [
      { category: { equals: "HC SV", mode: "insensitive" } },
      {
        AND: [
          { coating: { equals: "HC", mode: "insensitive" } },
          { NOT: { category: { contains: "PHOTOGREY", mode: "insensitive" } } },
          { NOT: { brand: { contains: "PG HC", mode: "insensitive" } } },
          { NOT: { item: { equals: "SPECIAL COLORS", mode: "insensitive" } } },
        ],
      },
    ],
  };
}

function dbHcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    OR: [
      categoryFilter(DB_CATEGORY.hardcoat),
      { item: { equals: DB_ITEM.hardcoat, mode: "insensitive" } },
    ],
  };
}

function legacyBrcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    AND: [
      {
        OR: [
          { category: { equals: "WHITE", mode: "insensitive" } },
          { category: { contains: "BLUE CUT SV", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { item: { contains: "BLUE CUT", mode: "insensitive" } },
          { category: { contains: "BLUE CUT", mode: "insensitive" } },
        ],
      },
      { NOT: { category: { contains: "PHOTOGREY", mode: "insensitive" } } },
      { NOT: { category: { contains: "POLY", mode: "insensitive" } } },
      { NOT: { item: { contains: "POLY", mode: "insensitive" } } },
      { NOT: { item: { equals: "SPECIAL COLORS", mode: "insensitive" } } },
      { NOT: { index: INDEX_167 } },
      { NOT: { brand: { contains: "MARI", mode: "insensitive" } } },
    ],
  };
}

function dbBrcWhere(): Prisma.SingleVisionLensWhereInput {
  return {
    AND: [
      {
        OR: [
          categoryFilter(DB_CATEGORY.blueCut),
          categoryFilter(DB_CATEGORY.blueCutSv156Premium),
          categoryFilter(DB_CATEGORY.brc),
        ],
      },
      { NOT: { category: { contains: "PG", mode: "insensitive" } } },
      { NOT: { item: { contains: "POLY", mode: "insensitive" } } },
      { NOT: { index: INDEX_167 } },
      { NOT: { brand: { contains: "MARI", mode: "insensitive" } } },
    ],
  };
}

function dbBrc167Where(): Prisma.SingleVisionLensWhereInput {
  return {
    AND: [{ index: INDEX_167 }, categoryFilter(DB_CATEGORY.brc)],
  };
}

/** Prisma filter for products under a wholesale Single Vision item. */
export function buildSingleVisionWholesaleItemWhere(
  displayItem: string
): Prisma.SingleVisionLensWhereInput {
  const trimmed = displayItem.trim();

  if (!isSingleVisionWholesaleItem(trimmed)) {
    return {
      OR: [
        { category: { equals: trimmed, mode: "insensitive" } },
        { item: { equals: trimmed, mode: "insensitive" } },
      ],
    };
  }

  switch (trimmed) {
    case "VIOLET":
      return mergeOr([legacyVioletWhere(), dbVioletWhere()]);
    case "Eyeconic-DUAL":
      return mergeOr([legacyEyeconicDualWhere(), dbEyeconicDualWhere()]);
    case "PG Poly BRC":
      return mergeOr([legacyPgPolyBrcWhere(), dbPgPolyBrcWhere()]);
    case "PG BRC":
      return mergeOr([legacyPgBrcWhere(), dbPgBrcWhere()]);
    case "Poly BRC":
      return {
        AND: [
          {
            OR: [
              { category: { equals: "SUPER POLY BLUE CUT", mode: "insensitive" } },
              { category: { contains: "POLY", mode: "insensitive" } },
              { item: { contains: "POLY", mode: "insensitive" } },
            ],
          },
          {
            OR: [
              { category: { contains: "BLUE CUT", mode: "insensitive" } },
              { item: { contains: "BLUE CUT", mode: "insensitive" } },
            ],
          },
          { NOT: { category: { contains: "PHOTOGREY", mode: "insensitive" } } },
          { NOT: { brand: { contains: "SOLAR-X", mode: "insensitive" } } },
        ],
      };
    case "BRC 1.67":
      return mergeOr([
        {
          AND: [
            { index: INDEX_167 },
            {
              OR: [
                { category: { contains: "BLUE CUT", mode: "insensitive" } },
                { item: { contains: "BLUE CUT", mode: "insensitive" } },
              ],
            },
            { NOT: { category: { contains: "PHOTOGREY", mode: "insensitive" } } },
            { NOT: { category: { contains: "POLY", mode: "insensitive" } } },
            { NOT: { item: { contains: "POLY", mode: "insensitive" } } },
            { NOT: { brand: { contains: "MARI", mode: "insensitive" } } },
          ],
        },
        dbBrc167Where(),
      ]);
    case "MARI-BLUE":
      return {
        OR: [
          { brand: { equals: "MARI BLU", mode: "insensitive" } },
          { brand: { equals: "MARI-BLU", mode: "insensitive" } },
          { brand: { equals: "MARI-BLUE", mode: "insensitive" } },
        ],
      };
    case "PG H/C":
      return mergeOr([legacyPgHcWhere(), dbPgHcWhere()]);
    case "H/C":
      return mergeOr([legacyHcWhere(), dbHcWhere()]);
    case "BRC":
      return mergeOr([legacyBrcWhere(), dbBrcWhere()]);
    default:
      return { item: { equals: trimmed, mode: "insensitive" } };
  }
}
