# Storefront Catalog + sidebar nav split

**Document type:** Implementation handoff for engineers  
**Status:** Done (Nov 2026) — hybrid filters + pin/exclude; admin Levels 1–3; web/mobile Level 2+3 browse on storefront APIs (buy/detail/cart remain legacy follow-up)  
**Primary surface:** Admin panel + **customer-facing shop** (what optical-shop customers see)  
**Repos (all three — not admin-only):**

| Repo | What changes in this plan |
|------|---------------------------|
| `drishx-admin-backend` | Schema, storefront APIs, admin Storefront Catalog UI, sidebar split, Stock by Product rename |
| `drishx-web-app` | Customer shop browse (family → cards → products under a card) cut over to new storefront APIs |
| `drishx-mobile-app` | Same customer shop browse cutover — parity with web |

The **cards Admin creates in Storefront Catalog are the same cards customers see** on web and mobile. Shipping admin without shop wire-up leaves two sources of truth — out of scope as “admin only.” Admin may ship first in sequence; shop cutover is still **in this plan**.

**Related:**
- Product SoT: [`../product-catalog/`](../product-catalog/)
- Stock qty / matrix / PO (unchanged rules in this slice): [CLIENT-PLAN.md](./CLIENT-PLAN.md), [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md)
- Legacy Overview reference (do not extend as SoT): `/inventory/stock-overview/legacy`
- Client called this “Stock Overview” cards; **product lead** owns naming → **Storefront Catalog** under Inventory

---

## Doc ownership (read first — humans and AI)

**This file** is the **implementation brief** for Storefront Catalog + nav-split. Implement against **this** doc.

The living stock contracts — [CLIENT-PLAN.md](./CLIENT-PLAN.md), [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md), [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md), and this folder’s [README.md](./README.md) — will be **updated gradually** as each small plan ships.

| Who | What to do with original docs |
|-----|-------------------------------|
| **Implementing developer / AI agent** | **Do not rush** rewrites of `CLIENT-PLAN.md`, `DEVELOPER-GUIDE.md`, `CLIENT-FOLLOW-ONS.md`, or broad README rewrites. Build from **this** handoff file. |
| **Doc owner (product lead)** | Syncing the original CLIENT-PLAN / DEVELOPER-GUIDE / README after slices land is **their job**. |

---

## 0. Why this exists

Client asked to **bring back old Stock Overview merchandising**:

- 3-level browse (family → cards → products)
- Admin-created **cards** that sync to **mobile/web shop** shortcuts
- Cards behave like **filters** over catalog attributes (e.g. “Blue Cut”, “Poly Blue Cut”, “Hard Coat”)
- Activate / deactivate / edit cards **without** developer help

Legacy used `CatalogProductLine` + string match + free-text `CoatingFilterLabel`.  
New world: **`LensProduct` parents** + **Attributes** masters. Storefront is **presentation only**.

Current `/inventory/stock-overview` is an **ops stock hub** (parent → live Current/Threshold/Target matrix). That is **not** merchandising — rename to **Stock by Product** under Stocks; leave its logic alone in this slice (further Stocks UX from the meeting is a **later** doc).

This slice:

1. Split admin nav → **Stocks / Procurement / Inventory**
2. Build **Storefront Catalog** (hybrid filter + pin/exclude)
3. Rename ops hub → **Stock by Product**
4. Wire **customer shop** (web + mobile) to storefront cards

---

## 1. Locked decisions (do not reopen without product lead)

| # | Decision |
|---|----------|
| 1 | Sidebar: **Stocks**, **Procurement**, **Inventory** (three groups). |
| 2 | **Inventory** = Storefront Catalog · Products & catalog · Attributes. |
| 3 | Storefront = old **user-facing card** behaviour on **new catalog** — not legacy SKU tables. |
| 4 | **New tables** for storefront. Do **not** modify `CatalogProductLine` / `CoatingFilterLabel` as SoT. |
| 5 | **Products & catalog** = only place to **create/edit** parents + variants. |
| 6 | **No “Add product” on Storefront.** Create always happens in Products & catalog. New parents appear on cards when they **match filters** (or are pinned). |
| 7 | Card membership = **hybrid**: **attribute filter rules** (default) + **pin** / **exclude** overrides. |
| 8 | A parent **may appear on multiple cards** when filters match (e.g. Poly Blue Cut product also under Blue Cut). Exclusive one-card membership is **rejected**. |
| 9 | Card is scoped to one **family** (SV / KT / V2) at Level 1. |
| 10 | Filter dimensions = **new parent attributes** (not a separate Storefront coating CRUD tab). Unset dim = “any”. |
| 11 | **No** `StorefrontCoatingChip` / coatings-tab CRUD in v1. Shop secondary chips (if needed) = derived from attributes on products under the card. |
| 12 | Level 3 = live membership list (matched / pinned / excluded) — not a product editor, not stock qty, not matrix edit. |
| 13 | Admin Storefront + **wire customer shop** (web + mobile) in this work. Admin-first sequencing OK. |
| 14 | Today’s matrix hub → sidebar label **Stock by Product**; **no** redesign of power-wise / adjustments / checks / dashboard in this pass (sidebar only). Meeting follow-ups for those modules = separate plans. |
| 15 | Stock movement rules remain [CLIENT-PLAN.md](./CLIENT-PLAN.md). This doc is **presentation + nav**. |

---

## 2. Sidebar information architecture

### 2.1 Target nav

```
Stocks
  ├── Stock by Product          ← today’s /inventory/stock-overview (rename only)
  ├── Power-wise Inventory
  ├── Stock Dashboard / Audit
  ├── Stock Adjustments
  ├── Stock Checks
  ├── Stock Transactions
  └── Smart Alerts              ← placeholder if no href

Procurement
  ├── Procurement Cart
  ├── Purchase Orders
  └── Suppliers

Inventory
  ├── Storefront Catalog        ← NEW (this work)
  ├── Products & catalog
  └── Attributes
```

### 2.2 Route map

| Label | Route | Action this work |
|-------|-------|------------------|
| Stock by Product | `/inventory/stock-overview` (+ `/[id]`) | Rename label/title only; keep logic |
| Other Stocks / Procurement items | existing routes | Move under correct group only |
| Storefront Catalog | `/inventory/storefront-catalog` (+ `?family=` / `?card=`) | **Build new** |
| Products & catalog / Attributes | existing | Under Inventory group |
| Legacy Overview | `/inventory/stock-overview/legacy` | Leave; no sidebar link |

Update: [`components/admin-sidebar.tsx`](../../components/admin-sidebar.tsx), [`app/lib/admin-nav-active.ts`](../../app/lib/admin-nav-active.ts) if needed.

---

## 3. Concepts: old vs new

| Old Overview | New Storefront Catalog |
|--------------|------------------------|
| Category SV / KT / Progressive | `LensFamily` |
| `CatalogProductLine` card (“just filters”) | **`StorefrontCard`** + **filter JSON/FKs** on parent attributes |
| SKU on line via `category`/`item` string | Live query: parents matching filters − excludes + pins |
| Add product on Overview | **Forbidden** — Products & catalog only |
| `CoatingFilterLabel` CRUD tab | **Dropped** — coating is an attribute filter on the card |
| Shop `/api/lenses/items` | New `/api/storefront/...` |

```
Attributes (Family, Base, Material?, Index?, Coating?, Color?, Diameter?, ProgressiveType?)
        │
        ▼
  LensProduct (parent) ──► variants ──► stock leaves
        ▲
        │ match / pin / exclude
        │
  StorefrontCard (per family)
        │
        ▼
  Customer shop Level 2 / 3
```

**Products & catalog** = what the product **is**.  
**Storefront Catalog** = how customers **browse** it.  
**Attributes** = masters used by card filters.

### 3.1 Filter dimensions (parent attributes)

Card filters may use any combination of:

| Dimension | Source |
|-----------|--------|
| Family | Card’s `familyId` (Level 1 scope; usually fixed) |
| Base | `LensBase` |
| Material | `LensMaterial` (optional) |
| Index | `LensIndex` (optional) |
| Coating | `LensCoating` (optional) |
| Color | `LensColor` (optional) |
| Diameter | `LensDiameter` (optional) |
| Progressive type | `LensProgressiveType` (optional; V2) |

**Semantics:** AND across set dimensions. Unset = any.  
Examples:

- **Blue Cut** → Coating = Blue Cut  
- **Poly Blue Cut** → Base/Material = Poly **and** Coating = Blue Cut  
- **Blue Cut 1.67** → Coating = Blue Cut **and** Index = 1.67  

**Not** card filters: power range, SPH/CYL, axis, ADD, eye, quantity (those live under product / Stocks).

### 3.2 Hybrid membership

```
visibleParents =
  (active parents in family matching card filters)
  ∪ pinned parents
  − excluded parents
```

| Mechanism | Effect |
|-----------|--------|
| **Filter match** | Auto-include when parent attrs satisfy card filters |
| **Pin** | Force-include even if filters don’t match |
| **Exclude** | Hide even if filters match |

Same rules for **admin Level 3** and **customer shop**.

---

## 4. UI overview (build this)

Patterns: `AdminPage`, brand tokens, `AdminSelect`, skeletons, lucide. Merchandising browse denseness like legacy Overview — not the ops matrix hub look.

### 4.1 Level 1 — Families

**Route:** `/inventory/storefront-catalog`

```
┌─────────────────────────────────────────────────────────────┐
│  Storefront Catalog                                         │
│  Cards customers see in the shop. Products are created in   │
│  Products & catalog; cards filter / pin what is shown.      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Single Vision│  │   Kryptok    │  │ Progressive  │       │
│  │     SV       │  │     KT       │  │     V2       │       │
│  │  N cards     │  │  N cards     │  │  N cards     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Level 2 — Cards (no coatings tab)

**Route:** `/inventory/storefront-catalog?family=SV`

```
┌─────────────────────────────────────────────────────────────┐
│  ← Families    Single Vision                                │
│  Search…                              [ + Add card ]        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │ BLUE CUT        ●ON  │  │ POLY BLUE CUT   ●ON  │         │
│  │ Filter: Coating=…    │  │ Filter: Base∩Coat…   │         │
│  │ 12 products          │  │ 4 products           │         │
│  │ [Edit] [⋯]           │  │ [Edit] [⋯]            │         │
│  └──────────────────────┘  └──────────────────────┘         │
│  ⋯ = Activate / Deactivate / Delete-or-Hide                 │
└─────────────────────────────────────────────────────────────┘
```

| Action | Behaviour |
|--------|-----------|
| Add card | Name (required), description?, sortOrder, **filter fields** from attribute pickers |
| Edit | Name, description, sort, **filters**, active |
| Activate / Deactivate | Inactive hidden from shop |
| Delete / Hide | Safe rules (soft-hide OK) |
| Click card | → Level 3 |

**No** separate “Coating filters” tab on this screen.

### 4.3 Level 3 — Membership under a card

**Route:** `/inventory/storefront-catalog?family=SV&card=<id>`

```
┌─────────────────────────────────────────────────────────────┐
│  ← Cards    BLUE CUT · SV · Active                          │
│  Filters: Coating = Blue Cut          [ Edit filters ]      │
│  [ + Pin product ]                                          │
├─────────────────────────────────────────────────────────────┤
│  Search…                                                    │
├─────────────────────────────────────────────────────────────┤
│  Product (attr summary) │ Src     │ Vars │ Active │ Actions │
│  … Blue Cut …           │ Matched │  3   │  ●     │ Catalog │
│                         │         │      │        │ Exclude │
│  … (forced) …           │ Pinned  │  2   │  ●     │ Catalog │
│                         │         │      │        │ Unpin   │
├─────────────────────────────────────────────────────────────┤
│  Optional: Excluded list (undo exclude)                     │
└─────────────────────────────────────────────────────────────┘
```

| Action | Behaviour |
|--------|-----------|
| Edit filters | Update card filter attrs; list refreshes |
| Pin product | Picker of active parents in family (any); add pin override |
| Exclude | Hide matched parent from this card / shop |
| Unpin | Remove pin |
| Undo exclude | Restore excluded parent |
| Open Catalog | `/inventory/products-catalog/[id]` |
| Search | Filter visible rows |

**Forbidden on Level 3:** create product, edit qty, edit threshold/target, open stock matrix as editor.

Empty: “No products match — change filters or pin a product.”

### 4.4 Breadcrumb / URL

Deep-linkable `?family=` + `?card=` so return from Catalog still restores place.

### 4.5 Stock by Product (rename only)

Sidebar + page title: **Stock by Product**. Logic unchanged in this ticket.

---

## 5. Schema (new — proposed)

```prisma
/// Merchandising card — customer shop Level 2.
model StorefrontCard {
  id          String   @id @default(cuid())
  familyId    String
  family      LensFamily @relation(...)
  name        String
  description String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)

  /// Optional FKs = AND filters. Null = any for that dimension.
  /// familyId above already scopes the card; do not also require a second family filter.
  baseId              String?
  materialId          String?
  indexId             String?
  coatingId           String?
  colorId             String?
  diameterId          String?
  progressiveTypeId   String?

  base            LensBase?            @relation(...)
  material        LensMaterial?        @relation(...)
  index           LensIndex?           @relation(...)
  coating         LensCoating?         @relation(...)
  color           LensColor?           @relation(...)
  diameter        LensDiameter?        @relation(...)
  progressiveType LensProgressiveType? @relation(...)

  overrides   StorefrontCardProductOverride[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([familyId, name])
  @@index([familyId, isActive, sortOrder])
}

enum StorefrontCardOverrideKind {
  PIN
  EXCLUDE
}

/// Hybrid overrides only — matched parents are NOT stored row-per-product.
model StorefrontCardProductOverride {
  id               String                     @id @default(cuid())
  storefrontCardId String
  storefrontCard   StorefrontCard             @relation(...)
  lensProductId    String
  lensProduct      LensProduct                @relation(...)
  kind             StorefrontCardOverrideKind
  createdAt        DateTime                   @default(now())

  @@unique([storefrontCardId, lensProductId])
  @@index([lensProductId])
  @@index([storefrontCardId, kind])
}
```

**Explicitly do not:**

- `StorefrontCoatingChip` table in v1  
- Store every matched parent as a row (use query + overrides)  
- `quantity` / SPH / CYL on storefront tables  
- Writes to `CatalogProductLine` / `CoatingFilterLabel`  
- Free-text filter strings as SoT (use attribute FKs)

Optional later: `imageUrl` on card; multi-value filters per dimension if product asks.

---

## 6. APIs

Follow `drishx-api-auth-audit` + `drishx-client-api`.

### 6.1 Admin

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/storefront/families` | Families + card counts |
| GET | `/api/admin/storefront/cards?familyId=` | List cards (+ filter summary, productCount) |
| POST | `/api/admin/storefront/cards` | Create (name + filters + sort) |
| PATCH | `/api/admin/storefront/cards/:id` | Edit name/filters/active/sort |
| DELETE | `/api/admin/storefront/cards/:id` | Safe delete/hide |
| GET | `/api/admin/storefront/cards/:id/products` | Resolved membership: matched ∪ pinned − excluded (include source) |
| POST | `/api/admin/storefront/cards/:id/overrides` | `{ lensProductId, kind: PIN \| EXCLUDE }` |
| DELETE | `/api/admin/storefront/cards/:id/overrides/:productId` | Clear override |

**Membership resolver** (shared admin + shop): implement once in `app/lib/catalog/` or `app/lib/storefront/`.

Client wrapper: `app/lib/admin-storefront.ts`.

### 6.2 Customer shop

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/storefront/cards?family=SV` | Active cards + productCount (same resolver) |
| GET | `/api/storefront/products?cardId=` | Active visible parents for shop list |
| GET | `/api/storefront/facets?cardId=` *(optional v1)* | Distinct coatings/etc. on visible parents for chips — **derived**, no chip table |

---

## 7. Customer shop cutover

### 7.1 Today

Level 2: `GET /api/lenses/items` → `CatalogProductLine` / dynamic legacy  
Coatings: `CoatingFilterLabel` intersect  

### 7.2 Target

- Web + mobile Level 2 → `/api/storefront/cards`  
- Under a card → `/api/storefront/products`  
- Facet chips (if UI needs them) → derived from visible parents’ attributes  

**Minimum:** Level 2 cards must not stay on legacy lines while Admin manages new cards.

Empty card: disabled “No products yet”.

Buy/detail/cart on full catalog leaves may be a follow-up PR **after** Level 2+3 browse cutover — document in PR; do not leave dual SoT for cards.

---

## 8. Implementation phases

| Phase | Deliverable | Done when |
|-------|-------------|-----------|
| **P0** | Sidebar Stocks / Procurement / Inventory; Stock by Product rename | Nav matches §2 |
| **P1** | Prisma `StorefrontCard` + overrides + migration | Schema live |
| **P2** | Membership resolver + admin card CRUD APIs | Create/edit filters; counts correct |
| **P3** | Admin UI Levels 1–2 | Add/edit/activate cards with attribute filters |
| **P4** | Admin Level 3 + pin/exclude APIs | Hybrid list works |
| **P5** | Public storefront APIs + web shop browse | Customers see new cards |
| **P6** | Mobile shop browse parity | Same as web |
| **P7** | Mark status on **this** file if needed. **Do not** rewrite CLIENT-PLAN / DEVELOPER-GUIDE in implementer PR | Slice complete |

Other Stocks pages: **P0 sidebar only** in this plan.

---

## 9. Code touchpoints

| Area | Path |
|------|------|
| Sidebar | `components/admin-sidebar.tsx` |
| Legacy merchandising UX | `app/(admin)/inventory/stock-overview/legacy/` |
| Ops matrix hub | `app/(admin)/inventory/stock-overview/page.tsx`, `[id]/page.tsx` |
| Catalog / attributes SoT | `app/(admin)/inventory/products-catalog/`, `attributes/`, `app/lib/catalog/*`, `admin-lens-catalog.ts` |
| Legacy shop cards | `catalog-product-lines.ts`, `wholesale-catalog-counts.ts`, `app/api/lenses/items` |
| Legacy coatings | `coating-filter-labels.ts`, `app/api/lenses/coatings` |
| Web shop | `drishx-web-app/components/shop/*`, `lib/lenses-api.ts` |
| Mobile shop | `drishx-mobile-app` shop / lenses wrappers |

Skills: `drishx-repo`, `drishx-nextjs`, `drishx-prisma`, `drishx-api-auth-audit`, `drishx-client-api`.

---

## 10. Acceptance checklist

### Nav
- [ ] Three groups: Stocks, Procurement, Inventory  
- [ ] Storefront Catalog under Inventory  
- [ ] Stock by Product label for former ops overview  
- [ ] Other stock/procurement pages relocated only  

### Storefront admin
- [ ] Family → Cards → Products (3 levels)  
- [ ] Create/edit card with **attribute filters** (AND; null = any)  
- [ ] Activate/deactivate; inactive hidden from shop  
- [ ] Level 3 shows matched + pinned − excluded with source labels  
- [ ] Pin / exclude / unpin / undo exclude  
- [ ] Open Products & catalog from a row  
- [ ] **No** create product on Storefront  
- [ ] **No** coating-filters tab / chip CRUD  
- [ ] **No** free-edit stock qty / triad edit on Storefront  
- [ ] No writes to legacy `CatalogProductLine` / `CoatingFilterLabel`  
- [ ] Same parent can appear on multiple cards via filters  

### Shop
- [ ] Web Level 2 from `StorefrontCard`  
- [ ] Mobile parity  
- [ ] Product list under card uses same membership resolver  
- [ ] Empty cards disabled with clear copy  

### Non-goals (this slice)
- [ ] No Power-wise / Adjustments / Checks / Dashboard redesign (meeting follow-ups → later docs)  
- [ ] No Storefront coating chip table  
- [ ] No product create from Storefront  
- [ ] No CLIENT-PLAN / DEVELOPER-GUIDE rewrite by implementer  

---

## 11. Open / non-blocking

1. URL style: `?family=&card=` vs path segments.  
2. Card image in v1 or later.  
3. Multi-select per filter dimension (e.g. two coatings on one card) — v1 = single FK per dim unless product asks.  
4. How far shop detail/cart leaves legacy in same milestone vs follow-up (browse cutover mandatory).  
5. GST/HSN on card if finance needs it later.  
6. Meeting items for Power-wise 4-state matrix, adjustments form, Excel stock check, dashboard analytics — **out of this file**; track in a future Stocks slice doc.

---

## 12. One-line brief for the implementing developer

> Split sidebar into Stocks / Procurement / Inventory; rename ops overview to Stock by Product; build Storefront Catalog as family → cards with **attribute filters + pin/exclude** (no product create, no coating-tab CRUD); resolve membership live for admin and shop; cut over web + mobile Level 2/3 browse to storefront APIs. Implement from **this** file only — **do not** rewrite CLIENT-PLAN / DEVELOPER-GUIDE.
