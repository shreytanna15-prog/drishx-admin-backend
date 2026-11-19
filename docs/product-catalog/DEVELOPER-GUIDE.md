# Product catalog — Developer guide

**Companion:** [CLIENT-PLAN.md](./CLIENT-PLAN.md) (product contract — do not contradict without updating both)  
**Hierarchy:** [ATTRIBUTE-TABLES-AND-HIERARCHY.md](../product-catalog-hierarchy/ATTRIBUTE-TABLES-AND-HIERARCHY.md)  
**Repos:** `drishx-admin-backend` (admin + API). Shop/mobile cutover is out of this slice.  
**Status:** Phases **A–C** + **RC-03** + **RC-04** shipped (parent `LensProduct` + `LensProductVariant`; power-range masters; optional parent attrs including coating; new SKU/name builders; Flat list). Remaining UI/handoff work in **§11**.

---

## 0. How to use this doc

1. Read **CLIENT-PLAN.md** for agreed Admin behaviour.  
2. Use §1 code map when extending.  
3. **Do not** drop `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` / existing `CatalogProductLine`.  
4. Follow `drishx-api-auth-audit` for routes/audit; `drishx-client-api` for admin hooks; `drishx-prisma` for schema.  
5. Matrix cells are **frontend-only** in this slice — no bulk leaf insert, no stock PATCH from the grid.  
6. **`skuCode` / `name` are always built by helpers** — never accept free-text SKU or name from Admin on create.  
7. **Coating is optional** on the parent (same class as Material / Index / Color). Include it in uniqueness, SKU, and name when set. Do **not** require coating on create.

---

## 1. Current code map (start here)

| Area | Path |
|------|------|
| Attributes UI | `app/(admin)/inventory/attributes/page.tsx` (+ `power-range-tab.tsx`) |
| Products list (Flat / Grouped today) | `app/(admin)/inventory/products-catalog/page.tsx` |
| Create parent + variants | `app/(admin)/inventory/products-catalog/new/page.tsx` |
| Parent detail + matrix + add ranges | `app/(admin)/inventory/products-catalog/[id]/page.tsx` |
| Variant detail | `app/(admin)/inventory/products-catalog/variants/[id]/page.tsx` |
| Reusable catalog UI | `components/catalog/` (`SkuChip`, `CatalogSelectField`, `PowerRangeMultiSelect`, `AxisMultiSelect`, `AdditionMultiSelect`, `VariantPreviewTable`, `CatalogMatrixPanel`) |
| Family matrix composer | `app/lib/catalog/catalog-matrix.ts` (+ `catalog-matrix.test.ts`) |
| Admin client wrappers | `app/lib/admin-lens-catalog.ts` |
| SKU / name builders | `app/lib/catalog/lens-product-sku.ts` (+ tests) |
| Product / attribute services | `app/lib/catalog/lens-product-service.ts`, `lens-attribute-service.ts`, `lens-power-range-service.ts` |
| Attribute APIs | `app/api/admin/catalog/attributes/` |
| Power-range APIs | `app/api/admin/catalog/power-ranges/` |
| Product APIs | `app/api/admin/catalog/lens-products/` (+ `variants/[id]`) |
| Seed | `prisma/seed-lens-catalog-attributes.ts` |
| Migrations | `…_lens_product_catalog_attributes/`, `…_lens_power_ranges/`, `20261103160000_lens_product_parent_variants/`, `…_coating_identity/`, progressive / axis / eye migrations |
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
  LensBase | LensMaterial? | LensIndex? | LensCoating? | LensColor?
  LensDiameter? | LensProgressiveType? (V2)
  LensAxis | LensAddition
  + LensBaseMaterialLink
  + LensPowerRange (sph/cyl bounds)
        │
        ▼
LensProduct (parent)
  family + base (required)
  material? · index? · coating? · color? · diameter? · progressiveType?
  unique on that combo (NULLS NOT DISTINCT); internal baseCode
        │ 1 → many
        ▼
LensProductVariant
  powerRangeId × optional axisId × optional additionId × optional eye
  (CYL=0 ranges skip axes; V2 auto LEFT+RIGHT)
  skuCode = [MATERIAL-]BASE[-INDEX]-FAMILY[-COATING][-PROGTYPE][-COLOR]
            [-ADD…][-D…][-LEFT|RIGHT]-S…-C…[-A{axis}]
  name    = [Material] [Index] [Family] [Base] [Coating] [Color] {power} [axis]
  purchasePrice · sellingPrice (default 0), isActive
        │
        ▼
Admin UI — Flat (+ Grid TBD); parent detail + add ranges; variant matrix
```

**Not in this slice:** ExactPower / stock leaf rows (see stock-management).

---

## 3. Schema

Models in `prisma/schema.prisma` under product catalog attributes + LensProduct.

### 3.1 Attribute masters

Shared shape: `id`, `code` (unique), `name`, `isActive`, `sortOrder`, timestamps.  
`LensIndex` also has optional numeric `value`.  
`LensAxis` / `LensAddition` / `LensDiameter` also store numeric `value` (unique).  
`LensPowerRange`: unique `(sphMin, sphMax, cylMin, cylMax)`; human label derived in app code.

### 3.2 Compatibility

`LensBaseMaterialLink` — unique `(baseId, materialId)`. Seeded from hierarchy. Enforce when Material is set.

### 3.3 `LensProduct` (parent)

Identity attrs: `familyId`, `baseId`, optional `materialId`, `indexId`, `coatingId`, `colorId`, `diameterId`, `progressiveTypeId`.  
**Only Family + Base required** on create. Coating is optional (nullable column; legacy nulls allowed).  
Internal `baseCode` (unique). No power bounds, no `skuCode`/`name` on parent.

**Uniqueness:** SQL unique index `LensProduct_attrs_unique` on  
`(familyId, baseId, materialId, indexId, colorId, diameterId, progressiveTypeId, coatingId)` with **`NULLS NOT DISTINCT`**.  
Declared in migrations (not always as Prisma `@@unique` — do not drop the SQL index).

Creating with an existing combo **reuses** the parent and adds missing variants.

### 3.4 `LensProductVariant`

`productId`, `powerRangeId`, optional `axisId` / `additionId` / `eye`, denormalized sph/cyl/axis/add bounds, unique `skuCode`, display-only `name` (may repeat), `purchasePrice` / `sellingPrice` (Decimal, default `0`, never null), `isActive`.  
Unique `(productId, powerRangeId, axisId, additionId, eye)` with `NULLS NOT DISTINCT` (SQL migration).

### 3.5 Seed

`prisma/seed-lens-catalog-attributes.ts` — families, bases, materials, indexes, coatings, colors, diameters, progressive types, axes, additions, base↔material links, power ranges as needed.

---

## 4. Auto SKU / name

**Source:** `app/lib/catalog/lens-product-sku.ts`

**SKU** (`buildLensProductSkuCode`):

```
[MATERIAL-]BASE[-INDEX]-FAMILY[-COATING][-PROGTYPE][-COLOR][-ADD…][-D…][-LEFT|RIGHT]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}[-A{axis}]
```

**Name** (`buildLensProductName`):

```
[Material] [Index] [Family] [Base] [Coating] [Color] {power} [axis]
```

| Rule | Detail |
|------|--------|
| Codes | Uppercase; `.` → `P`; strip non-alphanumeric |
| Powers in SKU | `M` for negative; `P` for decimal; from power-range bounds |
| Powers in name | Compact extremes via `buildPowerNameToken`; append `(spanSPH / spanCYL)` when non-extreme ≠ 0 |
| Axis in name | Append integer degrees when set |
| Coating | Optional; in SKU (code) + name (label) when set |
| Progressive type | In SKU / parent `baseCode` when set; **never** in name |
| Not in name | ADD, eye, diameter, progressive type |
| Name tokens | Material / Index / Family / Base = **codes**; Coating / Color = **labels** |
| Create | Server builds both; no typed `skuCode` or `name` |
| Flat labels | `buildLensProductFlatGroupName` / `buildLensProductFlatLeafName` — keep Flat/Grid grouping consistent with name order |

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

`:type` = `family` \| `base` \| `material` \| `index` \| `coating` \| `color` \| `axis` \| `addition` \| `diameter` \| `progressive-type`

### 5.2 Power ranges

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/admin/catalog/power-ranges` | List / create |
| PATCH | `/api/admin/catalog/power-ranges/:id` | Update / deactivate |

Bounds edit rejected when range is used by any variant.

### 5.3 Products (parent + variants)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/catalog/lens-products` | `?view=flat\|grouped`; filters `q`, `familyId`, `baseId`, `materialId`, `coatingId`, `isActive` (+ `powerRangeId` on flat) |
| GET | `/api/admin/catalog/lens-products/:id` | Parent detail + variants |
| POST | `/api/admin/catalog/lens-products` | Create parent (or reuse) + variants. Body `preview: true` → preview only (no separate `/preview` route) |
| POST | `/api/admin/catalog/lens-products/:id` | Add more ranges / axes / ADDs (not PATCH) |
| GET/PATCH | `/api/admin/catalog/lens-products/variants/:id` | Variant detail / update price·active |

**Create body (shape):**

```json
{
  "familyId": "...",
  "baseId": "...",
  "materialId": null,
  "indexId": null,
  "coatingId": null,
  "colorId": null,
  "diameterId": null,
  "progressiveTypeId": null,
  "powerRangeIds": ["...", "..."],
  "axisIds": ["..."],
  "additionIds": ["..."],
  "purchasePrice": 300,
  "sellingPrice": 450
}
```

Validation: Family + Base required; other parent FKs optional but must be active when set; base↔material when material set; ≥1 power range; progressive type only if family supports it; axis/ADD only if family supports; CYL=0 forces null axis; V2 expands eyes. Existing `(range, axis, ADD, eye)` children skipped. Parent create + variant inserts + audit in one transaction; empty new parent cleaned up on child failure. SKU collisions with another product remain errors.

**Note:** Older `/api/admin/catalog/products` serves the separate `CatalogProduct` leaf-generation path — do not mix with `LensProduct` UI.

### 5.4 Client wrappers

`app/lib/admin-lens-catalog.ts` — `fetchLensAttributes`, `fetchLensProducts`, `createLensProductRequest`, `previewLensProductRequest` (`preview: true`), `addLensProductVariantsRequest` (**POST** `:id`), variant PATCH, power-range helpers, etc.

---

## 6. Admin UI

| Page | Route | Notes |
|------|-------|--------|
| Attributes | `/inventory/attributes` | Tabs for all masters + Power range |
| Catalog | `/inventory/products-catalog` | **Flat** shipped; **Grid** cards = remaining (§11) |
| New | `/inventory/products-catalog/new` | Parent attrs (Family/Base required); multi ranges; live preview |
| Parent | `/inventory/products-catalog/[id]` | Family matrix; variants table; add ranges — **show Coating** (§11) |
| Variant | `/inventory/products-catalog/variants/[id]` | Variant card + parent attrs + matrix + siblings — **show Coating** (§11) |

Reusable pieces: `SkuChip`, fields in `catalog-field.tsx`, `VariantPreviewTable`, `CatalogMatrixPanel`, plus shared `AdminTable` / `AdminSelect` / `AdminPage`.

### 6.1 UI styles / patterns (follow existing catalog screens)

Match current inventory catalog look — do not invent a new visual system.

| Pattern | How it looks today |
|---------|-------------------|
| Page shell | `AdminPage` title + subtitle |
| Surfaces | `rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5` cards |
| Labels | `text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)` |
| Inputs / selects | `h-10 rounded-xl` with brand input CSS vars; prefer `AdminSelect` / catalog field helpers |
| Tables | `AdminTable` + shadcn `Table*` |
| Badges | Active / Inactive via `Badge` |
| Errors | Red border banner (`border-red-300 bg-red-50 …`) |
| Buttons | Existing `Button` variants; primary create CTAs already on catalog pages |
| Matrix | `CatalogMatrixPanel` — stacked sheets, frozen stubs, `"_ / _ / _"` placeholders, no tabs |
| SKU display | `SkuChip` for compact codes |

**Flat view (shipped):** expandable rows — top-level group (flat group name + power bounds) → axis subgroup → variant SKU rows. Filters: search, family, base, material, coating, active.

**Grid view (target — §11):** same data hierarchy and filters as Flat; **card = Flat top-level group**. Card face: attr chips + power label + variant count + status. Expand/open → same axis → SKU layers. Reuse Flat grouping helpers (`buildLensProductFlatGroupName` / leaf helpers) so Flat and Grid never diverge.

**Grouped toggle today:** parent-table expand exists in `page.tsx`. Product contract is Flat + **Grid**. Prefer replacing/repurposing the second toggle into Grid cards rather than keeping three modes.

### 6.2 Matrix

`buildCatalogMatrix` in `catalog-matrix.ts` (0.25 steps, family sheets) — no per-cell API. Each sheet: `stubColumns`, `dataAxis`, `dataColumns`. Panel stacks sheets Excel-like; freezes stubs; axis blocks largest-first; 135°/45° share oblique sheet with exact axis keys. Pass `familyLabel` for sheet titles.

---

## 7. Phases

### Phase A — Attribute masters + Attributes UI — **done**

### Phase B — Product create + list — **done** (parent/variants)

### Phase C — Matrix UI — **done** (parent family-aware sheets)

### RC-03 — Power-range masters + optional material — **done**

### RC-04 — Parent + variants + new SKU/name + Flat list — **done**

### Follow-on (this handoff)

| Item | Status |
|------|--------|
| Coating optional on parent (SKU/name/uniqueness when set) | **Done** in create/service/SKU builders |
| Flat nested catalog view | **Done** |
| Grid card view (Flat hierarchy) | **Remaining** — §11 |
| Coating on parent/variant attribute summaries | **Remaining** — §11 |
| Attribute lock after stock/orders | **Documented**; implement when parent-attr edit exists — §11 |
| Audit trail depth | Partial via activity messages |
| Broader partial-range overlap | Not required yet |

---

## 8. Explicit non-goals

| Item | Why |
|------|-----|
| Free-text Admin SKU on create | Locked to auto format |
| Require coating on create | Optional parent attr (same as Material/Index/Color) |
| Bulk insert of every SPH×CYL leaf at qty 0 | Inventory later |
| Live stock on matrix | See stock-management |
| Delete legacy lens tables | Orders/cart depend on them |
| Replace wholesale `CatalogProductLine` | Different concept |
| Customer-facing fetch from `LensProduct` | Follow-on cutover |

---

## 9. Testing checklist

- [x] Attribute create / rename / deactivate  
- [x] Create rejects inactive FK and illegal base↔material  
- [x] Create builds unique auto `skuCode` + display `name`; duplicate child combos skipped  
- [x] Second range on same attrs attaches to existing parent  
- [x] Material / coating / index / color / diameter optional; omitted from SKU/name segments when absent  
- [x] Progressive type optional (V2); in SKU not name  
- [x] Flat list nested groups + filters (incl. coating)  
- [x] Parent family matrix @ 0.25  
- [ ] Grid card view parity with Flat grouping  
- [ ] Coating visible on parent + variant detail attribute blocks  
- [x] Legacy `/api/lenses*` and existing orders unaffected  

Unit: `app/lib/catalog/lens-product-sku.test.ts`, `app/lib/catalog/catalog-matrix.test.ts`  
Integration (opt-in): `app/lib/catalog/lens-catalog.integration.test.ts`  
Smoke: `scripts/lens-catalog-e2e-smoke.mjs`, `scripts/lens-catalog-present-prep.mjs`

---

## 10. Open engineering decisions

1. Broader **partial** range overlap policy — if/when client asks.  
2. When to introduce exact-power stock leaf (`LensProductPower`) keyed by **`lensProductVariantId` + sph + cyl** (stock-management).  
3. Long-term: retire or bridge older `CatalogProduct` / range→leaf path vs `LensProduct` master.  
4. Whether to keep a third “Grouped parents” mode after Grid ships (default: no — Flat + Grid only).

---

## 11. Remaining code work (handoff checklist)

Docs are the contract. Implement these in code — **do not** change the locked SKU/name/parent rules without updating CLIENT-PLAN + this guide together.

### Must do (UI)

1. **Show Coating on detail summaries**  
   - `app/(admin)/inventory/products-catalog/[id]/page.tsx` — Attributes `<dl>`  
   - `app/(admin)/inventory/products-catalog/variants/[id]/page.tsx` — Product attributes `<dl>`  
   - Show coating name/code or `—` when null (same pattern as Color / Material).

2. **Grid catalog view**  
   - Target: `/inventory/products-catalog` second view = **Grid cards**.  
   - Reuse Flat’s top-level grouping (same keys / `buildLensProductFlatGroupName`).  
   - Card face: attrs + power label + variant count + status.  
   - Expand/open → axis subgroups → SKU rows (same as Flat).  
   - Same filters (q, family, base, material, coating, active).  
   - Follow §6.1 UI styles. Prefer replacing today’s “Grouped” toggle with Grid rather than three modes.

### Must do when adding parent-attr edit (not this sprint unless edit ships)

3. **Attribute lock after stock/orders**  
   - If parent attributes become editable, make them read-only once any sibling variant has stock or orders.  
   - Until edit exists, no UI change required — rule is locked in CLIENT-PLAN §6.7.

### Already aligned (do not “fix”)

- Coating optional on create (UI + `normalizeOptionalId` in service)  
- Coating in SKU / name builders when set  
- Parent uniqueness includes `coatingId` (`NULLS NOT DISTINCT`)  
- Preview via `POST /lens-products` + `preview: true`  
- Add ranges via `POST /lens-products/:id`  
- Flat nested list + coating filter  
- Family matrix stacked sheets  

### Out of scope for this handoff

- Live stock on matrix cells  
- Shop/mobile catalog cutover  
- Deleting legacy lens tables  
- Partial range-overlap engine  
