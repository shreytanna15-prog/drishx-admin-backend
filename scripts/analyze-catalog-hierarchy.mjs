/**
 * Read-only hierarchy analysis of legacy lens catalog.
 * Infers family → base → material → index → color from live rows + wholesale cards.
 *
 * Usage: node scripts/analyze-catalog-hierarchy.mjs
 * Requires: DATABASE_URL in .env.local
 *
 * Output: scripts/catalog-audit-output/hierarchy-*.json
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(__dirname, "catalog-audit-output");

function loadEnvLocal() {
  const path = resolve(ROOT, ".env.local");
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function toNum(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function norm(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function textHas(value, fragment) {
  return norm(value).includes(norm(fragment));
}

function bump(map, key, n = 1) {
  map[key] = (map[key] ?? 0) + n;
}

function writeJson(name, data) {
  writeFileSync(resolve(OUT_DIR, name), JSON.stringify(data, null, 2), "utf8");
}

/**
 * Infer base + material modifiers from wholesale-style / category / coating text.
 * Bases: HC | BRC | SPECIAL
 * Materials: PLAIN | UC | TINTABLE | POLY | PG | PG_POLY
 */
function inferAttributes(family, row) {
  const category = row.category ?? "";
  const brand = row.brand ?? "";
  const item = row.item ?? "";
  const coating = row.coating ?? "";
  const type = row.type ?? "";
  const blob = [category, brand, item, coating, type].join(" ");
  const N = norm(blob);
  const coatN = norm(coating);

  let base = "UNKNOWN";
  let material = "PLAIN";
  let special = null;

  // Special SV lines first
  if (family === "SINGLE_VISION") {
    if (textHas(brand, "MARI") || textHas(category, "MARI")) {
      special = "MARI-BLUE";
      base = "BRC";
    } else if (textHas(coating, "VIOLET") || textHas(item, "SPECIAL COLORS")) {
      special = "VIOLET";
      base = "BRC";
    } else if (textHas(category, "DUAL")) {
      special = "Eyeconic-DUAL";
      base = "BRC";
    }
  }

  if (family === "KRYPTOK" && textHas(item, "CROSS")) {
    special = "CROSS";
  }

  const isPoly = textHas(blob, "POLY");
  const isPg =
    textHas(blob, "PG ") ||
    textHas(blob, " PG") ||
    N.startsWith("PG") ||
    textHas(blob, "PHOTOGREY") ||
    textHas(blob, "PHOTOCHROM") ||
    textHas(blob, "SOLAR-X") ||
    textHas(item, "PG SV") ||
    textHas(item, "POLY PG");
  const isUc = coatN === "UC" || textHas(blob, " UNCOATED") || N.includes("|UC|");
  const isTintable = textHas(blob, "TINTABLE") || textHas(blob, "TINT");

  const isHc =
    coatN === "HC" ||
    coatN === "H.C." ||
    coatN === "HARD COAT" ||
    textHas(category, "HARDCOAT") ||
    textHas(category, "H/C") ||
    textHas(category, "HC KT") ||
    textHas(category, "HC V2") ||
    textHas(category, "WHITE KT") ||
    textHas(category, "WHITE PROGRESSIVE") ||
    textHas(category, "WHITE SV") ||
    (family === "PROGRESSIVE" && (norm(type) === "HC" || norm(type) === "H.C."));

  const isBrc =
    textHas(blob, "BRC") ||
    textHas(blob, "BLUE CUT") ||
    textHas(blob, "BLUE-CUT") ||
    textHas(coating, "BLUE") ||
    textHas(coating, "GREEN") ||
    textHas(coating, "HMC") ||
    textHas(coating, "SHMC") ||
    textHas(coating, "VIOLET") ||
    textHas(coating, "BLU");

  if (!special) {
    if (isHc && !isBrc) base = "HC";
    else if (isBrc && !isHc) base = "BRC";
    else if (isHc && isBrc) {
      // PG HC KT: category has PG + HC coating → HC base
      if (textHas(category, "HC") && !textHas(category, "BRC") && !textHas(category, "BLUE CUT")) {
        base = "HC";
      } else if (textHas(category, "HARDCOAT") || textHas(category, "H/C")) {
        base = "HC";
      } else {
        base = "BRC";
      }
    } else if (isHc) base = "HC";
    else if (isBrc) base = "BRC";
  }

  if (isPoly && isPg) material = "PG_POLY";
  else if (isPg) material = "PG";
  else if (isPoly) material = "POLY";
  else if (isUc) material = "UC";
  else if (isTintable) material = "TINTABLE";
  else material = "PLAIN";

  // UC only meaningful under HC in client rules; keep inference but flag
  const index = toNum(row.index);
  const color = coating?.trim() || (type?.trim() ? `type:${type.trim()}` : "(none)");

  return {
    family,
    base,
    material,
    special,
    index,
    color,
    category: category || null,
    brand: brand || null,
    item: item || null,
    coating: coating || null,
    type: type || null,
  };
}

function wholesaleCardHint(family, attrs, row) {
  const { base, material, special, index } = attrs;
  if (family === "SINGLE_VISION") {
    if (special) return special;
    if (base === "HC" && material === "PG") return "PG H/C";
    if (base === "HC") return "H/C";
    if (base === "BRC" && material === "PG_POLY") return "PG Poly BRC";
    if (base === "BRC" && material === "PG") return "PG BRC";
    if (base === "BRC" && material === "POLY") return "Poly BRC";
    if (base === "BRC" && index != null && Math.abs(index - 1.67) < 0.001) return "BRC 1.67";
    if (base === "BRC") return "BRC";
  }
  if (family === "KRYPTOK") {
    if (special === "CROSS") return "CROSS";
    if (base === "HC" && material === "PG") return "PG HC KT";
    if (base === "HC") return "HC KT";
    if (base === "BRC" && material === "PG") return "PG BRC KT";
    if (base === "BRC" && material === "POLY") return "POLY BRC KT";
    if (base === "BRC") return "BRC KT";
  }
  if (family === "PROGRESSIVE") {
    if (base === "HC" && material === "PG") return "PG HC V2";
    if (base === "HC") return "HC V2";
    if (base === "BRC" && material === "PG_POLY") return "PG Poly BRC V2";
    if (base === "BRC" && material === "PG") return "PG BRC V2";
    if (base === "BRC" && material === "POLY") return "Poly BRC V2";
    if (base === "BRC") return "BRC V2";
  }
  return null;
}

async function query(pool, sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

function analyzeFamily(family, rows) {
  const distinct = {
    categories: {},
    brands: {},
    items: {},
    coatings: {},
    types: {},
    indexes: {},
  };
  const productKeys = new Map();
  const tree = {}; // base -> material -> index -> color -> count
  const pathCounts = {};
  const unknownRows = [];

  for (const row of rows) {
    bump(distinct.categories, row.category || "(empty)");
    bump(distinct.brands, row.brand || "(empty)");
    bump(distinct.items, row.item || "(empty)");
    bump(distinct.coatings, row.coating || "(empty)");
    if (row.type != null) bump(distinct.types, row.type || "(empty)");
    const idx = toNum(row.index);
    bump(distinct.indexes, idx == null ? "(null)" : String(idx));

    const attrs = inferAttributes(family, row);
    const card = wholesaleCardHint(family, attrs, row);
    const path = `${attrs.base} / ${attrs.material}${attrs.special ? ` / ${attrs.special}` : ""}`;
    bump(pathCounts, path);

    if (attrs.base === "UNKNOWN") {
      unknownRows.push({
        id: row.id,
        category: row.category,
        brand: row.brand,
        item: row.item,
        coating: row.coating,
        type: row.type,
        index: idx,
      });
    }

    const indexKey = attrs.index == null ? "(null)" : String(attrs.index);
    tree[attrs.base] ??= {};
    tree[attrs.base][attrs.material] ??= {};
    tree[attrs.base][attrs.material][indexKey] ??= {};
    bump(tree[attrs.base][attrs.material][indexKey], attrs.color);

    const keyParts =
      family === "KRYPTOK"
        ? [row.category, row.brand, row.coating]
        : family === "PROGRESSIVE"
          ? [row.category, row.brand, row.item, idx, row.type, row.coating]
          : [row.category, row.brand, row.item, idx, row.coating];
    const pkey = keyParts.map((x) => x ?? "").join("|");
    if (!productKeys.has(pkey)) {
      productKeys.set(pkey, {
        ...attrs,
        wholesaleCardHint: card,
        rowCount: 0,
      });
    }
    productKeys.get(pkey).rowCount += 1;
  }

  return {
    family,
    rowCount: rows.length,
    productGroupCount: productKeys.size,
    distinct,
    inferredPathCounts: pathCounts,
    hierarchyTree: tree,
    productGroups: [...productKeys.values()].sort((a, b) => b.rowCount - a.rowCount),
    unknownSample: unknownRows.slice(0, 40),
    unknownCount: unknownRows.length,
  };
}

function buildCompatibilityMatrix(analyses) {
  /** @type {Record<string, Record<string, Set<string>>>} */
  const matrix = {};
  for (const analysis of analyses) {
    matrix[analysis.family] ??= {};
    for (const g of analysis.productGroups) {
      matrix[analysis.family][g.base] ??= new Set();
      matrix[analysis.family][g.base].add(g.material);
    }
  }
  const out = {};
  for (const [family, bases] of Object.entries(matrix)) {
    out[family] = {};
    for (const [base, materials] of Object.entries(bases)) {
      out[family][base] = [...materials].sort();
    }
  }
  return out;
}

async function main() {
  loadEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not found in .env.local");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    ssl: connectionString.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  console.log("Fetching legacy lens catalog (read-only)...");

  const [svRows, ktRows, pgRows, catalogLines, coatingFilters] = await Promise.all([
    query(pool, `SELECT * FROM "SingleVisionLens"`),
    query(pool, `SELECT * FROM "KryptokLens"`),
    query(pool, `SELECT * FROM "ProgressiveLens"`),
    query(pool, `SELECT * FROM "CatalogProductLine" ORDER BY "lensType", "sortOrder", name`),
    query(pool, `SELECT * FROM "CoatingFilterLabel" ORDER BY "lensType", "sortOrder", name`),
  ]);

  const sv = analyzeFamily("SINGLE_VISION", svRows);
  const kt = analyzeFamily("KRYPTOK", ktRows);
  const prog = analyzeFamily("PROGRESSIVE", pgRows);

  const compatibility = buildCompatibilityMatrix([sv, kt, prog]);

  const summary = {
    generatedAt: new Date().toISOString(),
    counts: {
      SingleVisionLens: svRows.length,
      KryptokLens: ktRows.length,
      ProgressiveLens: pgRows.length,
      CatalogProductLine: catalogLines.length,
      CoatingFilterLabel: coatingFilters.length,
    },
    catalogProductLines: catalogLines.map((r) => ({
      lensType: r.lensType,
      name: r.name,
      isActive: r.isActive,
      isSystem: r.isSystem,
    })),
    coatingFilterLabels: coatingFilters.map((r) => ({
      lensType: r.lensType,
      name: r.name,
      isActive: r.isActive,
    })),
    compatibilityFromData: compatibility,
    families: {
      SINGLE_VISION: {
        rowCount: sv.rowCount,
        productGroupCount: sv.productGroupCount,
        inferredPathCounts: sv.inferredPathCounts,
        unknownCount: sv.unknownCount,
        topCoatings: Object.entries(sv.distinct.coatings)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25),
        topCategories: Object.entries(sv.distinct.categories)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25),
        indexes: sv.distinct.indexes,
      },
      KRYPTOK: {
        rowCount: kt.rowCount,
        productGroupCount: kt.productGroupCount,
        inferredPathCounts: kt.inferredPathCounts,
        unknownCount: kt.unknownCount,
        topCoatings: Object.entries(kt.distinct.coatings)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25),
        topCategories: Object.entries(kt.distinct.categories)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25),
      },
      PROGRESSIVE: {
        rowCount: prog.rowCount,
        productGroupCount: prog.productGroupCount,
        inferredPathCounts: prog.inferredPathCounts,
        unknownCount: prog.unknownCount,
        topCoatings: Object.entries(prog.distinct.coatings)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25),
        topCategories: Object.entries(prog.distinct.categories)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25),
        types: prog.distinct.types,
        indexes: prog.distinct.indexes,
      },
    },
  };

  writeJson("hierarchy-summary.json", summary);
  writeJson("hierarchy-sv.json", sv);
  writeJson("hierarchy-kt.json", kt);
  writeJson("hierarchy-progressive.json", prog);
  writeJson("hierarchy-compatibility.json", compatibility);

  await pool.end();
  console.log("Wrote hierarchy-*.json to", OUT_DIR);
  console.log(JSON.stringify(summary.counts, null, 2));
  console.log("Compatibility:", JSON.stringify(compatibility, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
