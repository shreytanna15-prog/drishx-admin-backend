# Power-wise Inventory (admin ops browse)

**Document type:** Implementation handoff for engineers  
**Status:** Built (admin) — 3-level browse + Excel/PDF; Stock by Product edit hub unchanged  
**Primary surface:** Admin panel only  
**Repos:** `drishx-admin-backend` only (no web/mobile in this slice)

**Related:**
- Product SoT: [`../product-catalog/`](../product-catalog/)
- Stock position math: [CLIENT-PLAN.md](./CLIENT-PLAN.md) §6, [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) §6.1  
- Nav / Storefront (separate slice): [STOREFRONT-CATALOG-AND-NAV-SPLIT.md](./STOREFRONT-CATALOG-AND-NAV-SPLIT.md)  
- Today’s editable Current/Threshold/Target hub stays as **Stock by Product** (`/inventory/stock-overview`) — do **not** delete that code; Power-wise is a different job (read-only stock states)

---

## Doc ownership (read first — humans and AI)

**This file** is the implementation brief for **Power-wise Inventory**. Implement against **this** doc.

| Who | Original CLIENT-PLAN / DEVELOPER-GUIDE |
|-----|----------------------------------------|
| **Implementing developer / AI** | **Do not rewrite** those originals in the feature PR. Build from this slice. |
| **Doc owner (product lead)** | Syncs living contracts later, slice by slice. |

---

## 0. Why this exists

Client (Naman) clarified Power-wise vs Products & catalog / Stock by Product:

| Screen | Purpose |
|--------|---------|
| **Products & catalog** | Create/edit parents + variants; setup matrix |
| **Stock by Product** | Ops matrix with **Current / Threshold / Target** (editable rules) |
| **Power-wise Inventory** | Walk-in / phone: “Do we have this stock?” — **read-only** On-hand · Reserved · Available · Blocked on **one range+axis matrix** (same sheets as Products / Stock by Product), with Excel/PDF download |

Today’s `/inventory/power-wise-stock` is a **flat leaf table** with editable min/target + **Run reorder**. That UX is **replaced entirely** by the 3-level flow below. Run reorder moves to **Stock Dashboard** in a later slice — for this slice: **remove Run reorder from Power-wise** only (do not build dashboard move here unless already trivial).

---

## 1. Locked decisions

| # | Decision |
|---|----------|
| 1 | **3 levels:** Parent stock cards → Range+axis sheet list → Read-only catalog matrix |
| 2 | Level 1 = **one grid of all parent stock cards** + attribute filters (including Family). Not Storefront cards; not a clone of Products & catalog cards — **stock-flavoured**. |
| 3 | Level 2 = **matrix sheets** of that parent — one row per **power range + axis** (ADD/eye are columns, not rows); search / axis filter |
| 4 | Level 3 = same family-aware **2D matrix shell** as Stock by Product `[id]`, but cells show **four read-only** values only |
| 5 | Cell values: **On-hand / Reserved / Available / Blocked** — **one line** per cell as `x / x / x / x` (same formulas as Stock Dashboard / `catalogAvailable`) |
| 6 | No **Incoming** / open PO on this matrix in v1 |
| 7 | Valid matrix cells with no DB leaf yet → show **all four as 0** |
| 8 | Cross / `allowed: false` cells stay disabled × (no stock values) — same as catalog matrix |
| 9 | Download **Excel + PDF** for **that range+axis sheet only** (not whole parent, not all products) |
| 10 | **Remove Run reorder** (and min/target editing) from Power-wise |
| 11 | **Do not delete** Stock by Product / threshold-target / bulk-select code — leave for later; just don’t surface edit/reorder on Power-wise |
| 12 | **Replace** today’s flat Power-wise page entirely (same base route `/inventory/power-wise-stock`) |
| 13 | **Admin only** — no web/mobile |
| 14 | Reuse existing stock position APIs/libs; prefer thin new routes/UI over new stock identity |

---

## 2. Where it sits in nav

Under **Stocks** (see Storefront nav-split doc):

```
Stocks
  ├── Stock by Product          ← Current/Threshold/Target (unchanged this slice)
  ├── Power-wise Inventory      ← THIS WORK (replace UI)
  ├── Stock Dashboard / Audit
  └── …
```

---

## 3. Stock math (reuse — do not reinvent)

Same as Dashboard KPIs and CLIENT-PLAN:

```
onHand    = LensProductPower.quantity
blocked   = LensProductPower.blockedQty
reserved  = derived open-order reserved (existing getCatalogReservedForPowers / position helpers)
available = onHand − reserved − blocked   // computeAvailableQty / catalogAvailable
```

Dashboard already aggregates these four (`onHandSum`, `reservedSum`, `availableSum`, `blockedSum`). Power-wise shows them **per SPH×CYL cell** on the same catalog matrix sheets (ADD as columns).

---

## 4. UI overview

Patterns: `AdminPage`, brand tokens, `AdminSelect`, skeletons, lucide. Matrix: reuse `CatalogMatrixPanel` (or extract a read-only stock-states mode) — **do not** enable Threshold/Target edits or Add to Cart on this screen.

### 4.1 Level 1 — Parent stock cards

**Route:** `/inventory/power-wise-stock`

```
┌─────────────────────────────────────────────────────────────┐
│  Power-wise Inventory                                       │
│  Find a product → pick a variant → view stock by power.     │
│  Read-only. For threshold/target use Stock by Product.      │
├─────────────────────────────────────────────────────────────┤
│  Search…  Family ▾  Base ▾  Coating ▾  … (attributes)       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐           │
│  │ Parent attr summary │  │ …                   │           │
│  │ N variants          │  │                     │           │
│  │ On-hand · Avail     │  │                     │           │
│  │ Reserved · # short  │  │                     │           │
│  │ Open variants →     │  │                     │           │
│  └─────────────────────┘  └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**Card metrics (locked):**

| Field | Notes |
|-------|--------|
| On-hand | Sum of leaf on-hand under parent (or 0) |
| Available | Sum available |
| Reserved | Sum reserved |
| Active shortages | Count of leaves at/below threshold (same spirit as overview cards) |
| Variant count | Secondary text |

Filters: parent attributes (Family, Base, Material, Index, Coating, Color, Diameter, Progressive type) + text search.  
Click card → Level 2.

### 4.2 Level 2 — Matrix sheets (range + axis)

**Route:** `/inventory/power-wise-stock/[productId]`

```
┌─────────────────────────────────────────────────────────────┐
│  ← Parents    {attr summary}                                │
│  Search…  Axis filter                                       │
├─────────────────────────────────────────────────────────────┤
│  Power range · Axis · ADD columns · Eye · Variants · …      │
│  (rolled-up on-hand / available for the sheet)              │
│  → Open matrix                                              │
└─────────────────────────────────────────────────────────────┘
```

- One row per **catalog matrix sheet** = **power range + axis** (same grouping as `buildCatalogMatrix` / Products / Stock by Product).  
- **Do not** list one row per ADD or eye SKU — those are **columns inside** the matrix.  
- Include inactive behind a toggle if useful; default active.  
- Click row → Level 3 for that sheet (URL may use a representative `variantId`; API expands all ADD/eye siblings).

### 4.3 Level 3 — Read-only stock matrix

**Route:** `/inventory/power-wise-stock/[productId]/[variantId]`  
(`variantId` is a seed in the sheet; response includes all siblings for the same range+axis.)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Sheets    {range} · Axis · ADD columns summary           │
│  [ Download Excel ]  [ Download PDF ]                       │
│  Cells: On-hand / Reserved / Available / Blocked (read-only)│
│  Display: one line →  12 / 2 / 10 / 0                      │
├─────────────────────────────────────────────────────────────┤
│  Same family sheets as Products / Stock by Product          │
│  (SPH×CYL stubs; ADD / eye as data columns; colours)        │
│  Cross gap cells = ×                                        │
│                                                             │
│  ┌─────┬──────────────────┬──────────────────┐              │
│  │     │ ADD 1.00         │ ADD 1.50         │              │
│  ├─────┼──────────────────┼──────────────────┤              │
│  │ SPH │ 12 / 2 / 10 / 0  │ 0 / 0 / 0 / 0    │              │
│  │ CYL │                  │                  │              │
│  └─────┴──────────────────┴──────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

| Behaviour | Detail |
|-----------|--------|
| Read-only | No Threshold/Target inputs; no Add to Cart; no Run reorder |
| Coverage | Same `buildCatalogMatrix` rules as catalog — **all ADD/eye variants** that share this power range + axis |
| Cell UI | **Single line** `onHand / reserved / available / blocked` (never wrap to two lines). Missing leaf → `0 / 0 / 0 / 0` |
| Download | Excel + PDF of **this** matrix; export text matches the same four values |
| Navigation | Link optional: “Edit thresholds on Stock by Product” → `/inventory/stock-overview/[productId]` (nice-to-have) |

---

## 5. APIs (target)

Reuse position helpers in `app/lib/catalog/catalog-stock-position*.ts`, `admin-stock.ts`. Prefer extending admin stock routes over forking identity.

| Method | Path (proposed) | Purpose |
|--------|-----------------|---------|
| GET | `/api/admin/stock/power-wise/products` | Parent cards: filters + aggregates (onHand, available, reserved, shortageCount, variantCount) |
| GET | `/api/admin/stock/power-wise/products/:productId/variants` | Matrix sheet list (grouped by range+axis) + rollups + `q` / `axis` filters |
| GET | `/api/admin/stock/power-wise/products/:productId/variants/:variantId/matrix` | Catalog matrix for that range+axis sheet (all ADD/eye siblings); cells `{ onHand, reserved, available, blocked }` (0 if no leaf) |
| GET | `/api/admin/stock/power-wise/products/:productId/variants/:variantId/export?format=xlsx\|pdf` | Download that matrix |

Auth: admin (same as other `/api/admin/stock/*`).

**Remove / stop exposing on Power-wise UI:** Run reorder button, inline min/target edits, Add to Cart (those stay on other screens).

Client: extend `admin-stock.ts` or add `admin-power-wise-stock.ts` + `useApiQuery` hooks per `drishx-client-api`.

---

## 6. Replace today’s page

| Today | After |
|-------|--------|
| `app/(admin)/inventory/power-wise-stock/page.tsx` flat table | Level 1 parent cards |
| Editable rules + Run reorder + cart | Gone from this module |
| Single route | + `[productId]/page.tsx` + `[productId]/[variantId]/page.tsx` (or query equiv — pick one and stay consistent) |

Do **not** leave the old flat table as a hidden default. Replace entirely.

---

## 7. Implementation phases

| Phase | Deliverable | Done when |
|-------|-------------|-----------|
| **P0** | Confirm nav label under Stocks; remove Run reorder + edit UI from current page **or** replace page shell | Power-wise no longer edits rules / reorder |
| **P1** | Parent cards API + Level 1 UI + attribute filters | Can open a parent |
| **P2** | Range+axis sheet list API + Level 2 UI | Can open one matrix sheet |
| **P3** | Matrix API + read-only matrix UI (four states, zeros, cross ×) | Walk-in view works |
| **P4** | Excel + PDF export for that matrix | Downloads match on-screen cells |
| **P5** | Polish: empty states, loading skeletons, optional link to Stock by Product | Slice complete |

**Do not** rewrite CLIENT-PLAN / DEVELOPER-GUIDE in the implementer PR.

---

## 8. Code touchpoints

| Area | Path |
|------|------|
| Current Power-wise (replace) | `app/(admin)/inventory/power-wise-stock/page.tsx` |
| Stock by Product matrix (reference UI, keep) | `app/(admin)/inventory/stock-overview/[id]/page.tsx`, `components/catalog/catalog-matrix-panel.tsx` |
| Position / reserved | `app/lib/catalog/catalog-stock-position.ts`, `catalog-stock-position-core.ts`, `catalog-stock-adjustment-core.ts` |
| Dashboard aggregates (same four) | `app/(admin)/inventory/stock-dashboard/page.tsx`, overview API |
| Client stock API | `app/lib/admin-stock.ts` |
| Matrix layout | `app/lib/catalog/catalog-matrix.ts` |

Skills: `drishx-repo`, `drishx-nextjs`, `drishx-prisma`, `drishx-api-auth-audit`, `drishx-client-api`.

---

## 9. Acceptance checklist

- [ ] Level 1: parent stock cards with On-hand · Available · Reserved · Active shortages + variant count  
- [ ] Attribute filters (incl. family) + search on Level 1  
- [ ] Level 2: one row per **power range + axis** sheet (ADD/eye summarized, not separate rows)  
- [ ] Level 3: same catalog matrix as Products / Stock by Product (ADD columns); four read-only states per valid cell  
- [ ] Each cell shows **one line** `onHand / reserved / available / blocked` (not two stacked pairs)  
- [ ] Missing leaf → `0 / 0 / 0 / 0`  
- [ ] Disabled cross cells remain non-stock  
- [ ] `available = onHand − reserved − blocked` (shared helper)  
- [ ] Excel download of that matrix  
- [ ] PDF download of that matrix  
- [ ] No Run reorder on Power-wise  
- [ ] No Threshold/Target edit on Power-wise  
- [ ] Old flat Power-wise table gone  
- [ ] Stock by Product / rule-edit code still present elsewhere  
- [ ] Admin only; no web/mobile changes  
- [ ] No CLIENT-PLAN / DEVELOPER-GUIDE rewrite by implementer  

### Non-goals (this slice)

- Storefront Catalog / shop cutover  
- Moving Run reorder onto Dashboard UI (remove from Power-wise only; dashboard host can be a follow-up)  
- Stock Adjustments / Checks redesign  
- Threshold/Target bulk row-column (stays on Stock by Product later)  
- Incoming on Power-wise matrix  

---

## 10. Open / non-blocking

1. Exact path vs query for Level 2/3 URLs.  
2. PDF library choice (match whatever reports already use if present).  
3. Whether Level 2 shows per-variant rolled-up available.  
4. Optional deep-link to Stock by Product for threshold edits.

---

## 11. One-line brief

> Replace flat Power-wise with parent stock cards → range+axis sheet list → read-only matrix using the **same** `buildCatalogMatrix` sheets as Products / Stock by Product (ADD as columns); each cell one line `OH / R / Av / Bl` (zeros for empty cells); Excel+PDF for that matrix only; remove Run reorder and rule editing from this module; leave Stock by Product triad editing code intact; admin only. Implement from **this** file — do not rewrite CLIENT-PLAN / DEVELOPER-GUIDE.
