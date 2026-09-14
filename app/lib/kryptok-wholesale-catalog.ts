import type { Prisma } from "@prisma/client";

/** Wholesale Kryptok item cards — fixed order from product catalog. */
export const KRYPTOK_WHOLESALE_ITEMS = [
  "HC KT",
  "PG HC KT",
  "BRC KT",
  "PG BRC KT",
  "POLY BRC KT",
  "CROSS",
] as const;

export type KryptokWholesaleItem = (typeof KRYPTOK_WHOLESALE_ITEMS)[number];

type WholesaleItemRule = {
  categories?: string[];
  categoryContains?: string[];
  categoryCoating?: Array<{ category: string; coatings: string[] }>;
  /** PG KT + coating contains BLUE / BLU (blue cut line). */
  categoryBlueCut?: string[];
  /** Match stored wholesale item label (e.g. CROSS). */
  items?: string[];
};

const KRYPTOK_WHOLESALE_RULES: Record<KryptokWholesaleItem, WholesaleItemRule> = {
  "HC KT": {
    categoryCoating: [{ category: "WHITE KT", coatings: ["HC"] }],
    categories: ["HC KT"],
  },
  "PG HC KT": {
    categoryCoating: [{ category: "PG KT", coatings: ["HC"] }],
    categories: ["PG HC KT"],
  },
  "BRC KT": {
    categories: [
      "BLUE CUT KT",
      "BLUE CUT KT HMC",
      "BR HMC KT",
      "BRC KT",
      "BRC KT Blue",
      "BRC KT Invisio",
    ],
  },
  "PG BRC KT": {
    categories: ["PG BLUE CUT KT", "PG BRC KT", "PG BR HMC KT"],
    categoryContains: ["PG BLUE CUT", "PG BRC"],
    categoryBlueCut: ["PG KT"],
    categoryCoating: [
      { category: "PG KT", coatings: ["HMC", "HMC GREEN", "GREEN", "BLUE", "LIGHT BLU", "LIGHT BLUE"] },
    ],
  },
  "POLY BRC KT": {
    categories: ["POLY KT", "POLY BRC KT", "Poly BR KT BLUE"],
    categoryContains: ["POLY"],
  },
  CROSS: {
    items: ["CROSS"],
  },
};

/** More specific PG lines first when resolving a single lens row. */
const RESOLVE_PRIORITY: KryptokWholesaleItem[] = [
  "CROSS",
  "PG BRC KT",
  "PG HC KT",
  "BRC KT",
  "POLY BRC KT",
  "HC KT",
];

const WHOLESALE_ITEM_SET = new Set<string>(KRYPTOK_WHOLESALE_ITEMS);

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function coatingMatches(stored: string | null | undefined, expected: string): boolean {
  if (!stored?.trim()) {
    return false;
  }
  return normalizeKey(stored) === normalizeKey(expected);
}

function categoryMatches(stored: string | null | undefined, expected: string): boolean {
  if (!stored?.trim()) {
    return false;
  }
  return normalizeKey(stored) === normalizeKey(expected);
}

function categoryContainsText(stored: string | null | undefined, fragment: string): boolean {
  if (!stored?.trim()) {
    return false;
  }
  return normalizeKey(stored).includes(normalizeKey(fragment));
}

function isBlueCutCoating(coating: string | null | undefined): boolean {
  if (!coating?.trim()) {
    return false;
  }
  const norm = normalizeKey(coating);
  return (
    norm.includes("BLUE") ||
    norm.includes("BLU") ||
    norm.includes("VIOLET") ||
    norm === "HMC" ||
    norm === "HMC GREEN" ||
    norm === "GREEN"
  );
}

function isHcOnlyCoating(coating: string | null | undefined): boolean {
  if (!coating?.trim()) {
    return false;
  }
  const norm = normalizeKey(coating);
  return norm === "HC" || norm === "H.C." || norm === "HARD COAT";
}

export function isKryptokWholesaleItem(value: string): value is KryptokWholesaleItem {
  return WHOLESALE_ITEM_SET.has(value.trim());
}

function lensMatchesWholesaleItem(
  itemName: KryptokWholesaleItem,
  category: string,
  coating?: string | null,
  storedItem?: string | null
): boolean {
  const rule = KRYPTOK_WHOLESALE_RULES[itemName];

  if (rule.items?.some((expected) => normalizeKey(storedItem ?? "") === normalizeKey(expected))) {
    return true;
  }

  if (rule.categories?.some((cat) => categoryMatches(category, cat))) {
    if (itemName === "BRC KT" && categoryContainsText(category, "PG")) {
      return false;
    }
    return true;
  }

  if (rule.categoryContains?.some((fragment) => categoryContainsText(category, fragment))) {
    return true;
  }

  if (rule.categoryBlueCut?.some((cat) => categoryMatches(category, cat))) {
    return isBlueCutCoating(coating);
  }

  if (rule.categoryCoating) {
    for (const group of rule.categoryCoating) {
      if (!categoryMatches(category, group.category)) {
        continue;
      }
      if (group.coatings.some((expectedCoating) => coatingMatches(coating, expectedCoating))) {
        return true;
      }
    }
  }

  if (itemName === "PG HC KT" && categoryMatches(category, "PG KT") && isHcOnlyCoating(coating)) {
    return true;
  }

  return false;
}

/** Resolve a lens row to its wholesale catalog item name. */
export function resolveKryptokWholesaleItem(
  category: string | null | undefined,
  coating?: string | null | undefined,
  item?: string | null | undefined
): KryptokWholesaleItem | null {
  const storedItem = item?.trim();
  if (storedItem && isKryptokWholesaleItem(storedItem)) {
    return storedItem;
  }

  const categoryName = category?.trim();
  if (!categoryName) {
    return null;
  }

  if (isKryptokWholesaleItem(categoryName)) {
    return categoryName;
  }

  for (const itemName of RESOLVE_PRIORITY) {
    if (lensMatchesWholesaleItem(itemName, categoryName, coating, storedItem)) {
      return itemName;
    }
  }

  return null;
}

/** OR clauses for free-text shop search on Kryptok string fields (brand, category, item, coating). */
export function buildKryptokLensFreeTextOr(text: string): Prisma.KryptokLensWhereInput[] {
  const filter: Prisma.StringNullableFilter = { contains: text, mode: "insensitive" };
  return [
    { brand: filter },
    { category: filter },
    { item: filter },
    { coating: filter },
  ];
}

function buildWhereFromRule(rule: WholesaleItemRule): Prisma.KryptokLensWhereInput[] {
  const conditions: Prisma.KryptokLensWhereInput[] = [];

  for (const category of rule.categories ?? []) {
    conditions.push({ category: { equals: category, mode: "insensitive" } });
  }

  for (const fragment of rule.categoryContains ?? []) {
    conditions.push({ category: { contains: fragment, mode: "insensitive" } });
  }

  for (const group of rule.categoryCoating ?? []) {
    for (const coating of group.coatings) {
      conditions.push({
        AND: [
          { category: { equals: group.category, mode: "insensitive" } },
          { coating: { equals: coating, mode: "insensitive" } },
        ],
      });
    }
  }

  for (const category of rule.categoryBlueCut ?? []) {
    conditions.push({
      AND: [
        { category: { equals: category, mode: "insensitive" } },
        {
          OR: [
            { coating: { contains: "BLUE", mode: "insensitive" } },
            { coating: { contains: "BLU", mode: "insensitive" } },
            { coating: { contains: "VIOLET", mode: "insensitive" } },
            { coating: { equals: "HMC", mode: "insensitive" } },
            { coating: { equals: "HMC GREEN", mode: "insensitive" } },
            { coating: { equals: "GREEN", mode: "insensitive" } },
          ],
        },
      ],
    });
  }

  for (const item of rule.items ?? []) {
    conditions.push({ item: { equals: item, mode: "insensitive" } });
  }

  return conditions;
}

/** Prisma filter for products under a wholesale Kryptok item. */
export function buildKryptokWholesaleItemWhere(displayItem: string): Prisma.KryptokLensWhereInput {
  const trimmed = displayItem.trim();

  if (isKryptokWholesaleItem(trimmed)) {
    const rule = KRYPTOK_WHOLESALE_RULES[trimmed];

    if (trimmed === "PG HC KT") {
      return {
        OR: [
          ...buildWhereFromRule(rule),
          {
            AND: [
              { category: { equals: "PG KT", mode: "insensitive" } },
              {
                OR: [
                  { coating: { equals: "HC", mode: "insensitive" } },
                  { coating: { equals: "H.C.", mode: "insensitive" } },
                ],
              },
            ],
          },
        ],
      };
    }

    if (trimmed === "HC KT") {
      return {
        OR: [
          { category: { equals: "HC KT", mode: "insensitive" } },
          {
            AND: [
              { category: { equals: "WHITE KT", mode: "insensitive" } },
              { coating: { equals: "HC", mode: "insensitive" } },
            ],
          },
        ],
      };
    }

    if (trimmed === "CROSS") {
      return { item: { equals: "CROSS", mode: "insensitive" } };
    }

    const conditions = buildWhereFromRule(rule);
    if (conditions.length > 0) {
      return { OR: conditions };
    }
  }

  return {
    OR: [
      { category: { equals: trimmed, mode: "insensitive" } },
      { item: { equals: trimmed, mode: "insensitive" } },
    ],
  };
}
