# Product catalog — Developer guide

**Companion:** [CLIENT-PLAN.md](./CLIENT-PLAN.md) (product contract — do not contradict without updating both)  
**Hierarchy:** [ATTRIBUTE-TABLES-AND-HIERARCHY.md](../product-catalog-hierarchy/ATTRIBUTE-TABLES-AND-HIERARCHY.md)  
**Repos:** `drishx-admin-backend` (admin + API). Shop/mobile cutover is out of this slice.  
**Status:** Phases **A–C** + **RC-03** + **RC-04** shipped (parent `LensProduct` + `LensProductVariant`; power-range masters; optional material; new SKU/name builders; flat + grouped list).

---

## 0. How to use this doc

1. Read **CLIENT-PLAN.md** for agreed Admin behaviour.  
2. Use §1 code map when extending.  
3. **Do not** drop `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` / existing `CatalogProductLine`.  
4. Follow `drishx-api-auth-audit` for routes/audit; `drishx-client-api` for admin hooks; `drishx-prisma` for schema.  
5. Matrix cells are **frontend-only** in this slice — no bulk leaf insert, no stock PATCH from the grid.  
6. **`skuCode` / `name` are always built by helpers** — never accept free-text SKU or name from Admin on create.

---

## 1. Current code map (start here)

| Area | Path |
|------|------|
| Attributes UI | `app/(admin)/inventory/attributes/page.tsx` |
| Products list (flat / grouped) | `app/(admin)/inventory/products-catalog/page.tsx` |
| Create parent + variants | `app/(admin)/inventory/products-catalog/new/page.tsx` |
| Parent detail + add ranges | `app/(admin)/inventory/products-catalog/[id]/page.tsx` |
| Variant detail + matrix | `app/(admin)/inventory/products-catalog/variants/[id]/page.tsx` |
| Reusable catalog UI | `components/catalog/` (`SkuChip`, `CatalogSelectField`, `PowerRangeMultiSelect`, `VariantPreviewTable`) |
| Admin client wrappers | `app/lib/admin-lens-catalog.ts` |
| SKU / name builders | `app/lib/catalog/lens-product-sku.ts` |
| Product / attribute services | `app/lib/catalog/lens-product-service.ts`, `lens-attribute-service.ts`, `lens-power-range-service.ts` |
| Attribute APIs | `app/api/admin/catalog/attributes/` |
| Power-range APIs | `app/api/admin/catalog/power-ranges/` |
| Product APIs | `app/api/admin/catalog/lens-products/` (+ `variants/[id]`) |
| Seed | `prisma/seed-lens-catalog-attributes.ts` |
| Migrations | `…_lens_product_catalog_attributes/`, `…_lens_power_ranges/`, `20261103160000_lens_product_parent_variants/` |
| Nav | `components/admin-sidebar.tsx` (Attributes + Products & catalog) |
| Older leaf-generation stack (separate) | `CatalogProduct` / `CatalogRange`, `app/lib/admin-catalog.ts`, `/api/admin/catalog/products` |
| Wholesale cards (separate) | `CatalogProductLine`, `catalog-product-lines.ts` |
| Legacy power leaves | `SingleVisionLens`, `KryptokLens`, `ProgressiveLens` |
| Stock notes (later) | `docs/stock-management/` |
| RW tracking | `docs/remaining-work.md` → RW-09 |

**Naming:** Catalog parent = **`LensProduct`**. Sellable SKU row = **`LensProductVariant`**. Do not confuse with `CatalogProductLine` or older `CatalogProduct`.

---

## 2. Architecture

```
Attribute masters
  LensFamily (supportsAxis / supportsAdd / supportsEye / supportsProgressiveType)
  | LensBase | LensMaterial? | LensIndex | LensColor | LensDiameter?
  | LensProgressiveType (V2) | LensAxis | LensAddition
  + LensCoating (not identity)
  + LensBaseMaterialLink
  + LensPowerRange (sph/cyl bounds)
        │
        ▼
LensProduct (parent)
  material? · base · index · family · color · diameter? · progressiveType? (V2→Normal)
  unique on that combo; internal baseCode includes progressive type when set
        │ 1 → many
        ▼
LensProductVariant
  powerRangeId × optional axisId × optional additionId × optional eye
  (CYL=0 ranges skip axes; V2 auto LEFT+RIGHT)
  skuCode = [MATERIAL-]BASE-INDEX-FAMILY[-COLOR][-ADD…][-D…][-LEFT|RIGHT]-S…-C…[-A90]
  name    = [Material] [Index] [Family] [Base] [Color] +4.00/+2.00 [90]
  purchasePrice · sellingPrice (default 0), isActive
        │
        ▼
Admin UI — flat + grouped list; parent detail + add ranges/axes/ADDs; variant matrix
```

**Not in this slice:** ExactPower / stock leaf rows (see stock-management).

---

## 3. Schema

Models in `prisma/schema.prisma` under product catalog attributes + LensProduct.

### 3.1 Attribute masters

Shared shape: `id`, `code` (unique), `name`, `isActive`, `sortOrder`, timestamps.  
`LensIndex` also has optional numeric `value`.  
`LensPowerRange`: unique `(sphMin, sphMax, cylMin, cylMax)`; human label derived.

### 3.2 Compatibility

`LensBaseMaterialLink` — unique `(baseId, materialId)`. Seeded from hierarchy.

### 3.3 `LensProduct` (parent)

Identity attrs only: `familyId`, `baseId`, optional `materialId`, `indexId`, `colorId`.  
Internal `baseCode` (unique). No power bounds, no `skuCode`/`name` on parent.

**Uniqueness:** parent attrs combo unique. Creating with an existing combo **adds variants** to that parent (or rejects duplicate range).

### 3.4 `LensProductVariant`

`productId`, `powerRangeId`, optional `axisId` / `additionId` / `eye`, denormalized sph/cyl/axis, unique `skuCode` / `name`, `purchasePrice` / `sellingPrice` (Decimal, default `0`, never null), `isActive`.  
Unique `(productId, powerRangeId, axisId, additionId, eye)` with `NULLS NOT DISTINCT`.  
Unique `(productId, powerRangeId)`.

### 3.5 Seed

`prisma/seed-lens-catalog-attributes.ts` — families, bases, materials, indexes, coatings, colors, base↔material links, power ranges as needed.

---

## 4. Auto SKU / name

**Source:** `app/lib/catalog/lens-product-sku.ts`

**SKU** (`buildLensProductSkuCode`):

```
[MATERIAL-]BASE-INDEX-FAMILY[-COLOR]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}
```

**Name** (`buildLensProductName`):

```
[Material] [Index] [Family] [Base] [Color] -6.00/+2.00
```

| Rule | Detail |
|------|--------|
| Codes | Uppercase; `.` → `P`; strip non-alphanumeric |
| Powers in SKU | `M` for negative; `P` for decimal; from power-range bounds |
| Powers in name | Human SPH label `-6.00/+2.00` |
| Coating | Not in SKU or name |
| Material | Optional; omit segment when absent |
| Create | Server builds both; no typed `skuCode` or `name` |
| Uniqueness | Parent attrs unique; variant `(productId, powerRangeId, axisId, additionId, eye)` + unique sku/name |

Example: `PLAIN-HC-1P56-SV-CLEAR-S0T2-C0T1`

---

## 5. APIs

All ADMIN session.

### 5.1 Attributes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/catalog/attributes/:type` | List; `?activeOnly=true` |
| POST | `/api/admin/catalog/attributes/:type` | Create |
| PATCH | `/api/admin/catalog/attributes/:type/:id` | Update |
| GET | `/api/admin/catalog/attributes/compatibility` | Base → materials |

`:type` = `family` \| `base` \| `material` \| `index` \| `coating` \| `color`

### 5.2 Power ranges

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/admin/catalog/power-ranges` | List / create |
| PATCH | `/api/admin/catalog/power-ranges/:id` | Update / deactivate |

### 5.3 Products (parent + variants)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/catalog/lens-products` | `?view=flat\|grouped`; filters q, familyId, baseId, materialId, isActive |
| GET | `/api/admin/catalog/lens-products/:id` | Parent detail + variants |
| POST | `/api/admin/catalog/lens-products` | Create parent (or attach) + variants |
| POST | `/api/admin/catalog/lens-products/preview` | Preview baseCode + variant SKUs/names |
| PATCH | `/api/admin/catalog/lens-products/:id` | Add more `powerRangeIds` / toggle parent active |
| GET/PATCH | `/api/admin/catalog/lens-products/variants/:id` | Variant detail / update price·active |

**Create body:**

```json
{
  "familyId": "...",
  "baseId": "...",
  "materialId": null,
  "indexId": "...",
  "colorId": "...",
  "powerRangeIds": ["...", "..."],
  "purchasePrice": 300,
  "sellingPrice": 450
}
```

Validation: active FKs, base↔material when material set, ≥1 power range, unique resulting SKUs / no duplicate parent+range.

**Note:** Older `/api/admin/catalog/products` serves the separate `CatalogProduct` leaf-generation path — do not mix with `LensProduct` UI.

### 5.4 Client wrappers

`app/lib/admin-lens-catalog.ts` — `fetchLensAttributes`, `fetchLensProducts`, `createLensProductRequest`, `previewLensProductRequest`, `addLensProductVariantsRequest`, `steppedPowerRange`, etc.

---

## 6. Admin UI

| Page | Route | Notes |
|------|-------|--------|
| Attributes | `/inventory/attributes` | Tabs; add/edit; active toggle |
| Catalog | `/inventory/products-catalog` | Flat variants \| grouped parents with expand → variants; filters |
| New | `/inventory/products-catalog/new` | Attrs + multi power ranges; live preview table |
| Parent | `/inventory/products-catalog/[id]` | Variants table; add more ranges |
| Variant | `/inventory/products-catalog/variants/[id]` | Header + SPH×CYL matrix |

Reusable pieces: `SkuChip`, `CatalogSelectField`, `PowerRangeMultiSelect`, `VariantPreviewTable`, plus shared `AdminTable` / `AdminSelect`.

Matrix uses `steppedPowerRange` (0.25) on the client — no per-cell API.

---

## 7. Phases

### Phase A — Attribute masters + Attributes UI — **done**

### Phase B — Product create + list — **done** (superseded by RC-04 parent/variants)

### Phase C — Variant detail matrix UI — **done**

### RC-03 — Power-range masters + optional material — **done**

### RC-04 — Parent + variants + new SKU/name + flat/grouped — **done**

### Follow-on hardening

| Item | Status |
|------|--------|
| Audit trail depth | Partial via activity messages |
| Broader partial-range overlap (same attrs, intersecting SPH×CYL) | Not required yet |
| Empty states / validation copy | Ongoing |

---

## 8. Explicit non-goals

| Item | Why |
|------|-----|
| Free-text Admin SKU on create | Locked to auto format |
| Bulk insert of every SPH×CYL leaf at qty 0 | Inventory later |
| Live stock on matrix | See stock-management |
| Delete legacy lens tables | Orders/cart depend on them |
| Replace wholesale `CatalogProductLine` | Different concept |
| Customer-facing fetch from `LensProduct` | Follow-on cutover |

---

## 9. Testing checklist

- [x] Attribute create / rename / deactivate  
- [x] Create rejects inactive FK and illegal base↔material  
- [x] Create builds unique auto `skuCode` / `name`; duplicate parent+range → `DUPLICATE_VARIANT`  
- [x] Second range on same attrs attaches to existing parent  
- [x] Material optional; omitted from SKU when absent  
- [x] List flat + grouped; pagination + filters  
- [x] Variant matrix row/col counts from range @ 0.25  
- [ ] Broader partial range-overlap engine (optional)  
- [x] Legacy `/api/lenses*` and existing orders unaffected  

Unit: `app/lib/catalog/lens-product-sku.test.ts`  
Integration (opt-in): `app/lib/catalog/lens-catalog.integration.test.ts`  
Smoke: `scripts/lens-catalog-e2e-smoke.mjs`, `scripts/lens-catalog-present-prep.mjs`

---

## 10. Open engineering decisions

1. Broader **partial** range overlap policy — if/when client asks.  
2. When to introduce exact-power stock table on **variant** (stock-management).  
3. Long-term: retire or bridge older `CatalogProduct` / range→leaf path vs `LensProduct` master.
