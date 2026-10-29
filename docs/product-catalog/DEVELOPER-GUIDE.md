# Product catalog — Developer guide

**Companion:** [CLIENT-PLAN.md](./CLIENT-PLAN.md) (product contract — do not contradict without updating both)  
**Hierarchy:** [ATTRIBUTE-TABLES-AND-HIERARCHY.md](../product-catalog-hierarchy/ATTRIBUTE-TABLES-AND-HIERARCHY.md)  
**Repos:** `Drishx-admin-and-backend` (admin + API). Shop/mobile cutover is out of this slice.  
**Status:** Phases **A–C shipped**. Phase D items below are optional follow-ons.

---

## 0. How to use this doc

1. Read **CLIENT-PLAN.md** for agreed Admin behaviour.  
2. Phases **A→C** are implemented; use §1 code map when extending.  
3. **Do not** drop `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` / existing `CatalogProductLine`.  
4. Follow `drishx-api-auth-audit` for routes/audit; `drishx-client-api` for admin hooks; `drishx-prisma` for schema.  
5. Matrix cells are **frontend-only** in this slice — no bulk leaf insert, no stock PATCH from the grid.  
6. **`skuCode` is always built by** `buildLensProductSkuCode` — never accept free-text SKU from Admin on create.

---

## 1. Current code map (start here)

| Area | Path |
|------|------|
| Attributes UI | `app/(admin)/inventory/attributes/page.tsx` |
| Products list / grid | `app/(admin)/inventory/products-catalog/page.tsx` |
| Create product | `app/(admin)/inventory/products-catalog/new/page.tsx` |
| Product detail + matrix | `app/(admin)/inventory/products-catalog/[id]/page.tsx` |
| Admin client wrappers | `app/lib/admin-lens-catalog.ts` |
| SKU builder | `app/lib/catalog/lens-product-sku.ts` |
| Product / attribute services | `app/lib/catalog/lens-product-service.ts`, `lens-attribute-service.ts` |
| Attribute APIs | `app/api/admin/catalog/attributes/` |
| Product APIs | `app/api/admin/catalog/lens-products/` |
| Seed | `prisma/seed-lens-catalog-attributes.ts` (`npm run db:seed-lens-attributes` if scripted) |
| Migration | `prisma/migrations/20261028150000_lens_product_catalog_attributes/` |
| Nav | `components/admin-sidebar.tsx` (Attributes + Products & catalog) |
| Older leaf-generation stack (separate) | `CatalogProduct` / `CatalogRange`, `app/lib/admin-catalog.ts`, `/api/admin/catalog/products` |
| Wholesale cards (separate) | `CatalogProductLine`, `catalog-product-lines.ts` |
| Legacy power leaves | `SingleVisionLens`, `KryptokLens`, `ProgressiveLens` |
| Stock notes (later) | `docs/stock-management-notes.md` |
| RW tracking | `docs/remaining-work.md` → RW-09 |

**Naming:** Catalog SKU master = **`LensProduct`**. Do not confuse with `CatalogProductLine` (wholesale cards) or older `CatalogProduct` (range → leaf generation).

---

## 2. Architecture (as built)

```
Attribute masters (separate tables, one Attributes admin UI)
  LensFamily | LensBase | LensMaterial | LensIndex | LensCoating | LensColor
  + LensBaseMaterialLink (cascade)
        │
        ▼
LensProduct (catalog SKU)
  FKs → attributes
  + name
  + skuCode = buildLensProductSkuCode(attrs + range)   ← auto
  + power range (sphMin/Max, cylMin/Max, rangeType, …)
  + optional defaultPrice, isActive, KT/V2 extras
        │
        ▼
Admin UI
  List / Grid  →  Detail matrix (SPH×CYL @ 0.25, cells "_ / _ / _")
```

**Not in this slice**

```
ExactPower / stock leaf rows
  quantity, threshold, target
  ← later inventory / procurement (see stock-management-notes.md)
```

---

## 3. Schema (shipped)

Models in `prisma/schema.prisma` under “Product catalog attribute masters + LensProduct”.

### 3.1 Attribute masters

Shared shape: `id`, `code` (unique), `name`, `isActive`, `sortOrder`, timestamps.  
`LensIndex` also has optional numeric `value`.

### 3.2 Compatibility

`LensBaseMaterialLink` — unique `(baseId, materialId)`. Seeded from hierarchy (HC / ARC / BRC → allowed materials).

### 3.3 `LensProduct`

Fields match CLIENT-PLAN: attribute FKs, range, optional ADD/AXIS/EYE, `defaultPrice`, `isActive`, unique `skuCode`.

**Uniqueness:** `skuCode` unique. Create also rejects another product with the same attributes + range (would produce the same SKU).  
**Do not** create child power rows on save.

### 3.4 Seed

`prisma/seed-lens-catalog-attributes.ts` — families, bases, materials, indexes, coatings, colors, base↔material links.

---

## 4. Auto SKU (locked)

**Source of truth:** `app/lib/catalog/lens-product-sku.ts` → `buildLensProductSkuCode`.

**Format:**

```
FAMILY-BASE-MATERIAL[-INDEX][-COATING][-COLOR]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}[-CROSS]
```

| Rule | Detail |
|------|--------|
| Codes | Uppercase; `.` → `P` (e.g. `1.56` → `1P56`); strip non-alphanumeric |
| Powers | Negatives → `M` prefix (e.g. `-6` → `M6`); decimals use `P` |
| Bounds | Min/max normalized before encode |
| Cross | Append `-CROSS` when `rangeType === CROSS` |
| Create | Server builds SKU; Admin create body must **not** rely on typed `skuCode` |
| UI | Preview chip on create form from the same helper |

Example: `SV-HC-PLAIN-1P56-S0T10-C0T4`

---

## 5. APIs (as built)

All ADMIN session.

### 5.1 Attributes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/catalog/attributes/:type` | List; `?activeOnly=true` |
| POST | `/api/admin/catalog/attributes/:type` | Create |
| PATCH | `/api/admin/catalog/attributes/:type/:id` | Update |
| GET | `/api/admin/catalog/attributes/compatibility` | Base → materials |

`:type` = `family` \| `base` \| `material` \| `index` \| `coating` \| `color`

### 5.2 Products (`LensProduct`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/catalog/lens-products` | Paginated list; filters q, familyId, baseId, materialId, isActive |
| GET | `/api/admin/catalog/lens-products/:id` | Detail + joins |
| POST | `/api/admin/catalog/lens-products` | Create — **SKU generated server-side** |
| PATCH | `/api/admin/catalog/lens-products/:id` | Update metadata / range / active |

**Create body (no skuCode required):**

```json
{
  "name": "Hard Coat Single Vision +",
  "familyId": "...",
  "baseId": "...",
  "materialId": "...",
  "indexId": "...",
  "coatingId": null,
  "colorId": null,
  "rangeType": "NORMAL",
  "sphMin": 0,
  "sphMax": 10,
  "cylMin": 0,
  "cylMax": 4,
  "defaultPrice": null
}
```

Validation: active FKs, base↔material allowed, coherent range, unique resulting SKU / duplicate attr+range.

**Note:** Older `/api/admin/catalog/products` (+ ranges) serves the separate `CatalogProduct` leaf-generation path — do not mix with `LensProduct` UI.

### 5.3 Client wrappers

`app/lib/admin-lens-catalog.ts` — `fetchLensAttributes`, `fetchLensProducts`, `createLensProductRequest`, `steppedPowerRange`, etc.

---

## 6. Admin UI (as built)

| Page | Route | Notes |
|------|-------|--------|
| Attributes | `/inventory/attributes` | Tabs; add/edit modal; active toggle |
| Catalog | `/inventory/products-catalog` | List \| grid; filters; Create |
| New | `/inventory/products-catalog/new` | Cascade selects; SKU preview; KT/V2 optional fields |
| Detail | `/inventory/products-catalog/[id]` | Header + frontend SPH×CYL matrix `_ / _ / _` |

Matrix uses `steppedPowerRange` (0.25) on the client — no per-cell API.

---

## 7. Phases

### Phase A — Attribute masters + Attributes UI — **done**

### Phase B — Product create + list/grid — **done** (auto SKU)

### Phase C — Product detail matrix UI — **done**

### Phase D — Optional hardening (follow-on)

Clarify terms so docs stay clear:

| Item | Meaning | Status |
|------|---------|--------|
| **Audit log** | Record who created/updated attributes/products (activity / audit helpers) | Partially present on product create/update via service activity messages — expand if product wants full audit trail |
| **Overlap / duplicate range** | Reject two products with same attributes whose power ranges collide (or same SKU) | Same attrs+range already blocked via duplicate SKU; **broader partial-range overlap** (e.g. −6…0 vs −4…+2) not required yet |
| Empty states / validation copy | UX polish | Ongoing |
| KT/V2 matrix axes | Beyond SPH×CYL | Later; form fields exist |

---

## 8. Explicit non-goals

| Item | Why |
|------|-----|
| Free-text Admin SKU on create | Locked to auto format |
| Bulk insert of every SPH×CYL leaf at qty 0 | Inventory later |
| Live stock on matrix | See `stock-management-notes.md` |
| Delete legacy lens tables | Orders/cart depend on them |
| Replace wholesale `CatalogProductLine` | Different concept |
| Customer-facing fetch from `LensProduct` | Follow-on cutover |

---

## 9. Testing checklist

- [x] Attribute create / rename / deactivate  
- [x] Create product rejects inactive FK and illegal base↔material  
- [x] Create product builds unique auto `skuCode`; duplicate attrs+range rejected  
- [x] List pagination + filters; grid toggle  
- [x] Detail matrix row/col counts from range @ 0.25  
- [ ] Broader partial range-overlap engine (optional Phase D)  
- [x] Legacy `/api/lenses*` and existing orders unaffected  

Unit/integration coverage lives under `app/lib/catalog/*.test.ts` and smoke scripts under `scripts/lens-catalog-*.mjs`.

---

## 10. Open engineering decisions

1. Broader **partial** range overlap policy (same attrs, intersecting SPH×CYL) — if/when client asks.  
2. Whether PATCH that changes attrs/range should **rebuild** `skuCode` automatically (recommend yes; confirm before shipping).  
3. When to introduce exact-power stock table (separate RW; stock-management-notes).  
4. Long-term: retire or bridge older `CatalogProduct` / range→leaf path vs `LensProduct` master.
