import { buildKryptokWholesaleItemWhere } from "./kryptok-wholesale-catalog";
import { buildProgressiveWholesaleItemWhere } from "./progressive-wholesale-catalog";
import { buildSingleVisionWholesaleItemWhere } from "./single-vision-wholesale-catalog";
import { parseLensSearchTerm } from "./lens-search";

export type ShopLensType = "KRYPTOK" | "PROGRESSIVE" | "SINGLE_VISION";

export type WholesaleShopSearch = {
  lensTypes: ShopLensType[] | null;
  itemFilters: Partial<Record<ShopLensType, string>>;
  remainingText: string;
};

type CatalogEntry = {
  lensType: ShopLensType;
  itemName: string;
  aliases: string[];
};

const CATEGORY_SHORTCUTS: Record<string, ShopLensType> = {
  sv: "SINGLE_VISION",
  kt: "KRYPTOK",
  v2: "PROGRESSIVE",
  kryptok: "KRYPTOK",
  progressive: "PROGRESSIVE",
  prog: "PROGRESSIVE",
  singlevision: "SINGLE_VISION",
  "single-vision": "SINGLE_VISION",
  singlevisionlens: "SINGLE_VISION",
};

const CATALOG: CatalogEntry[] = [
  { lensType: "KRYPTOK", itemName: "PG BRC KT", aliases: ["pg brc kt", "pg brc"] },
  { lensType: "KRYPTOK", itemName: "POLY BRC KT", aliases: ["poly brc kt", "poly brc"] },
  { lensType: "KRYPTOK", itemName: "PG HC KT", aliases: ["pg hc kt", "pg hc"] },
  { lensType: "KRYPTOK", itemName: "BRC KT", aliases: ["brc kt", "brc"] },
  { lensType: "KRYPTOK", itemName: "HC KT", aliases: ["hc kt", "hc"] },

  { lensType: "PROGRESSIVE", itemName: "PG Poly BRC V2", aliases: ["pg poly brc v2", "pg poly brc", "poly pg br"] },
  { lensType: "PROGRESSIVE", itemName: "PG BRC V2", aliases: ["pg brc v2", "pg brc", "pg br hmc"] },
  { lensType: "PROGRESSIVE", itemName: "Poly BRC V2", aliases: ["poly brc v2", "poly brc", "poly progressive", "poly progressive blue cut"] },
  { lensType: "PROGRESSIVE", itemName: "BRC V2", aliases: ["brc v2", "brc", "pro-tron 9+4 design", "blue cut progressive"] },
  { lensType: "PROGRESSIVE", itemName: "PG HC V2", aliases: ["pg hc v2", "pg hc", "pg progressive", "photo brown br prog"] },
  { lensType: "PROGRESSIVE", itemName: "HC V2", aliases: ["hc v2", "hc", "white progressive"] },

  { lensType: "SINGLE_VISION", itemName: "Eyeconic-DUAL", aliases: ["eyeconic-dual", "eyeconic dual", "eyeconic", "dual", "dual coating", "zion"] },
  { lensType: "SINGLE_VISION", itemName: "BRC 1.67", aliases: ["brc 1.67", "1.67 brc", "1.67"] },
  { lensType: "SINGLE_VISION", itemName: "MARI-BLUE", aliases: ["mari-blue", "mari blue", "mari blu", "mari"] },
  { lensType: "SINGLE_VISION", itemName: "PG Poly BRC", aliases: ["pg poly brc", "poly pg blue cut", "wizard poly pg"] },
  { lensType: "SINGLE_VISION", itemName: "PG BRC", aliases: ["pg brc", "pg blue cut", "optimax pg blue cut"] },
  { lensType: "SINGLE_VISION", itemName: "Poly BRC", aliases: ["poly brc", "blue cut sv"] },
  { lensType: "SINGLE_VISION", itemName: "PG H/C", aliases: ["pg h/c", "pg hc", "pghc", "pg br green", "pg sv hi-index"] },
  { lensType: "SINGLE_VISION", itemName: "H/C", aliases: ["h/c", "hc", "hardcoat", "hard coat"] },
  { lensType: "SINGLE_VISION", itemName: "VIOLET", aliases: ["violet", "vioalate"] },
  { lensType: "SINGLE_VISION", itemName: "BRC", aliases: ["brc"] },
];

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function stripMatchedPrefix(input: string, matched: string): string {
  const normalizedInput = normalizeSearch(input);
  const normalizedMatch = normalizeSearch(matched);
  if (normalizedInput === normalizedMatch) {
    return "";
  }
  if (normalizedInput.startsWith(`${normalizedMatch} `)) {
    return input.slice(matched.length).trim();
  }
  if (normalizedInput.endsWith(` ${normalizedMatch}`)) {
    return input.slice(0, input.length - matched.length).trim();
  }
  return input;
}

function findAllCatalogMatches(
  query: string,
  lensTypes: ShopLensType[] | null
): CatalogEntry[] {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return [];
  }

  return CATALOG.filter((entry) => {
    if (lensTypes?.length && !lensTypes.includes(entry.lensType)) {
      return false;
    }
    return [entry.itemName, ...entry.aliases].some((alias) => normalizeSearch(alias) === normalized);
  });
}

function findCatalogMatch(
  query: string,
  lensTypes: ShopLensType[] | null
): { entries: CatalogEntry[]; matchedText: string } | null {
  const normalized = normalizeSearch(query);
  const exactMatches = findAllCatalogMatches(normalized, lensTypes);
  if (exactMatches.length > 0) {
    return { entries: exactMatches, matchedText: normalized };
  }

  const candidates = CATALOG.filter(
    (entry) => !lensTypes?.length || lensTypes.includes(entry.lensType)
  );

  const patterns = candidates.flatMap((entry) =>
    [entry.itemName, ...entry.aliases].map((alias) => ({
      entry,
      alias: normalizeSearch(alias),
    }))
  );

  patterns.sort((a, b) => b.alias.length - a.alias.length);

  for (const pattern of patterns) {
    if (normalized.startsWith(`${pattern.alias} `) || normalized.endsWith(` ${pattern.alias}`)) {
      return { entries: [pattern.entry], matchedText: pattern.alias };
    }
  }

  return null;
}

function findCategoryShortcut(query: string): ShopLensType | null {
  const normalized = normalizeSearch(query).replace(/\s+/g, "");
  return CATEGORY_SHORTCUTS[normalized] ?? null;
}

/** Resolve wholesale shortcut search for the shop tab. */
export function resolveWholesaleShopSearch(
  raw: string,
  requestedType: ShopLensType | "ALL"
): WholesaleShopSearch {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { lensTypes: null, itemFilters: {}, remainingText: "" };
  }

  const parsed = parseLensSearchTerm(trimmed);
  if (parsed.sphCylPair || parsed.singleNumber !== null) {
    return { lensTypes: null, itemFilters: {}, remainingText: trimmed };
  }

  let working = trimmed;
  let lensTypes: ShopLensType[] | null = null;
  const itemFilters: Partial<Record<ShopLensType, string>> = {};

  const categoryShortcut = findCategoryShortcut(working);
  if (categoryShortcut) {
    lensTypes = [categoryShortcut];
    working = "";
  } else {
    const categoryInQuery = CATEGORY_SHORTCUTS[normalizeSearch(working).replace(/\s+/g, "")];
    if (!categoryInQuery) {
      for (const [shortcut, lensType] of Object.entries(CATEGORY_SHORTCUTS)) {
        const normalized = normalizeSearch(working);
        if (normalized.startsWith(`${shortcut} `)) {
          lensTypes = [lensType];
          working = working.slice(shortcut.length).trim();
          break;
        }
        if (normalized.endsWith(` ${shortcut}`)) {
          lensTypes = [lensType];
          working = working.slice(0, working.length - shortcut.length).trim();
          break;
        }
      }
    }
  }

  const catalogMatch = working ? findCatalogMatch(working, lensTypes) : null;
  if (catalogMatch) {
    for (const entry of catalogMatch.entries) {
      itemFilters[entry.lensType] = entry.itemName;
    }
    if (!lensTypes?.length) {
      lensTypes = [...new Set(catalogMatch.entries.map((entry) => entry.lensType))];
    }
    working = stripMatchedPrefix(working, catalogMatch.matchedText);
  } else if (!lensTypes?.length) {
    const broadMatch = findCatalogMatch(trimmed, null);
    if (broadMatch) {
      for (const entry of broadMatch.entries) {
        itemFilters[entry.lensType] = entry.itemName;
      }
      lensTypes = [...new Set(broadMatch.entries.map((entry) => entry.lensType))];
      working = stripMatchedPrefix(trimmed, broadMatch.matchedText);
    }
  }

  if (requestedType !== "ALL") {
    if (lensTypes?.length && !lensTypes.includes(requestedType)) {
      return { lensTypes: [], itemFilters: {}, remainingText: "" };
    }
    lensTypes = [requestedType];
  }

  return {
    lensTypes,
    itemFilters,
    remainingText: working.trim(),
  };
}

export function getShopTypesToFetch(
  requestedType: ShopLensType | "ALL",
  wholesale: WholesaleShopSearch
): ShopLensType[] {
  const all: ShopLensType[] = ["KRYPTOK", "PROGRESSIVE", "SINGLE_VISION"];

  if (wholesale.lensTypes?.length === 0) {
    return [];
  }

  if (requestedType !== "ALL") {
    return [requestedType];
  }

  if (wholesale.lensTypes?.length) {
    return wholesale.lensTypes;
  }

  return all;
}

export function buildWholesaleItemWhere(
  lensType: ShopLensType,
  itemName: string
): Record<string, unknown> {
  switch (lensType) {
    case "KRYPTOK":
      return buildKryptokWholesaleItemWhere(itemName);
    case "PROGRESSIVE":
      return buildProgressiveWholesaleItemWhere(itemName);
    case "SINGLE_VISION":
      return buildSingleVisionWholesaleItemWhere(itemName);
  }
}
