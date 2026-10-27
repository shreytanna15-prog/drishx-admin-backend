# Product catalog — Developer guide

**Companion:** [CLIENT-PLAN.md](./CLIENT-PLAN.md) (product contract — do not contradict without updating both)  
**Hierarchy:** [ATTRIBUTE-TABLES-AND-HIERARCHY.md](../product-catalog-hierarchy/ATTRIBUTE-TABLES-AND-HIERARCHY.md)  
**Repos:** `Drishx-admin-and-backend` (admin + API). Shop/mobile cutover is out of this slice.

---

## 0. How to use this doc

1. Read **CLIENT-PLAN.md** for agreed Admin behaviour.  
2. Implement **phases A→D** below.  
3. Add **new** attribute + product tables; **do not** drop `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` / existing `CatalogProductLine`.  
4. Follow `drishx-api-auth-audit` for routes/audit; `drishx-client-api` for admin hooks; `drishx-prisma` for schema.  
5. Matrix cells are **frontend-only** in this slice — no bulk leaf insert, no stock PATCH from the grid.  
6. Prefer DrishX admin chrome patterns (`AdminPage`, list skeletons, existing table/card styles).

---

## 1. Current code map (start here)

| Area | Path |
|------|------|
| Products & catalog UI | `app/(admin)/inventory/products-catalog/` |
| Create product (if present) | `app/(admin)/inventory/products-catalog/new/` |
| Existing catalog helpers (may predate this plan) | `app/lib/admin-catalog.ts`, `app/lib/admin-lenses.ts` |
| Wholesale cards (separate concept) | `CatalogProductLine`, `catalog-product-lines.ts` |
| Coating filter chips (shop) | `CoatingFilterLabel` |
| Legacy power leaves | `SingleVisionLens`, `KryptokLens`, `ProgressiveLens` |
| Stock overview | `app/(admin)/inventory/stock-overview/` |
| Nav | `app/lib/admin-nav-active.ts`, admin shell nav config |
| Domain / hierarchy | `docs/product-catalog-hierarchy/`, `docs/lens-domain-logic.md` |
| RW tracking | `docs/remaining-work.md` → RW-09 |

**Naming:** New product entity must **not** reuse `CatalogProductLine` (that is wholesale shop cards). Prefer names such as `LensProduct` / `ProductSku` (lock in migration).

---

## 2. Target architecture

```
Attribute masters (separate tables, one Attributes admin UI)
  LensFamily | LensBase | LensMaterial | LensIndex | LensCoating | LensColor
  (+ optional LensBaseMaterialAllowed for cascade)
        │
        ▼
LensProduct (catalog SKU)
  FKs → attributes
  + range, skuCode
  + range range fields (sphMin/Max, cylMin/Max, rangeType, …)
  + optional defaultPrice, isActive
        │
        ▼
Admin UI only (this slice)
  List / Grid  →  Detail matrix (SPH×CYL @ 0.25, cells "_ / _ / _")
```

**Not in this slice**

```
ExactPower / stock leaf rows
  quantity, threshold, target
  ← later inventory / procurement (lazy insert or other strategy TBD)
```

**Repos ownership**

| Concern | Backend | Admin | Web / Mobile |
|---------|---------|-------|--------------|
| Attribute CRUD | ✓ | ✓ | — |
| Product CRUD + list | ✓ | ✓ | — |
| Matrix preview UI | — | ✓ (client expand) | — |
| Live stock on cells | later | later | later |
| Shop catalog from new products | later | — | later |

---

## 3. Schema (Phase A)

Proposed Prisma models (names can be adjusted; keep semantics).

### 3.1 Attribute masters (pattern for each)

Shared shape:

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | PK |
| `code` | string | Stable short code (`HC`, `UC`, `1.56`) unique per table |
| `name` | string | Display name |
| `isActive` | boolean | Default true; inactive hidden from create selects |
| `sortOrder` | int | Optional |
| `createdAt` / `updatedAt` | datetime | |

Tables:

| Model | Purpose |
|-------|---------|
| `LensFamily` | SV, KT, V2 |
| `LensBase` | HC, BRC, ARC |
| `LensMaterial` | PLAIN, UC, TINTABLE, POLY, PG, PG_POLY |
| `LensIndex` | 1.49, 1.56, … (store decimal or string code) |
| `LensCoating` | Green, Mari-Blue, … |
| `LensColor` | Tint colours |

### 3.2 Compatibility (cascade)

```prisma
model LensBaseMaterialLink {
  id         String @id @default(cuid())
  baseId     String
  materialId String
  // @@unique([baseId, materialId])
}
```

Seed from hierarchy: HC → Plain, UC, Tintable, PG; BRC → …; ARC → ….

Create-product API must reject material not allowed for selected base.

### 3.3 Product (catalog SKU)

```prisma
model LensProduct {
  id           String   @id @default(cuid())
  skuCode      String   @unique
  name         String
  familyId     String
  baseId       String
  materialId   String
  indexId      String?
  coatingId    String?
  colorId      String?
  // Range (SV-first; extend for KT/V2)
  rangeType    String   @default("NORMAL") // NORMAL | CROSS
  sphMin       Decimal
  sphMax       Decimal
  cylMin       Decimal
  cylMax       Decimal
  // Optional KT/V2 range metadata (nullable until Phase C)
  addMin       Decimal?
  addMax       Decimal?
  axis         Int?
  eye          String?  // LEFT | RIGHT | BOTH — if needed
  defaultPrice Decimal?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Uniqueness (document chosen rule):**  
Prefer unique `(familyId, baseId, materialId, indexId, coatingId, colorId, rangeType, sphMin, sphMax, cylMin, cylMax, …)` **or** rely on unique `skuCode` + overlap check later. Overlap engine across same attribute combo is **Phase D / follow-on** if not needed for MVP create.

**Do not** create child power rows on save in this slice.

### 3.4 Seed

Seed standard families, bases, materials, indexes, and base↔material links so Create product works without empty dropdowns. Coatings/colors can start from a short seed + admin add.

---

## 4. APIs

All under admin auth + inventory/catalog permissions (match existing admin lens routes).

### 4.1 Attributes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/catalog/attributes/:type` | List (`family` \| `base` \| `material` \| `index` \| `coating` \| `color`); query `activeOnly` |
| POST | `/api/admin/catalog/attributes/:type` | Create |
| PATCH | `/api/admin/catalog/attributes/:type/:id` | Update name/code/sort/active |
| GET | `/api/admin/catalog/attributes/compatibility` | Base → allowed materials (or embed in base detail) |

### 4.2 Products

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/catalog/products` | Paginated list; filters: q, familyId, baseId, materialId, isActive |
| GET | `/api/admin/catalog/products/:id` | Detail + attribute joins + range |
| POST | `/api/admin/catalog/products` | Create (validate FKs active + compatibility + range min/max) |
| PATCH | `/api/admin/catalog/products/:id` | Update metadata / range / active |

**Create body (sketch)**

```json
{
  "skuCode": "HC-SV-PLUS-001",
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

Validation:

- All required FKs exist and `isActive`  
- Material allowed for base  
- `sphMin`/`sphMax`/`cylMin`/`cylMax` coherent (document sign convention: allow plus or minus bands as stored)  
- `skuCode` unique  

**No** `POST .../generate-powers` in this slice.

### 4.3 Client wrappers

- Pure functions in `app/lib/admin-catalog-attributes.ts` / extend `admin-catalog.ts`  
- Hooks: `useApiQuery` / `useApiMutation` per `drishx-client-api`  
- Register paths in `api-registry` if that pattern is used for the module  

---

## 5. Admin UI

### 5.1 Attributes page

| Item | Detail |
|------|--------|
| Route | `/inventory/attributes` (confirm nav) |
| Layout | Tabs = attribute types |
| Row actions | Edit; Switch active |
| Add | Dialog or inline form: code + name |
| Loading | Table skeleton |

### 5.2 Catalog list / grid

| Item | Detail |
|------|--------|
| Route | `/inventory/products-catalog` |
| Toggle | List \| Grid (local state or `?view=`) |
| List | Table columns per CLIENT-PLAN |
| Grid | Responsive cards: name, SKU, attribute line, range |
| Actions | Create → `/inventory/products-catalog/new`; row → detail |

### 5.3 Create product

| Item | Detail |
|------|--------|
| Route | `/inventory/products-catalog/new` |
| Selects | Fetch `activeOnly=true`; material options depend on selected `baseId` |
| Range inputs | Number fields; step 0.25 hints in UI copy |
| Submit | POST product → redirect to detail |

### 5.4 Product detail + matrix

| Item | Detail |
|------|--------|
| Route | `/inventory/products-catalog/[id]` |
| Header | Name, SKU, attribute summary, range text |
| Matrix | Client-only: build arrays `sphValues`, `cylValues` from min→max step **0.25** |
| Cell | Render `_ / _ / _` (three placeholders) |
| UX | Overflow scroll; sticky first column + header row |
| Family | SV: SPH×CYL as primary. KT/V2: same range fields if present; document simplified matrix or “range summary only” until follow-on |

**Helper (frontend)**

```ts
function steppedRange(min: number, max: number, step = 0.25): number[] {
  // inclusive ends; normalize float with fixed(2); handle min > max by swapping or rejecting at API
}
```

Do **not** call an API per cell.

---

## 6. Phases

### Phase A — Attribute masters + Attributes UI

- Prisma models + migration + seed  
- Attribute APIs  
- `/inventory/attributes` tabs CRUD + active switch  
- Nav link  

**Done when:** Admin can add “Tintable”, deactivate a coating, and list active-only.

### Phase B — Product create + list/grid

- `LensProduct` model + APIs  
- Create form with cascade selects  
- Catalog list + grid + search/filters  
- Compatibility enforced server-side  

**Done when:** Admin creates a product and sees it in list and grid.

### Phase C — Product detail matrix UI

- Detail page header  
- Frontend SPH×CYL matrix from saved range; `_ / _ / _` cells  
- Sticky headers / scroll  

**Done when:** Opening a product matches CLIENT-PLAN matrix description (visual).

### Phase D — Hardening (same slice if time)

- Audit log on attribute/product create-update  
- Empty states, validation messages  
- Optional: prevent exact duplicate attribute combo + identical range  
- KT/V2 extra fields on form (matrix may stay SPH×CYL-only)

---

## 7. Explicit non-goals (do not implement here)

| Item | Why |
|------|-----|
| Bulk insert of every SPH×CYL leaf at qty 0 | Out of scope; inventory strategy later |
| Lazy “insert on first stock edit” | Later; matrix remains display-only |
| Wire matrix to `quantity` / reorder | RW-08 / stock module |
| Delete legacy lens tables | Orders/cart depend on them |
| Replace wholesale `CatalogProductLine` | Different product (shop cards) |
| Customer-facing fetch from `LensProduct` | Follow-on cutover |

---

## 8. Testing checklist

- [ ] Attribute create / rename / deactivate  
- [ ] Create product rejects inactive FK and illegal base↔material  
- [ ] Create product rejects duplicate `skuCode`  
- [ ] List pagination + filters; grid toggle  
- [ ] Detail matrix row/col counts match `(sph steps) × (cyl steps)` for sample ranges (plus and minus)  
- [ ] Large range still scrolls; header remains readable  
- [ ] Legacy `/api/lenses*` and existing orders unaffected  

---

## 9. Suggested PR order

1. Schema + seed + attribute APIs + Attributes page  
2. Product APIs + create form + list/grid  
3. Product detail matrix UI  
4. Polish (audit, empty states, KT/V2 fields)

---

## 10. Open engineering decisions

1. Final model names (`LensProduct` vs `ProductSku`).  
2. Index stored as `Decimal` vs string code.  
3. Sign convention for ranges (always store min≤max numerically vs optical “from −6 to 0”).  
4. Whether existing WIP in `admin-catalog.ts` / products-catalog pages is extended or replaced — align to this guide’s attribute FK model.  
5. When to introduce exact-power stock table (separate RW after this UI ships).
