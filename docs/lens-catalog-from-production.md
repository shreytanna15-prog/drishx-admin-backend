# DrishX — Lens Catalog From Production

**Document type:** Data-grounded catalog inventory (Supabase Postgres)  
**Generated from audit:** 22 August 2026  
**Source script:** `scripts/audit-lens-catalog.mjs` → `scripts/catalog-audit-output/` (gitignored)  
**Re-run:** `npm run audit:catalog` from `drishx-admin-backend`

For universal power rules, see [`lens-logic-handover.md`](./lens-logic-handover.md). For how to add new rows, see [`how-to-add-lens-data.md`](./how-to-add-lens-data.md).

---

## 1. Executive summary

Production catalog today is **actively used in shop** across three main tables:

| Table | Rows | Product groups* | In shop? |
|-------|------|-----------------|----------|
| `SingleVisionLens` | **271** | 34 | Yes |
| `KryptokLens` | **278** | 13 | Yes |
| `ProgressiveLens` | **91** | 16 | Yes |
| `OriVisionLens` | 0 | — | No rows |
| `MagnusLens` | 0 | — | No rows (but “Magnus” appears as SV **brand**) |
| `BifocalLens` | 0 | — | No rows |

\*Product group = same category/brand/item/index/coating (SV) or equivalent grouping — see [Section 4](#4-how-products-are-grouped).

Supporting shop metadata:

| Table | Rows |
|-------|------|
| `CatalogProductLine` | 23 (wholesale card names) |
| `CoatingFilterLabel` | 25 (shop filter chips) |

**Key takeaway:** The previous developer entered catalog data **row by row** with explicit `sphStartRange` / `cylStartRange` values. Production data confirms the handover rules (chained bands, cross, ADD, axis) are **real and in use**, not just theory.

---

## 2. Power shapes in production

How rows are classified by SPH/CYL/cross fields:

### Single Vision (271 rows)

| Shape | Count | Meaning |
|-------|-------|---------|
| compound | 196 | Both SPH and CYL ranges (most common) |
| cross | 26 | `crossPower` set — special +SPH / −CYL product |
| sph-only | 45 | Sphere only |
| cyl-only | 3 | Cylinder only |
| plano | 1 | No power |

### Kryptok (278 rows)

| Shape | Count |
|-------|-------|
| compound | 112 |
| cyl-only | 94 |
| sph-only | 56 |
| cross | 16 |

### Progressive (91 rows)

| Shape | Count |
|-------|-------|
| sph-only | 35 |
| cyl-only | 30 |
| compound | 21 |
| plano | 5 |

---

## 3. Values actually used in production

### ADD (reading power)

| Lens type | ADD values in DB |
|-----------|----------------|
| Kryptok | **+1.00**, **+3.00** |
| Progressive | **+3.00** only |

Handover note said “+1 to +3” — production uses **+1** and **+3** for KT, **+3** only for PG V2.

### AXIS (Kryptok & Progressive)

**Kryptok** uses (including negative oblique variants):

`-180`, `-135`, `-90`, `-45`, `45`, `90`, `135`, `180`

**Progressive** uses:

`-180`, `-90`, `90`, `180`

### Cross power (`crossPower` field)

| Type | Values in DB |
|------|--------------|
| Single Vision | **−2**, **−4**, **−6** |
| Kryptok | **−4**, **−3**, **−2**, **+2**, **+3** |

### Progressive eye

| Value | Count |
|-------|-------|
| `LEFT` only | **91 rows (100%)** |

**Data gap:** No `RIGHT` eye rows in production Progressive catalog. Ordering “both eyes” may duplicate LEFT SKU or need RIGHT rows added.

### Progressive lens type

`HC`, `HMC`, `SHMC` — all present.

---

## 4. How products are grouped

The app treats these field combinations as **one product** (siblings share selectable range logic):

| Lens type | Group key fields |
|-----------|------------------|
| Single Vision | `category` + `brand` + `item` + `index` + `coating` |
| Kryptok | `category` + `brand` + `coating` |
| Progressive | `category` + `brand` + `item` + `index` + `type` + `coating` |

Each **power band** (e.g. `-6/-2`, `-8/-2`, `cross -2`) is a **separate row** with its own price and stock.

---

## 5. Chained power bands (confirmed in production)

The handover rule is **correct and used in live data**. Example: **ASH · GREEN · 1.60** (5 rows):

| Band label | `sph` (end) | `sphStartRange` | `cyl` (end) | `cylStartRange` | Customer can pick SPH |
|------------|-------------|-----------------|-------------|-----------------|------------------------|
| **−6/−2** | −6.00 | **0** | −2.00 | 0 | 0 → −6.00 |
| **−8/−2** | −8.00 | **−6.25** | −2.00 | 0 | −6.25 → −8.00 |
| cross −2 | (cross) | — | — | — | +SPH / −CYL rules |
| +4/+2 | +4.00 | 0 | +2.00 | 0 | 0 → +4.00 |
| +6 (sph-only) | +6.00 | **+4.25** | 0 | 0 | +4.25 → +6.00 |

**Rule:** Next deeper negative band starts at **previous band’s SPH end − 0.25**.

Same pattern on large lines (e.g. Hardcoat 24 rows, BLUE CUT SV 23 rows):

```
−6/−2   → SPH 0 → −6
−8/−2   → SPH −6.25 → −8
−10/−2  → SPH −8.25 → −10
−12/−2  → SPH −10.25 → −12
... up to −20/−2
```

### CYL chaining (deeper cylinder bands)

For **−6/−4** and **−8/−4** bands, production uses:

- `cylStartRange = -2.25` when the −2 CYL band ends at −2.00  
- Example ASH **−6/−4**: SPH 0→−6, CYL **−2.25 → −4**

---

## 6. Top Single Vision brands (by row count)

| Brand | Rows | Notes |
|-------|------|-------|
| *(empty)* | 54 | “Hardcoat” / generic lines — `category: Hardcoat` |
| BLU-GUARD | 41 | Premium hi-index (1.67, 1.74) |
| Magnus | 30 | Stored in **SingleVisionLens**, not MagnusLens table |
| MARI BLU | 28 | |
| BLUE CUT SV | 23 | Full negative ladder + cross |
| NIGHT DRIVE | 15 | |
| ZION | 13 | |
| PG BLUE CUT | 11 | |
| ASH | 5 | Classic handover example |
| test / test2 | 2 | **Remove or ignore** — dev test rows |

---

## 7. Kryptok production lines

| Category | Coating | Rows | ADD | Axis variants | Has CROSS item |
|----------|---------|------|-----|---------------|----------------|
| HC KT | HC | 74 | +3 | ±45, 90, 135, 180 | Yes |
| PG HC KT | HC | 50 | +3 | ±45, 90, 135, 180 | Yes |
| BRC KT | HC | 48 | +3 | ±45, 90, 135, 180 | Yes |
| BRC KT | BLUE (VIOLET KT brand) | 37 | +3 | Full ± set | Yes |
| *(others)* | — | — | +1 or +3 | — | — |

Wholesale shop cards (`CatalogProductLine` for kryptok):  
`HC KT`, `PG HC KT`, `BRC KT`, `PG BRC KT`, `POLY BRC KT`, `CROSS`

---

## 8. Progressive V2 production lines

Sample groups:

| Category | Item | Index | Type | Coating | Rows |
|----------|------|-------|------|---------|------|
| BRC V2 | BRC V2 | 1.56 | SHMC | Green | 19 |
| Pro-Tron 9+4 Design | BLUE CUT PROGRESSIVE 1.56 | 1.56 | SHMC | Clik / LR Green | 10 each |

Wholesale cards: `HC V2`, `PG HC V2`, `BRC V2`, `Poly BRC V2`, `PG BRC V2`, `PG Poly BRC V2`

**All rows:** `add = 3`, `eye = LEFT` only.

---

## 9. Wholesale product lines (shop cards)

### Single Vision cards

`BRC`, `Poly BRC`, `PG BRC`, `PG Poly BRC`, `H/C`, `PG H/C`, `MARI-BLUE`, `BRC 1.67`, `VIOLET`, `Eyeconic-DUAL`, `Dynamic` (custom)

### Kryptok cards

`HC KT`, `PG HC KT`, `BRC KT`, `PG BRC KT`, `POLY BRC KT`, `CROSS`

### Progressive cards

`HC V2`, `PG HC V2`, `BRC V2`, `Poly BRC V2`, `PG BRC V2`, `PG Poly BRC V2`

These names map DB rows via `app/lib/*-wholesale-catalog.ts` matcher rules — not automatically from `category` alone.

---

## 10. Pricing in production

| Metric | Value |
|--------|-------|
| Rows matching **cost × 1.2 = price** | 625 |
| Rows with different pricing | 14 |

Most rows follow seed markup. Exceptions are likely manual admin edits or special price-sheet lines.

---

## 11. Stock levels

| Type | Rows with quantity = 0 |
|------|------------------------|
| Single Vision | 259 / 271 (**96%**) |
| Kryptok | 273 / 278 (**98%**) |
| Progressive | 75 / 91 (**82%**) |

Most catalog is **listed but zero stock** — orders may go to `AWAITING_PROCUREMENT` unless stock is updated.

---

## 12. Data quality notes

| Check | Result |
|-------|--------|
| SV rows missing `sphStartRange` (when SPH set) | **0** — good |
| KT rows missing `sphStartRange` | **0** — good |
| Compound SV missing `cylStartRange` | **0** — good |
| Test brands (`test`, `test2`) | 2 rows — clean up |
| Progressive RIGHT eye rows | **0** — gap if both-eye ordering expected |
| Empty SV brand (54 rows) | Intentional for Hardcoat line — uses category/item instead |

---

## 13. Real cross product example (from DB)

**Hardcoat SV — cross −2 row:**

| Field | Value |
|-------|-------|
| `crossPower` | −2.00 |
| `cylStartRange` | 0 |
| `sph` / `cyl` on row | 0 (power comes from cross logic) |
| Price | ₹78 (cost ₹65) |

Customer selects **positive SPH** and **negative CYL** where |CYL| − SPH ≥ 0.25.

---

## 14. How this connects to the app

```
Production DB row
    ↓
GET /api/lenses/{type}/{id}  →  selectableRange { sph: [...], cyl: [...] }
    ↓
Customer picks power in shop/mobile
    ↓
Cart stores sph, cyl, axis, add, eye
    ↓
Order links to lensId (one catalog row)
```

If `sphStartRange` / `cylStartRange` are wrong, the shop shows **wrong pickable powers** even if the band label (−8/−2) looks correct on the price sheet.

---

## 15. Re-running the audit

```bash
cd drishx-admin-backend
npm run audit:catalog
```

Output files (local only, gitignored):

| File | Contents |
|------|----------|
| `summary.json` | Counts, shapes, distinct values |
| `sv-product-groups.json` | All SV products with bands |
| `kt-product-groups.json` | KT product summary |
| `pg-product-groups.json` | Progressive product summary |
| `sample-products.json` | ASH, top brands, cross examples |
| `catalog-product-lines.json` | Wholesale cards |
| `data-quality.json` | Anomalies |

---

## Related docs

- [`lens-logic-handover.md`](./lens-logic-handover.md) — business rules (previous developer)
- [`lens-domain-logic.md`](./lens-domain-logic.md) — code-level validation & API
- [`how-to-add-lens-data.md`](./how-to-add-lens-data.md) — step-by-step with production examples
- [`intro.md`](./intro.md) — platform overview
