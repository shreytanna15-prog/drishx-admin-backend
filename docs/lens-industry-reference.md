# DrishX — Lens industry & catalog reference

**Purpose:** One place to understand **optical-lens wholesale language** and **how DrishX models it** — so you can point here instead of re-reading many docs, re-running audits, or re-searching the web.

**Audience:** Engineers and product working on catalog, stock, shop, or admin.

**Last updated:** November 2026

**Not this doc:** Order fulfillment, roles, payments. For those see [`intro.md`](./intro.md) and the ops role spec.

---

## 0. How to use this doc

| If you need… | Start at |
|--------------|----------|
| What SPH / CYL / AXIS / ADD mean | [§1](#1-prescription-glossary) |
| What SV / Kryptok / Progressive are | [§2](#2-lens-designs-families) |
| Index, coating, base, material, color | [§3](#3-product-attributes-industry--drishx) |
| Power bands, steps, cross, chaining | [§4](#4-powers-ranges-shapes-and-cross) |
| What shop/web/mobile still use today | [§5](#5-two-catalog-worlds-in-drishx) |
| Static “white catalog” (no DB) | [§5.3](#53-client-static-white-catalog-no-backend-rows) |
| New Attributes / parent+variant catalog | [§5.2](#52-new-attribute-catalog-admin--rc-03rc-04) |
| Production row counts / audit script | [§6](#6-production-data--audit-scripts) |
| Pointers to deeper docs | [§8](#8-related-docs-index) |

---

## 1. Prescription glossary

Optical power is measured in **diopters (D)**. In DrishX (and Indian wholesale sheets), steps are almost always **0.25 D**.

| Term | Meaning | Typical values | In DrishX |
|------|---------|----------------|-----------|
| **SPH (Sphere)** | Main lens power. **Minus** = myopia (near-sighted); **plus** = hyperopia (far-sighted); **0 / plano** = no sphere power | −20.00 … +8.00 (shop catalogs vary) | Decimal; range rows use start/end fields |
| **CYL (Cylinder)** | Astigmatism correction (power differs by meridian) | Often −0.25 … −6.00 on minus sheets; plus CYL also sold | Optional on many SV rows |
| **AXIS** | Orientation of the cylinder, in degrees | Clinically **1–180°**. Wholesale stock often stocked only at **90 / 180 / 45 / 135** (and signed variants) | On **Kryptok** and **Progressive** catalog rows — part of SKU identity, not free 1–180 lab Rx |
| **ADD (Addition)** | Extra near power for reading / near zone | Commonly **+1.00 … +3.00** (production also has **+4**, and some **0**) | Required on **Kryptok** and **Progressive** rows; **not** on Single Vision |
| **Eye (OD / OS)** | Right / left eye | LEFT, RIGHT | Progressive catalog rows are **per eye** |
| **PD / diameter** | Pupillary distance / lens blank size (mm) | e.g. 55 mm, 70 mm | Mostly RX / color-lens notes — not SV/KT power SKU identity |
| **Plano** | Zero power | SPH and CYL effectively 0 / null | Allowed on some rows; **stripped** from compound selectable lists |

### Sheet shorthand

| Written | Means |
|---------|--------|
| `-6 / -2` | SPH end **−6.00**, CYL end **−2.00** |
| `+4 / +2` | SPH **+4.00**, CYL **+2.00** |
| SPH only | CYL null / zero |
| CYL only | SPH null / zero |
| Cross −2 | Special +SPH / −CYL line with `crossPower = −2` (see [§4.4](#44-cross-cylinder)) |

---

## 2. Lens designs (families)

### 2.1 Single Vision (SV)

- **One** focal power across the whole lens (distance *or* near *or* intermediate — one prescription).
- Corrects myopia / hyperopia and optionally astigmatism (SPH ± CYL).
- **No ADD**, **no AXIS** on DrishX catalog rows (AXIS belongs on the Rx when CYL is present at the lab; stock SV leaves do not carry axis variants).
- DrishX enum / table: `SINGLE_VISION` → `SingleVisionLens`.
- New catalog family code: typically **`SV`**.

### 2.2 Bifocal — and why “Kryptok”

**Bifocal** = two distinct powers: distance on top, near (ADD) in a **segment** below, with a visible line.

Common segment styles (industry):

| Style | Also called | Segment shape | Notes |
|-------|-------------|---------------|--------|
| **Flat-top / Straight-top / D-seg** | FT-28, ST-28, etc. | Flat upper edge (D shape) | Most common modern bifocal; less image jump |
| **Round segment / Kryptok** | Round 22, etc. | Circular near segment | Historically the fused “Kryptok” bifocal (1908); more image jump; still a common **wholesale line name** in India |
| **Executive / Franklin** | E-style | Full-width near half | Minimal image jump |

**In DrishX, “Kryptok” (KT) is a product family / price-sheet line**, not a programming term. It behaves as a **bifocal-style** catalog with **ADD + AXIS** on each stock row.

- Enum / table: `KRYPTOK` → `KryptokLens`.
- New catalog family code: typically **`KT`**.
- Separate empty table `BifocalLens` exists but has **0 production rows**; shop focus is KT, not a second bifocal stack.

### 2.3 Progressive (PG / V2)

- **No-line multifocal**: power changes gradually from distance → intermediate → near.
- Needs **ADD** (near addition) and usually **eye** (LEFT/RIGHT stock).
- DrishX enum / table: `PROGRESSIVE` → `ProgressiveLens`.
- Wholesale / attribute shorthand: **`V2`**, **`PG V2`**, progressive cards like `BRC V2`, `HC V2`.
- Progressive rows also carry `type` grades: **HC / HMC / SHMC** (see coatings).

### 2.4 Other families in schema (secondary)

| Enum | Table | Shop status (prod snapshot) |
|------|-------|------------------------------|
| `ORI_VISION` | `OriVisionLens` | Empty |
| `MAGNUS` | `MagnusLens` | Empty (“Magnus” may appear as an SV **brand** string) |
| `BIFOCAL` | `BifocalLens` | Empty |

Main shop + wholesale flows: **SV, KT, Progressive**.

---

## 3. Product attributes (industry ↔ DrishX)

Wholesale identity is rarely “one brand string”. It is a **stack of attributes**. DrishX has **two encodings** of that stack ([§5](#5-two-catalog-worlds-in-drishx)).

### 3.1 Refractive index

Higher index → **thinner** lens for the same power (usually lower Abbe / more chromatic aberration).

| Index (approx.) | Typical material class | Notes |
|-----------------|------------------------|--------|
| **1.49 / 1.50** | CR-39 / standard plastic | Baseline thickness; high Abbe |
| **1.56** | Mid-index resin | Very common blue-cut stock |
| **1.59 / 1.60** | Polycarbonate / mid-hi | Impact resistance; Poly lines |
| **1.61** | High-index (e.g. MR-8 class) | Thinner mid-high |
| **1.67** | High-index | Thin |
| **1.74** | Ultra high-index | Thinnest common stock |

**DrishX:**

- Legacy SV/PG: `index` decimal on the leaf row.
- New catalog: `LensIndex` master (`code`, optional numeric `value`).

### 3.2 Base (treatment family) — new catalog

In the **new** attribute model, **Base** is a first-class peer of Family:

| Code | Full form | Meaning |
|------|-----------|---------|
| **HC** | Hard Coat | Scratch-resistant hard coat; often “white” / no full blue-cut stack |
| **BRC** | Blue Ray Cut / Blue Cut | Blue-light filter (~UV420) + usually AR / colour coat |
| **ARC** | Anti-Reflective Coating | Clear AR stack (peer of HC/BRC; may not be a live wholesale **card** name) |

Legacy leaves encode “base” inside free-text `category` / `brand` / `coating` / Progressive `type` (e.g. `BLUE CUT`, `HC KT`, `HMC`).

### 3.3 Material / kind (new catalog)

Composes with Base (seeded via `LensBaseMaterialLink`):

| Code | Meaning |
|------|---------|
| **PLAIN** | Standard / no special substrate modifier |
| **UC** | Uncoated blank |
| **TINTABLE** | Dyeable (color-lens flows) |
| **POLY** | Polycarbonate |
| **PG** | Photochromic / Photogrey (darkens in sun) |
| **PG_POLY** | Photochromic polycarbonate |

Material is **optional** on new `LensProduct` parents (RC-03/RC-05).

### 3.4 Coating vs Color (do not mix)

| Concept | Meaning | New catalog |
|---------|---------|-------------|
| **Coating** | Surface treatment / coat **label** (HC, HMC, SHMC, Green coat, Mari-Blue, Invisible Blue, Dual, …) | `LensCoating` master — **not** product identity / SKU / name (RC-04) |
| **Color** | Tint colour word for tinted lines (Green, Blue, Grey, Brown, Violet, …) | `LensColor` — **is** identity when set |

Legacy leaves often stuffed both into one `coating` string (e.g. `"GREEN"`, `"HMC GREEN"`, `"Invisible Blue"`). Shop filter chips: `CoatingFilterLabel`.

**Coating grades** (industry + Progressive `type`):

| Short | Full form |
|-------|-----------|
| **UC** | Uncoated |
| **HC** | Hard Coat |
| **HMC** | Hard Multi Coating (hard + AR) |
| **SHMC** | Super Hydrophobic Multi Coating |

### 3.5 Family (new catalog)

| Code | Maps to |
|------|---------|
| **SV** | Single Vision |
| **KT** | Kryptok |
| **V2** | Progressive (V2 line) |

### 3.6 Legacy string fields (still on leaf tables)

Used by shop APIs and sibling grouping today:

| Field | Role |
|-------|------|
| `category` | Series / sheet section (e.g. `BLUE CUT`, `HC KT`, `BRC V2`) |
| `brand` | Line name within category (e.g. `ASH`, `PROTECTOR`) |
| `item` | Sub-label (e.g. `BLUE CUT`, `CROSS`, progressive item codes) |
| `index` | Refractive index (SV / Progressive) |
| `coating` | Coat / colour string |
| `type` | Progressive grade HC/HMC/SHMC |

**Sibling / “same product” keys** (for selectable ranges):

| Type | Same product if same… |
|------|------------------------|
| SV | `category` + `brand` + `item` + `index` + `coating` |
| KT | `category` + `brand` + `coating` |
| Progressive | `category` + `brand` + `item` + `index` + `type` + `coating` |

Code: `app/lib/related-lenses.ts`.

---

## 4. Powers, ranges, shapes, and cross

### 4.1 Range SKU vs exact power

Legacy catalog rows are usually **price-sheet bands**, not one row per 0.25 cell:

| DB field | Role |
|----------|------|
| `sph` | **End** of SPH band (the number printed as “−6”) |
| `sphStartRange` | **Start** of SPH band (defaults toward **0** if null) |
| `cyl` / `cylStartRange` | Same for cylinder |
| `crossPower` | Cross-cylinder endpoint (special rows) |

Backend expands start→end in **0.25** steps → `selectableRange` for the UI (`app/lib/lens-power-range.ts`).

### 4.2 Chained bands

Deeper negative SPH for the **same product** is a **new row**, not an edit:

| Band | `sph` (end) | `sphStartRange` |
|------|-------------|-----------------|
| −6/−2 | −6 | **0** |
| −8/−2 | −8 | **−6.25** (= previous end − 0.25) |
| −10/−2 | −10 | **−8.25** |

Same idea for plus ladders (`+4/+2` then `+6` sph-only starting at `+4.25`). Confirmed in production (e.g. ASH GREEN 1.60). Details: [`how-to-add-lens-data.md`](./how-to-add-lens-data.md).

### 4.3 Power shapes

| Shape | Meaning |
|-------|---------|
| **sph-only** | Non-zero SPH, no meaningful CYL |
| **cyl-only** | Non-zero CYL, no meaningful SPH |
| **compound** | Both SPH and CYL |
| **cross** | `crossPower` set (or legacy pattern match) |
| **plano** | No power |

**Compound no-plano:** if the row is compound, **0.00 cannot be selected** on either axis in the shop lists.

**Wholesale compound sign rule:**

| SPH | CYL | Allowed? |
|-----|-----|----------|
| + | + | Yes |
| − | − | Yes |
| + | − | Yes |
| − | + | **No** |

### 4.4 Cross-cylinder

Wholesale “cross −2 / −4 / −6” lines:

- SPH always **positive**
- CYL always **negative**
- Gap rule: **|CYL| − SPH ≥ 0.25**

Example: CYL −2.00 → SPH options +0.25 … +1.75.

Code: `app/lib/cross-product.ts`, `app/lib/cross-power.ts`.

### 4.5 AXIS in stock (KT / Progressive)

Not the same as free Rx axis on a lab ticket. Stock variants:

| Value | Wholesale label (schema comments) |
|-------|-----------------------------------|
| **90** | ST.AXIS (straight) |
| **180** | REV AXIS (reverse) |
| **45 / 135** | SPL AXIS (oblique) |
| **−45 / −135** (and similar signed) | SPL variants in KT seeds / production |

Progressive can **auto-derive** axis from SPH/CYL signs when unset (`app/lib/progressive-axis.ts`).

### 4.6 ADD

- Optical: near addition for bifocal segment / progressive corridor.
- **Part of SKU** — different ADD = different row.
- Production snapshot (Aug 2026 audit): KT mostly **+1** and **+3**; Progressive mostly **+3** only.

### 4.7 New catalog power-range masters (RC-03)

`LensPowerRange` stores four bounds: `sphMin`, `sphMax`, `cylMin`, `cylMax` (stepped selects −40…+8).

| Surface | Format |
|---------|--------|
| Attribute table | Span as stored, e.g. `0.00 to +4.00` |
| Variant UI / auto **name** | Compact extreme only: `{max_SPH}/{max_CYL}` (larger \|value\|), e.g. SPH −2…+4 → `+4.00` |
| Variant **SKU** | Both bounds encoded (numeric order), e.g. `S…T…-C…T…` |

Create UX does **not** enforce min≤max math — bounds are validated on the step grid only. Helpers: `app/lib/catalog/catalog-power-select-options.ts`, `lens-product-sku.ts`.

---

## 5. Two catalog worlds in DrishX

Until shop/mobile cutover, **both** coexist. Do not delete legacy leaf tables.

### 5.1 Legacy power leaves (what customers order today)

```
Price-sheet product group
   └── many rows in SingleVisionLens | KryptokLens | ProgressiveLens
         each row = one power band (or cross) + price + quantity
Order.lensType + Order.lensId  →  exactly one leaf row
```

| Consumer | How it loads data |
|----------|-------------------|
| Web shop / wholesale | Backend `GET /api/lenses…` (+ type detail routes) |
| Mobile shop / wholesale | Same backend URLs |
| Admin stock-overview / create lens | Same tables via admin APIs |
| Cart / orders / returns | Resolve prescription against leaf + siblings |

**Wholesale shop cards** (names like BRC, HC KT) come from `CatalogProductLine` + matcher libs:

- `app/lib/single-vision-wholesale-catalog.ts`
- `app/lib/kryptok-wholesale-catalog.ts`
- `app/lib/progressive-wholesale-catalog.ts`

### 5.2 New attribute catalog (admin — RC-03/RC-04)

**SoT for Axis / Addition / Diameter / Eye** on new catalog products (not legacy leaf tables):

| Field | Where | Notes |
|-------|--------|--------|
| Axis | Master `LensAxis` → multi-select → `LensProductVariant.axisId` | Cartesian with power ranges; family `supportsAxis` |
| Axis | Master `LensAxis` → multi → variant `axisId` | KT/V2; only when range CYL ≠ 0 |
| Addition | Master `LensAddition` → multi → variant `additionId` | KT/V2; optional |
| Diameter | Master `LensDiameter` → optional FK on **parent** | Any family |
| Progressive type | Master `LensProgressiveType` → parent FK | V2 only; optional, no default; SKU and parent identity, not name |
| Eye | Auto `LEFT`/`RIGHT` on **variant** | V2 only; no create picker |

```
LensFamily (supportsAxis / supportsAdd / supportsEye / supportsProgressiveType)
  · LensBase · LensMaterial? · LensIndex · LensColor · LensDiameter?
  · LensProgressiveType? (V2)
  + LensPowerRange · LensAxis · LensAddition masters
  + LensCoating (master only; not identity)
        │
        ▼
LensProduct (parent — attrs once)
        │ 1 → many
        ▼
LensProductVariant (range × optional axis × optional ADD × auto eye on V2)
        └── matrix UI (cells placeholder until stock slice)
```

Shop/mobile **do not** yet sell from `LensProductVariant`. Stock/PO target: hang off the **variant** later (`docs/stock-management/`).

### 5.3 Client static “white catalog” (no backend rows)

Web and mobile still ship a **hardcoded** white-lens browse path that **does not** read Postgres leaf tables:

| File | Repo |
|------|------|
| `lib/white-catalog.ts` | `drishx-web-app` |
| `lib/white-catalog.ts` | `drishx-mobile-app` |

What it contains (mirrored in both clients):

| Layer | IDs / examples |
|-------|----------------|
| Lens types | `single-vision`, `kryptok` only (no progressive white path) |
| Product lines | `white-55-sv`, `pg-6l-sv`, `white-55-kt`, `pg-6l-kt` |
| SV variants | `+6` sph-only, `+4/+2`, `−10` sph-only, `−6/−2` |
| KT variants | `±2` sph-only, `±2` cyl-only with fixed axis 180/90; ADD **+1…+3** |
| Synthetic IDs | Prefix `white-catalog-…` |

Powers are generated client-side (`generatePowerOptions`, 0.25 step). This is the “old static data” path called out in [`lens-domain-logic.md`](./lens-domain-logic.md) §13.

**Related bypasses:** RX orders and color-lens orders send free-form prescriptions in notes — they are not matched to leaf SKUs the same way.

### 5.4 Scripts that describe / migrate old data

| Script | Role |
|--------|------|
| `scripts/audit-lens-catalog.mjs` | Read-only production inventory → `scripts/catalog-audit-output/` (gitignored). Run: `npm run audit:catalog` |
| `scripts/analyze-catalog-hierarchy.mjs` | Hierarchy analysis for attribute redesign |
| `scripts/catalog-legacy-backfill.ts` + `app/lib/catalog/legacy-*.ts` | Link / backfill legacy leaves toward new catalog (admin tooling) |
| `prisma/seed-*.ts` | Historical seed patterns for SV/KT/PG bands |

Human-readable snapshot of an audit: [`lens-catalog-from-production.md`](./lens-catalog-from-production.md) (Aug 2026 numbers — re-run audit for current counts).

---

## 6. Production data & audit scripts

**Typical live shape (from Aug 2026 audit — refresh with `npm run audit:catalog`):**

| Table | ~Rows | In shop? |
|-------|-------|----------|
| `SingleVisionLens` | ~270+ | Yes |
| `KryptokLens` | ~278 | Yes |
| `ProgressiveLens` | ~91 | Yes |
| Ori / Magnus / Bifocal | 0 | No |
| `CatalogProductLine` | ~23 | Wholesale cards |
| `CoatingFilterLabel` | ~25 | Filter chips |

Progressive production note: historically **100% `eye = LEFT`** — RIGHT rows may still be missing.

---

## 7. One-page mental model

1. **Industry:** lenses are designed (SV / bifocal-Kryptok / progressive), built from a **material + index**, finished with **coatings**, sold in **power bands** on a wholesale sheet.
2. **Prescription:** SPH / CYL (0.25 steps); KT/PG add **ADD** (+ AXIS stock variants); Progressive adds **eye**.
3. **DrishX shop today:** one order line → one **legacy leaf** row (or white-catalog / RX / color special cases).
4. **DrishX admin catalog target:** attributes → **parent** → **power-range variants** with auto SKU/name; stock later attaches to the variant.
5. **Do not confuse:** `LensProduct` (new parent) ≠ `CatalogProduct` (older admin stack) ≠ `CatalogProductLine` (wholesale card) ≠ white-catalog synthetic IDs.

---

## 8. Related docs index

| Doc | What it is |
|-----|------------|
| [`lens-logic-handover.md`](./lens-logic-handover.md) | Original business rules (SV/KT/PG, chaining, cross, ADD, axis) |
| [`lens-domain-logic.md`](./lens-domain-logic.md) | Code-level validation, APIs, wholesale matrices, RX/color |
| [`how-to-add-lens-data.md`](./how-to-add-lens-data.md) | How to enter legacy leaf rows with real examples |
| [`lens-catalog-from-production.md`](./lens-catalog-from-production.md) | Production inventory snapshot |
| [`product-catalog/`](./product-catalog/) | New Attributes + parent/variant admin contract |
| [`product-catalog-hierarchy/ATTRIBUTE-TABLES-AND-HIERARCHY.md`](./product-catalog-hierarchy/ATTRIBUTE-TABLES-AND-HIERARCHY.md) | Attribute short/full forms + cascade |
| [`requested-changes.md`](./requested-changes.md) | RC-03 / RC-04 / RC-05 catalog deltas |
| [`stock-management/`](./stock-management/) | Stock/PO hanging on variants (next) |
| [`intro.md`](./intro.md) | Three-repo platform overview |

**Key code (quick):**

| Topic | Path |
|-------|------|
| Schema | `prisma/schema.prisma` (`SingleVisionLens`, `KryptokLens`, `ProgressiveLens`, `Lens*`) |
| Range / selectable | `app/lib/lens-power-range.ts` |
| Cross | `app/lib/cross-product.ts`, `cross-power.ts` |
| Progressive axis | `app/lib/progressive-axis.ts` |
| New power labels / SKU | `app/lib/catalog/catalog-power-select-options.ts`, `lens-product-sku.ts` |
| White catalog (clients) | `drishx-web-app/lib/white-catalog.ts`, `drishx-mobile-app/lib/white-catalog.ts` |

---

## 9. External industry notes (for orientation)

Useful when reading price sheets or talking to optical ops — not DrishX-specific:

- **Kryptok** historically = round-segment fused bifocal; in India wholesale it often names a **KT product line**.
- **Flat-top / ST / D-seg** = common modern bifocal segment; less image jump than round.
- **Progressive** = continuous corridor; no segment line.
- **Index tables** (1.50 → 1.74) are used industry-wide to trade thickness vs optical quality.
- Coatings stack from **UC → HC → HMC → SHMC**, plus functional coats (blue-cut, photochromic, tint).

Sources consulted while writing this reference include standard optical training material on bifocal segments (Kryptok vs flat-top) and Indian wholesale lens catalogs (index / HC–HMC–SHMC / blue-cut / photochromic lines). Prefer **this repo’s docs + live audit** when behaviour conflicts with generic web articles.
