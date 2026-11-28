# Storefront Catalog + sidebar nav split

**Document type:** Implementation handoff for engineers  
**Status:** Locked from client discussion (Nov 2026) — ready to build  
**Primary surface:** Admin panel + **customer-facing shop** (what optical-shop customers see)  
**Repos (all three — not admin-only):**
| Repo | What changes in this plan |
|------|---------------------------|
| `drishx-admin-backend` | Schema, storefront APIs, admin Storefront Catalog UI, sidebar split, Stock by Product rename |
| `drishx-web-app` | Customer shop browse (Level 2 cards / coatings / product list under a card) cut over to new storefront APIs |
| `drishx-mobile-app` | Same customer shop browse cutover — parity with web |

The **cards Admin creates in Storefront Catalog are the same cards customers see** on web and mobile. Shipping admin without shop wire-up leaves two sources of truth — out of scope as “admin only.”

**Related:**
- Product SoT: [`../product-catalog/`](../product-catalog/)
- Stock qty / matrix / PO (unchanged rules): [CLIENT-PLAN.md](./CLIENT-PLAN.md), [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md)
- Legacy Overview reference (do not extend as SoT): `/inventory/stock-overview/legacy`

---

## Doc ownership (read first — humans and AI)

**This file** (`STOREFRONT-CATALOG-AND-NAV-SPLIT.md`) is the **implementation brief** for the Storefront Catalog + nav-split work. Implement against **this** doc.

The living stock contracts — [CLIENT-PLAN.md](./CLIENT-PLAN.md), [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md), [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md), and this folder’s [README.md](./README.md) — will be **updated gradually** as each small plan (Storefront Catalog, then later Stocks pages, etc.) ships.

| Who | What to do with original docs |
|-----|-------------------------------|
| **Implementing developer / AI agent** | **Do not rush** rewrites of `CLIENT-PLAN.md`, `DEVELOPER-GUIDE.md`, `CLIENT-FOLLOW-ONS.md`, or broad README rewrites to “match” this slice. Build from **this** handoff file. At most add a one-line pointer if explicitly asked. |
| **Doc owner (product lead)** | Syncing the original CLIENT-PLAN / DEVELOPER-GUIDE / README after slices land is **their job**, not the feature implementer’s. |

Same rule for future small plans in this folder: ship the feature from the slice doc first; original contracts catch up **one by one**, owned centrally — not by every PR author inventing a full docs rewrite.

---

## 0. Why this exists

Client asked to **bring back the old Stock Overview behaviour**:

- 3-level browse tree
- Admin-created **cards** that become **customer-facing** on web/mobile
- Manage products under a card
- Coating filter chips CRUD that drives shop filters

That old screen used **legacy** identity (`lensType` + `lensId`, `CatalogProductLine`, free-text coatings / `CoatingFilterLabel`).

We already moved product master to the **new multi-layer catalog** (`LensProduct` parent → variants → power leaves). The current `/inventory/stock-overview` is an **ops stock hub** (parent cards → live matrix) — useful for stock, **not** a replacement for storefront merchandising.

This doc is the plan to:

1. Split admin nav into **Stocks / Procurement / Inventory**
2. Build **Storefront Catalog** under Inventory = old Overview UX on **new architecture**
3. Rename today’s matrix hub to **Stock by Product** (logic unchanged for now)
4. Wire **customer shop** to the new storefront cards

---

## 1. Locked decisions (do not reopen without product)

| # | Decision |
|---|----------|
| 1 | Sidebar becomes **three** sections: **Stocks**, **Procurement**, **Inventory** (not one “Stock & Procurement” blob). |
| 2 | **Inventory** owns: **Storefront Catalog**, **Products & catalog**, **Attributes**. |
| 3 | **Storefront Catalog** recreates **old Overview client behaviour** on **new catalog** — not legacy SKU tables. |
| 4 | **New tables** for storefront presentation. Do **not** modify/extend `CatalogProductLine` or `CoatingFilterLabel` as the new SoT. Leave legacy tables for the old shop path until cutover. |
| 5 | **Products & catalog** remains SoT for **creating/editing** parents + variants. Storefront does **not** invent a second product model. |
| 6 | “Add product” on Storefront is allowed as **UX**, but under the hood it must call **catalog create** and then **link** the new parent to the card. |
| 7 | Admin can also **attach existing** catalog parents to a card (explicit link — replaces fragile string match). |
| 8 | **One parent → one card** in v1 (exclusive membership). |
| 9 | Card is scoped to one **family** (SV / KT / V2). |
| 10 | **Coating chips CRUD** returns on Storefront (old tab behaviour), but chips reference **`LensCoating`** (attribute master), not free-text legacy coatings. |
| 11 | Deliver **admin Storefront + wire customer shop** (web + mobile) in this work. |
| 12 | Today’s catalog stock matrix hub stays; rename to **Stock by Product** under Stocks. **Do not redesign** power-wise / adjustments / checks / etc. in this pass — **sidebar placement/labels only**. |
| 13 | Stock quantity rules, matrix Current/Threshold/Target, PO receive, etc. stay as in [CLIENT-PLAN.md](./CLIENT-PLAN.md). This doc is **presentation + nav**, not a stock-movement rewrite. |

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
  └── Smart Alerts              ← still placeholder if no href

Procurement
  ├── Procurement Cart
  ├── Purchase Orders
  └── Suppliers

Inventory
  ├── Storefront Catalog        ← NEW (this work)
  ├── Products & catalog
  └── Attributes
```

**Out of this sidebar pass:** Stock Reports (stays under Reports hub unless product asks later).

### 2.2 Route map

| Label | Route | Action this work |
|-------|-------|------------------|
| Stock by Product | `/inventory/stock-overview` (+ `/[id]` matrix) | Rename sidebar label only; keep logic |
| Power-wise / Dashboard / Adjustments / Checks / Transactions | existing `/inventory/stock-*` | Move under Stocks group only |
| Procurement Cart / POs / Suppliers | existing `/procurement/*` | Move under Procurement group only |
| Storefront Catalog | `/inventory/storefront-catalog` (+ nested levels via query or child routes) | **Build new** |
| Products & catalog / Attributes | existing | Move under Inventory group only |
| Legacy Overview | `/inventory/stock-overview/legacy` | Leave; do not link in sidebar |

Update: [`components/admin-sidebar.tsx`](../../components/admin-sidebar.tsx), active-path helpers in [`app/lib/admin-nav-active.ts`](../../app/lib/admin-nav-active.ts) if needed.

---

## 3. Concepts: old vs new

| Old Overview | New Storefront Catalog |
|--------------|------------------------|
| Category SV / KT / Progressive | `LensFamily` (SV / KT / V2) |
| `CatalogProductLine` card | **New** `StorefrontCard` |
| SKU belongs to line via `category`/`item` string match | **New** `StorefrontCardProduct` → `LensProduct.id` |
| Add product → `POST /api/lenses/...` legacy row | Add product → catalog create APIs → link to card |
| `CoatingFilterLabel` free-text chips | **New** `StorefrontCoatingChip` → `LensCoating.id` |
| Shop `/api/lenses/items` | New storefront list APIs; shop cutover |

```
LensFamily
  └── StorefrontCard          (merchandising card — customer sees this)
        ├── StorefrontCardProduct[]  → LensProduct (parent)
        │         └── LensProductVariant[] → LensProductPower (stock leaf)
        └── StorefrontCoatingChip[]  → LensCoating (shop filter chips)
```

**Products & catalog** = what the product **is**.  
**Storefront Catalog** = how customers **browse** it.

---

## 4. UI overview (build this)

Use existing admin patterns: `AdminPage`, brand tokens, `AdminSelect`, `CardGridSkeleton` / `TableSkeleton` / `DetailSkeleton`, lucide icons. Match legacy Overview interaction density, not the current ops “stock cards → matrix” look.

### 4.1 Level 1 — Families

**Route:** `/inventory/storefront-catalog`

```
┌─────────────────────────────────────────────────────────────┐
│  Storefront Catalog                                         │
│  Cards customers see in the shop — powered by Products &    │
│  catalog (SoT).                                             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Single Vision│  │   Kryptok    │  │ Progressive  │       │
│  │     SV       │  │     KT       │  │     V2       │       │
│  │  N cards     │  │  N cards     │  │  N cards     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

- Three family cards (from `LensFamily`).
- Click → Level 2 for that family.

### 4.2 Level 2 — Cards + Coatings tabs

**Route:** `/inventory/storefront-catalog?family=SV`  
(or `/inventory/storefront-catalog/SV` — pick one style and stay consistent)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Families    Single Vision                                │
│  [ Product cards ]  [ Coating filters ]                     │
├─────────────────────────────────────────────────────────────┤
│  Search…                    [ + Add card ]                  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐                    │
│  │ BLUE CUT    ●ON │ │ BRC         ●ON │   managed cards  │
│  │ 12 products     │ │ 4 products      │                    │
│  │ [Edit] [⋯]      │ │ [Edit] [⋯]       │                    │
│  └─────────────────┘ └─────────────────┘                    │
│  (⋯ = Activate/Deactivate, Delete/Hide rules)               │
│                                                             │
│  Optional section: unlinked / empty messaging               │
└─────────────────────────────────────────────────────────────┘
```

**Product cards tab — actions (parity with old lines):**

| Action | Behaviour |
|--------|-----------|
| Add card | Modal/sheet: name (required), description?, sortOrder |
| Edit | Rename / description / sort |
| Activate / Deactivate | `isActive`; inactive hidden from shop |
| Delete / Hide | Soft-hide or block delete if products linked (mirror old safe rules) |
| Click card | → Level 3 |

**Coating filters tab:**

```
┌─────────────────────────────────────────────────────────────┐
│  [ Sync from products ]  [ + Add coating chip ]             │
├─────────────────────────────────────────────────────────────┤
│  Name          │ Sort │ Active │ Products │ Actions         │
│  Blue Cut      │  10  │  ●     │  8       │ Edit · ⋯        │
│  Green         │  20  │  ●     │  3       │ Edit · ⋯        │
└─────────────────────────────────────────────────────────────┘
```

| Action | Behaviour |
|--------|-----------|
| Sync from products | Upsert chips for distinct `LensCoating`s used by parents linked to cards in this family (do not overwrite admin sort/active on existing rows) |
| Add / Edit | Pick from `LensCoating` attribute master (or create chip pointing at existing coating). Prefer **select existing attribute**, not free text |
| Activate / Deactivate | Controls shop chip visibility |
| Merge (if feasible v1) | Move chip → another; optional. Can phase to v1.1 if heavy |
| Delete / Hide | Same safety spirit as legacy |

### 4.3 Level 3 — Products on a card

**Route:** `/inventory/storefront-catalog?family=SV&card=<id>`

```
┌─────────────────────────────────────────────────────────────┐
│  ← Cards    BLUE CUT · SV                                   │
│  12 products · Active                                       │
│  [ + Add product ]  [ + Add existing ]                      │
├─────────────────────────────────────────────────────────────┤
│  Search…                                                    │
├─────────────────────────────────────────────────────────────┤
│  Product (attr summary)     │ Variants │ Active │ Open      │
│  SV · 1.56 · Blue Cut · …   │    3     │  ●     │ Catalog → │
│  …                          │    2     │  ●     │ Catalog → │
└─────────────────────────────────────────────────────────────┘
```

| Action | Behaviour |
|--------|-----------|
| **Add product** | Navigate to Products & catalog **create** (`/inventory/products-catalog/new` or equivalent) with query `family` + `storefrontCardId`. On successful create → create `StorefrontCardProduct` link. Return to this Level 3. |
| **Add existing** | Picker of **active** `LensProduct` in same family **not** already on any card. Multi-select → link. |
| Open Catalog | Link to `/inventory/products-catalog/[id]` (setup SoT). |
| Unlink (recommended) | Remove from card only; do not delete product. |
| Search | Filter linked parents by name/attrs. |

**Do not** show free-edit quantity on this table. Stock lives under Stocks → Stock by Product matrix / power-wise.

### 4.4 Breadcrumb / URL restore

Mirror legacy: deep-linkable levels so back from “Add product” restores family + card (`?family=&card=`).

### 4.5 Stock by Product (rename only)

Sidebar label: **Stock by Product**  
Subtitle can stay ops-focused (“Open live 2D power matrix…”).  
Page title on `/inventory/stock-overview` should match. No behaviour change in this ticket.

---

## 5. Schema (new — proposed names)

Implement in `prisma/schema.prisma` + migration. Names can vary; semantics fixed.

```prisma
/// Merchandising card customers see under a family (Storefront Catalog).
model StorefrontCard {
  id          String   @id @default(cuid())
  familyId    String
  family      LensFamily @relation(...)
  name        String
  description String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  products    StorefrontCardProduct[]

  @@unique([familyId, name])
  @@index([familyId, isActive, sortOrder])
}

/// Exclusive membership: one LensProduct on at most one card (v1).
model StorefrontCardProduct {
  id             String @id @default(cuid())
  storefrontCardId String
  storefrontCard StorefrontCard @relation(...)
  lensProductId  String @unique
  lensProduct    LensProduct @relation(...)
  sortOrder      Int @default(0)
  createdAt      DateTime @default(now())

  @@unique([storefrontCardId, lensProductId])
  @@index([storefrontCardId, sortOrder])
}

/// Shop coating chips for a family — presentation over LensCoating.
model StorefrontCoatingChip {
  id          String @id @default(cuid())
  familyId    String
  family      LensFamily @relation(...)
  coatingId   String
  coating     LensCoating @relation(...)
  sortOrder   Int @default(0)
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([familyId, coatingId])
  @@index([familyId, isActive, sortOrder])
}
```

**Explicitly do not:**
- Put `quantity` / SPH / CYL on these tables
- Reuse `CatalogProductLine` / `CoatingFilterLabel` as write targets for this feature
- Key storefront membership by free-text parent “line name”

Optional later: image URL on `StorefrontCard` for richer shop cards.

---

## 6. APIs (admin)

Follow `drishx-api-auth-audit` + `drishx-client-api`. Prefer `/api/admin/storefront/...`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/storefront/families` | Families + card counts (or reuse catalog families) |
| GET | `/api/admin/storefront/cards?familyId=` | List cards (includeInactive for admin) |
| POST | `/api/admin/storefront/cards` | Create card |
| PATCH | `/api/admin/storefront/cards/:id` | Edit / activate / sort |
| DELETE | `/api/admin/storefront/cards/:id` | Safe delete/hide |
| GET | `/api/admin/storefront/cards/:id/products` | Linked parents (+ counts) |
| POST | `/api/admin/storefront/cards/:id/products` | Link existing parent ids |
| DELETE | `/api/admin/storefront/cards/:id/products/:productId` | Unlink |
| GET | `/api/admin/storefront/coatings?familyId=` | Chips for family |
| POST | `/api/admin/storefront/coatings` | Add chip (coatingId + familyId) |
| PATCH | `/api/admin/storefront/coatings/:id` | Edit sort/active |
| POST | `/api/admin/storefront/coatings/sync?familyId=` | Sync from linked products’ coatings |
| DELETE | `/api/admin/storefront/coatings/:id` | Safe delete/hide |

**Add product handoff:** extend catalog create accept optional `storefrontCardId`; after parent create, insert `StorefrontCardProduct` in same transaction (or follow-up admin call). Validate family matches card.

Client wrapper: e.g. `app/lib/admin-storefront.ts`.

---

## 7. Customer shop cutover

### 7.1 Today

Web/mobile shop Level 2 cards come from `GET /api/lenses/items` → `listActiveLineNames` / `CatalogProductLine` + dynamic legacy categories  
([`app/lib/wholesale-catalog-counts.ts`](../../app/lib/wholesale-catalog-counts.ts), [`components/shop/shop-items-grid.tsx`](../../../drishx-web-app/components/shop/shop-items-grid.tsx)).

Coatings: `GET /api/lenses/coatings` + `CoatingFilterLabel` intersect.

### 7.2 Target

Public (or authenticated customer) endpoints, e.g.:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/storefront/cards?family=SV` | Active cards + productCount (linked active parents only) |
| GET | `/api/storefront/products?cardId=` | Active parents on card (shop product list fields) |
| GET | `/api/storefront/coatings?family=&cardId=` | Active chips ∩ coatings present on that card’s products |

Wire:
- **Web:** `lib/lenses-api.ts` / shop screens — prefer storefront endpoints for browse levels.
- **Mobile:** same browse entry points.

**Buy/detail path:** Prefer catalog identity (`LensProduct` / variant / power) once listing comes from storefront. If a full buy-path cutover is too large for one PR, ship:

1. PR A — admin Storefront + APIs + shop **card grid** on new API  
2. PR B — shop **product list/detail/cart** fully on catalog leaves  

…but **do not** leave shop cards on legacy lines while admin only manages new cards — that splits SoT. Minimum: Level 2 cards must read `StorefrontCard`.

Empty card (`productCount === 0`): show disabled “No products yet” (same as old `ShopItemCard`).

---

## 8. Implementation phases (suggested PR order)

| Phase | Deliverable | Done when |
|-------|-------------|-----------|
| **P0** | Sidebar split: Stocks / Procurement / Inventory; rename Stock by Product | Nav matches §2; no behaviour change elsewhere |
| **P1** | Prisma models + migration + admin card CRUD APIs | Can create/activate cards per family |
| **P2** | Admin Storefront UI Levels 1–2 (cards tab) | Matches §4.1–4.2 product cards tab |
| **P3** | Link existing parents + Level 3 UI + unlink | Matches §4.3 without Add product |
| **P4** | Add product → catalog create + `storefrontCardId` auto-link | Old “add into this card” UX restored on new SoT |
| **P5** | Coating chips table + admin tab + sync | §4.2 coatings tab |
| **P6** | Public storefront APIs + web shop Level 2 (+ Level 3 list as far as scoped) | Customers see new cards |
| **P7** | Mobile shop same cutover | Parity with web browse |
| **P8** | Mark this slice done in **this** file’s status line if needed. **Do not** rewrite CLIENT-PLAN / DEVELOPER-GUIDE in the implementer PR — doc owner syncs originals later | Feature complete; living contracts updated separately |

Other Stocks pages (power-wise, adjustments, …): **P0 sidebar only**.

---

## 9. Code touchpoints (start here)

| Area | Path |
|------|------|
| Sidebar | `components/admin-sidebar.tsx` |
| Legacy Overview UX reference | `app/(admin)/inventory/stock-overview/legacy/` |
| Current ops matrix hub | `app/(admin)/inventory/stock-overview/page.tsx`, `[id]/page.tsx` |
| Catalog create SoT | `app/(admin)/inventory/products-catalog/`, `app/lib/catalog/lens-product-service.ts`, `app/lib/admin-lens-catalog.ts` |
| Legacy shop cards | `app/lib/catalog-product-lines.ts`, `app/lib/wholesale-catalog-counts.ts`, `app/api/lenses/items/route.ts` |
| Legacy coatings | `app/lib/coating-filter-labels.ts`, `app/api/lenses/coatings/route.ts` |
| Web shop | `drishx-web-app/components/shop/*`, `lib/lenses-api.ts` |
| Mobile shop | `drishx-mobile-app` shop / lenses API wrappers |

Follow skills: `drishx-repo`, `drishx-nextjs`, `drishx-prisma`, `drishx-api-auth-audit`, `drishx-client-api`.

---

## 10. Acceptance checklist

### Nav
- [ ] Three sidebar groups: Stocks, Procurement, Inventory
- [ ] Storefront Catalog under Inventory
- [ ] Stock by Product label for former Stock Overview matrix hub
- [ ] Power-wise / adjustments / checks / transactions / cart / POs / suppliers only relocated (or relabeled), not redesigned

### Storefront admin
- [ ] 3-level browse: Family → Cards → Products
- [ ] Create / edit / activate / sort cards
- [ ] Add existing catalog parents to a card (same family; exclusive)
- [ ] Add product opens catalog create and auto-links to card
- [ ] Unlink does not delete `LensProduct`
- [ ] Coating chips CRUD + sync; chips tied to `LensCoating`
- [ ] Inactive card hidden from shop APIs
- [ ] No free-edit stock qty on Storefront screens
- [ ] No writes to `CatalogProductLine` / `CoatingFilterLabel` for this feature

### Shop
- [ ] Web Level 2 cards from `StorefrontCard` (active)
- [ ] Mobile same
- [ ] Empty cards disabled with clear copy
- [ ] Coating chips respect storefront chip active + product coatings on card

### Non-goals this work
- [ ] No redesign of Stock by Product matrix logic
- [ ] No multi-warehouse / transfers
- [ ] No parent on multiple cards
- [ ] No legacy lens row creation from Storefront

---

## 11. Open / non-blocking

1. Exact URL style: query `?family=&card=` vs path segments.  
2. Card image upload in v1 or later.  
3. Coating **merge** UX in v1 vs v1.1.  
4. How far shop detail/cart moves off legacy in the same milestone vs follow-up PR (Level 2 cutover is mandatory).  
5. GST/HSN on old `CatalogProductLine` — if still needed on cards, add optional fields on `StorefrontCard` when finance asks (not blocking UI).

---

## 12. One-line brief for the implementing developer

> Split the sidebar into Stocks / Procurement / Inventory; rename today’s overview to Stock by Product (leave matrix logic); build Storefront Catalog as the old 3-level merchandising Overview on new `StorefrontCard` + links to `LensProduct` + `StorefrontCoatingChip`→`LensCoating`; Add product = catalog create + link; then point web/mobile shop cards at the new storefront APIs. Implement from **this** file only — **do not** rewrite CLIENT-PLAN / DEVELOPER-GUIDE; the doc owner updates those originals later as each slice finishes.
