/**
 * Read-only audit of lens catalog tables in production Postgres (Supabase).
 * Output: scripts/catalog-audit-output/*.json
 *
 * Usage: node scripts/audit-lens-catalog.mjs
 * Requires: DATABASE_URL in .env.local
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

function round2(n) {
  return Math.round(n * 100) / 100;
}

function hasPower(value) {
  const n = toNum(value);
  return n !== null && Math.abs(n) > 1e-9;
}

function classifyPowerShape(row) {
  if (hasPower(row.crossPower)) return "cross";
  const hasSph = hasPower(row.sph);
  const hasCyl = hasPower(row.cyl);
  if (hasSph && hasCyl) return "compound";
  if (hasSph) return "sph-only";
  if (hasCyl) return "cyl-only";
  return "plano";
}

function powerLabel(sph, cyl) {
  const s = toNum(sph);
  const c = toNum(cyl);
  if (s === null && c === null) return "plano";
  if (c === null || Math.abs(c) < 1e-9) return `${s}`;
  if (s === null || Math.abs(s) < 1e-9) return `—/${c}`;
  return `${s}/${c}`;
}

function rangeLabel(sphStart, sphEnd, cylStart, cylEnd) {
  const ss = toNum(sphStart);
  const se = toNum(sphEnd);
  const cs = toNum(cylStart);
  const ce = toNum(cylEnd);
  const sphPart =
    se !== null
      ? `SPH ${ss ?? 0} → ${se}`
      : "SPH —";
  const cylPart =
    ce !== null
      ? `CYL ${cs ?? 0} → ${ce}`
      : "CYL —";
  return `${sphPart}, ${cylPart}`;
}

function svProductKey(row) {
  return [
    row.category ?? "",
    row.brand ?? "",
    row.item ?? "",
    String(toNum(row.index) ?? row.index ?? ""),
    row.coating ?? "",
  ].join("|");
}

function ktProductKey(row) {
  return [row.category ?? "", row.brand ?? "", row.coating ?? ""].join("|");
}

function pgProductKey(row) {
  return [
    row.category ?? "",
    row.brand ?? "",
    row.item ?? "",
    String(toNum(row.index) ?? row.index ?? ""),
    row.type ?? "",
    row.coating ?? "",
  ].join("|");
}

function serializeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === "object" && v !== null && "toString" in v)
      out[k] = v.toString();
    else out[k] = v;
  }
  return out;
}

function writeJson(name, data) {
  writeFileSync(
    resolve(OUT_DIR, name),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

async function query(pool, sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
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

  console.log("Connecting to database (read-only audit)...");

  const tableCounts = {};
  for (const table of [
    "SingleVisionLens",
    "KryptokLens",
    "ProgressiveLens",
    "OriVisionLens",
    "MagnusLens",
    "BifocalLens",
    "CatalogProductLine",
    "CoatingFilterLabel",
  ]) {
    const [{ count }] = await query(
      pool,
      `SELECT COUNT(*)::int AS count FROM "${table}"`
    );
    tableCounts[table] = count;
  }

  const svRows = await query(pool, `SELECT * FROM "SingleVisionLens" ORDER BY brand, coating, sph`);
  const ktRows = await query(pool, `SELECT * FROM "KryptokLens" ORDER BY category, coating, sph`);
  const pgRows = await query(pool, `SELECT * FROM "ProgressiveLens" ORDER BY brand, item, sph`);
  const catalogLines = await query(
    pool,
    `SELECT * FROM "CatalogProductLine" ORDER BY "lensType", "sortOrder", name`
  );
  const coatingFilters = await query(
    pool,
    `SELECT * FROM "CoatingFilterLabel" ORDER BY "lensType", "sortOrder", name`
  );

  // Power shapes
  const svShapes = {};
  const ktShapes = {};
  const pgShapes = {};
  for (const row of svRows) {
    const s = classifyPowerShape(row);
    svShapes[s] = (svShapes[s] ?? 0) + 1;
  }
  for (const row of ktRows) {
    const s = classifyPowerShape(row);
    ktShapes[s] = (ktShapes[s] ?? 0) + 1;
  }
  for (const row of pgRows) {
    const s = classifyPowerShape(row);
    pgShapes[s] = (pgShapes[s] ?? 0) + 1;
  }

  // SV product groups
  const svGroups = new Map();
  for (const row of svRows) {
    const key = svProductKey(row);
    if (!svGroups.has(key)) {
      svGroups.set(key, {
        category: row.category,
        brand: row.brand,
        item: row.item,
        index: toNum(row.index),
        coating: row.coating,
        rowCount: 0,
        bands: [],
        hasCross: false,
      });
    }
    const g = svGroups.get(key);
    g.rowCount += 1;
    if (hasPower(row.crossPower)) g.hasCross = true;
    g.bands.push({
      id: row.id,
      shape: classifyPowerShape(row),
      label: hasPower(row.crossPower)
        ? `cross ${toNum(row.crossPower)}`
        : powerLabel(row.sph, row.cyl),
      sph: toNum(row.sph),
      sphStartRange: toNum(row.sphStartRange),
      cyl: toNum(row.cyl),
      cylStartRange: toNum(row.cylStartRange),
      crossPower: toNum(row.crossPower),
      price: toNum(row.price),
      costPrice: toNum(row.costPrice),
      quantity: row.quantity,
      rangeDescription: rangeLabel(
        row.sphStartRange ?? 0,
        row.sph,
        row.cylStartRange ?? 0,
        row.cyl
      ),
    });
  }

  // Chained range analysis for SV compound bands (same product + same cyl end)
  const chainedRangeFindings = [];
  for (const [, group] of svGroups) {
    const compoundBands = group.bands.filter(
      (b) => b.shape === "compound" && b.cyl !== null && b.sph !== null
    );
    const byCyl = new Map();
    for (const b of compoundBands) {
      const ck = String(b.cyl);
      if (!byCyl.has(ck)) byCyl.set(ck, []);
      byCyl.get(ck).push(b);
    }
    for (const [cylKey, bands] of byCyl) {
      const sorted = [...bands].sort((a, b) => (a.sph ?? 0) - (b.sph ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const expectedStart = round2((prev.sph ?? 0) - 0.25);
        const actualStart = curr.sphStartRange ?? 0;
        chainedRangeFindings.push({
          brand: group.brand,
          coating: group.coating,
          cyl: toNum(cylKey),
          previousBandEnd: prev.sph,
          currentBandEnd: curr.sph,
          expectedSphStartRange: expectedStart,
          actualSphStartRange: actualStart,
          matchesChainedRule: Math.abs(actualStart - expectedStart) < 0.01,
        });
      }
    }
  }

  // KT groups
  const ktGroups = new Map();
  for (const row of ktRows) {
    const key = ktProductKey(row);
    if (!ktGroups.has(key)) {
      ktGroups.set(key, {
        category: row.category,
        brand: row.brand,
        coating: row.coating,
        rowCount: 0,
        distinctAxis: new Set(),
        distinctAdd: new Set(),
        items: new Set(),
      });
    }
    const g = ktGroups.get(key);
    g.rowCount += 1;
    if (row.axis != null) g.distinctAxis.add(row.axis);
    g.distinctAdd.add(String(toNum(row.add)));
    if (row.item) g.items.add(row.item);
  }

  const ktGroupsOut = [...ktGroups.values()].map((g) => ({
    ...g,
    distinctAxis: [...g.distinctAxis].sort((a, b) => a - b),
    distinctAdd: [...g.distinctAdd].sort(),
    items: [...g.items].sort(),
  }));

  // PG groups
  const pgGroups = new Map();
  for (const row of pgRows) {
    const key = pgProductKey(row);
    if (!pgGroups.has(key)) {
      pgGroups.set(key, {
        category: row.category,
        brand: row.brand,
        item: row.item,
        index: toNum(row.index),
        type: row.type,
        coating: row.coating,
        rowCount: 0,
        eyes: new Set(),
        distinctAdd: new Set(),
        distinctAxis: new Set(),
      });
    }
    const g = pgGroups.get(key);
    g.rowCount += 1;
    g.eyes.add(row.eye);
    g.distinctAdd.add(String(toNum(row.add)));
    if (row.axis != null) g.distinctAxis.add(row.axis);
  }

  const pgGroupsOut = [...pgGroups.values()].map((g) => ({
    ...g,
    eyes: [...g.eyes].sort(),
    distinctAdd: [...g.distinctAdd].sort(),
    distinctAxis: [...g.distinctAxis].sort((a, b) => a - b),
  }));

  // Distinct values
  const distinctValues = {
    kryptokAxis: [
      ...new Set(ktRows.map((r) => r.axis).filter((v) => v != null)),
    ].sort((a, b) => a - b),
    kryptokAdd: [
      ...new Set(ktRows.map((r) => String(toNum(r.add)))),
    ].sort((a, b) => Number(a) - Number(b)),
    progressiveAxis: [
      ...new Set(pgRows.map((r) => r.axis).filter((v) => v != null)),
    ].sort((a, b) => a - b),
    progressiveAdd: [
      ...new Set(pgRows.map((r) => String(toNum(r.add)))),
    ].sort((a, b) => Number(a) - Number(b)),
    progressiveEye: [...new Set(pgRows.map((r) => r.eye))].sort(),
    progressiveType: [...new Set(pgRows.map((r) => r.type))].sort(),
    svCrossPowers: [
      ...new Set(
        svRows
          .filter((r) => hasPower(r.crossPower))
          .map((r) => toNum(r.crossPower))
      ),
    ].sort((a, b) => a - b),
    ktCrossPowers: [
      ...new Set(
        ktRows
          .filter((r) => hasPower(r.crossPower))
          .map((r) => toNum(r.crossPower))
      ),
    ].sort((a, b) => a - b),
  };

  // Data quality
  const svMissingStartRange = svRows.filter(
    (r) =>
      !hasPower(r.crossPower) &&
      hasPower(r.sph) &&
      r.sphStartRange === null
  );
  const ktMissingStartRange = ktRows.filter(
    (r) => r.sphStartRange === null && hasPower(r.sph)
  );
  const compoundMissingCylStart = svRows.filter(
    (r) =>
      classifyPowerShape(r) === "compound" &&
      r.cyl !== null &&
      r.cylStartRange === null
  );

  const dataQuality = {
    svRowsMissingSphStartRange: svMissingStartRange.length,
    svMissingStartRangeSamples: svMissingStartRange.slice(0, 15).map(serializeRow),
    ktRowsMissingSphStartRange: ktMissingStartRange.length,
    compoundSvMissingCylStartRange: compoundMissingCylStart.length,
    svZeroStock: svRows.filter((r) => r.quantity === 0).length,
    ktZeroStock: ktRows.filter((r) => r.quantity === 0).length,
    pgZeroStock: pgRows.filter((r) => r.quantity === 0).length,
    chainedRangePairs: chainedRangeFindings.length,
    chainedRangeMatches: chainedRangeFindings.filter((f) => f.matchesChainedRule)
      .length,
    chainedRangeMismatches: chainedRangeFindings.filter((f) => !f.matchesChainedRule),
  };

  // Pricing — check 20% markup
  const pricingSamples = [];
  let markupMatch = 0;
  let markupMismatch = 0;
  for (const row of [...svRows, ...ktRows, ...pgRows].slice(0, 5000)) {
    const cost = toNum(row.costPrice);
    const price = toNum(row.price);
    if (cost === null || price === null || cost <= 0) continue;
    const expected = Math.round(cost * 1.2);
    const match = Math.abs(price - expected) < 1;
    if (match) markupMatch += 1;
    else markupMismatch += 1;
    if (pricingSamples.length < 10 && !match) {
      pricingSamples.push({
        table: row.brand ? "lens" : "unknown",
        brand: row.brand,
        cost,
        price,
        expectedMarkup20: expected,
      });
    }
  }

  // Top brands by row count
  const svBrandCounts = {};
  for (const row of svRows) {
    svBrandCounts[row.brand] = (svBrandCounts[row.brand] ?? 0) + 1;
  }
  const topSvBrands = Object.entries(svBrandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([brand, count]) => ({ brand, count }));

  // Sample products for docs — pick ASH, top brands, one KT, one PG
  function pickGroup(groupsMap, predicate) {
    for (const [key, g] of groupsMap) {
      if (predicate(g, key)) return { key, ...g };
    }
    return null;
  }

  const svGroupsArr = [...svGroups.entries()].map(([key, g]) => ({
    key,
    ...g,
    bands: g.bands.sort((a, b) => (a.sph ?? 0) - (b.sph ?? 0)),
  }));

  const sampleProducts = {
    ashGreen: svGroupsArr.find(
      (g) =>
        String(g.brand).toUpperCase().includes("ASH") &&
        String(g.coating).toUpperCase().includes("GREEN")
    ),
    topSvByRows: svGroupsArr.sort((a, b) => b.rowCount - a.rowCount).slice(0, 5),
    sampleKryptok: ktGroupsOut.sort((a, b) => b.rowCount - a.rowCount).slice(0, 3),
    sampleProgressive: pgGroupsOut
      .sort((a, b) => b.rowCount - a.rowCount)
      .slice(0, 3),
    crossExamples: svRows
      .filter((r) => hasPower(r.crossPower))
      .slice(0, 5)
      .map(serializeRow),
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    tableCounts,
    powerShapes: {
      singleVision: svShapes,
      kryptok: ktShapes,
      progressive: pgShapes,
    },
    productGroupCounts: {
      singleVision: svGroups.size,
      kryptok: ktGroups.size,
      progressive: pgGroups.size,
    },
    distinctValues,
    dataQuality: {
      svRowsMissingSphStartRange: dataQuality.svRowsMissingSphStartRange,
      ktRowsMissingSphStartRange: dataQuality.ktRowsMissingSphStartRange,
      compoundSvMissingCylStartRange: dataQuality.compoundSvMissingCylStartRange,
      chainedRangePairs: dataQuality.chainedRangePairs,
      chainedRangeMatches: dataQuality.chainedRangeMatches,
      chainedRangeMismatchCount: dataQuality.chainedRangeMismatches.length,
      zeroStock: {
        sv: dataQuality.svZeroStock,
        kt: dataQuality.ktZeroStock,
        pg: dataQuality.pgZeroStock,
      },
    },
    pricing: {
      markupMatch,
      markupMismatch,
      note: "Seeds use cost × 1.2 for selling price; mismatches may be manual admin pricing.",
    },
    topSvBrands,
    catalogProductLineCount: catalogLines.length,
    coatingFilterCount: coatingFilters.length,
  };

  writeJson("summary.json", summary);
  writeJson("power-shapes.json", summary.powerShapes);
  writeJson("distinct-values.json", distinctValues);
  writeJson("data-quality.json", dataQuality);
  writeJson("chained-ranges.json", chainedRangeFindings);
  writeJson("top-sv-brands.json", topSvBrands);
  writeJson(
    "sv-product-groups.json",
    svGroupsArr.sort((a, b) => b.rowCount - a.rowCount)
  );
  writeJson("kt-product-groups.json", ktGroupsOut);
  writeJson("pg-product-groups.json", pgGroupsOut);
  writeJson("sample-products.json", sampleProducts);
  writeJson("catalog-product-lines.json", catalogLines.map(serializeRow));
  writeJson("coating-filter-labels.json", coatingFilters.map(serializeRow));
  writeJson("pricing-analysis.json", { markupMatch, markupMismatch, pricingSamples });

  console.log("Audit complete. Output:", OUT_DIR);
  console.log(JSON.stringify(summary, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
