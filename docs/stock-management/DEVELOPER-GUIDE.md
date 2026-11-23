# Stock management & procurement — Developer guide

**Companion:** [CLIENT-PLAN.md](./CLIENT-PLAN.md) (product contract — do not contradict without updating both)  
**Catalog:** [../product-catalog/DEVELOPER-GUIDE.md](../product-catalog/DEVELOPER-GUIDE.md) + [CLIENT-PLAN.md](../product-catalog/CLIENT-PLAN.md)  
**Notes:** [../stock-management-notes.md](../stock-management-notes.md)  
**Legacy tracker:** [../remaining-work.md](../remaining-work.md) → RW-08 (keep **rules**; replace **identity** with catalog stock leaf)

**Repos:** `drishx-admin-backend`  
**Data note:** Development phase — no production stock to preserve. Prefer clean identity under catalog; dual-write to legacy lens rows only if shop/orders still require `lensType`+`lensId` until cutover.

**Locked stock identity:** `(lensProductVariantId, sph, cyl)` — axis / ADD / eye / parent attrs / range come from the variant (+ parent). Do **not** key stock by parent + duplicated optical dims.

**Source of truth:** new multi-layer catalog (`LensProduct` / variants / `catalog-matrix.ts` + `CatalogMatrixPanel`). Stock = **same matrix**, triad editable when rules API is live. Cross Style B (`allowed: false` → disabled ×) is already on that shell — do **not** re-implement it on legacy stock-matrix.

**Do not touch (this phase):** `/inventory/stock-matrix`, `app/lib/stock-matrix.ts` band expansion for cross, or legacy lens-table identity — leave until cutover / redirect. All new stock matrix work goes on catalog parent detail.

---

## 0. How to use this doc

1. Read **CLIENT-PLAN.md** for the target experience (do not expose migration language to the client).  
2. Read **product-catalog** docs for parent / variant / matrix shell — stock binds live qty onto that matrix.  
3. Implement **phases S1→S5** below.  
4. **Reuse** PO / receive / open-power-lock / Confirm-only post — do not rewrite from scratch.  
5. **Rebind** stock identity from legacy `lensType`+`lensId` to **variant + SPH + CYL** leaf (when wiring movements/PO — not by editing the old stock-matrix grid).  
6. Follow `drishx-api-auth-audit`, `drishx-client-api`, `drishx-prisma`.  
7. Never add a free-edit `quantity` field in UI. Stock moves only via audited events (CLIENT-PLAN §5).  
8. Do **not** port Cross Style B or triad editing into legacy `/inventory/stock-matrix` — redirect/replace later if needed.

---

## 1. Target architecture

```
LensFamily / Base / Material? / Index? / Coating? / Color? / Diameter? / ProgressiveType?
                    │
                    ▼
              LensProduct                 (parent — attrs only)
                    │ 1 → many
                    ▼
           LensProductVariant             (sellable: range × axis? × ADD? × eye? · SKU)
                    │ 1 → many (lazy)
                    ▼
           LensProductPower               (NEW — stock leaf)
              @@unique([lensProductVariantId, sph, cyl])
              quantity, blockedQty, minStock, targetStock
                    │
        ┌───────────┼───────────┬──────────────┐
        ▼           ▼           ▼              ▼
  StockMovement  ReorderRule  PO Line      StockAdjustment
  (ledger)       (+ Run)      + Receipt    (controlled)
```

**Warehouse v1:** `warehouseCode = "MAIN"` (already on PO / receipt).

**Lazy leaves:** Parent matrix renders every 0.25 cell covered by sibling variants (same `buildCatalogMatrix` coverage). Cross Style B: gap-fail cells stay on the sheet as `allowed: false` — no leaf, no triad edit. Missing `LensProductPower` on an allowed cell → display current `0`. Insert/update leaf on first adjustment, Confirm Receipt, or threshold/target save.

**Labels:** Resolve `variant → product` for parent attrs; use `variant.skuCode` / `name` + SPH/CYL (+ variant.axis / addition / eye) on PO, power-wise, and adjustment screens.

---

## 2. What already exists (code map)

### 2.1 Catalog (keep — hub)

| Area | Path |
|------|------|
| `LensProduct` + `LensProductVariant` + attributes | `prisma/schema.prisma`, seed `seed-lens-catalog-attributes.ts` |
| Admin UI | `/inventory/attributes`, `/inventory/products-catalog`, `/new`, `/[id]`, `/variants/[id]` |
| APIs | `/api/admin/catalog/attributes/*`, `/api/admin/catalog/power-ranges/*`, `/api/admin/catalog/lens-products/*` |
| SKU / name | `app/lib/catalog/lens-product-sku.ts` |
| Matrix shell | `app/lib/catalog/catalog-matrix.ts`, `CatalogMatrixPanel` — Current/Threshold/Target triad; Cross Style B (`allowed: false` → disabled ×); pass `editable` when rules API is live |
| Client wrappers | `app/lib/admin-lens-catalog.ts` |

### 2.2 Procurement / stock (reuse behaviour, rebind identity)

| Area | Path |
|------|------|
| PO UI | `app/(admin)/procurement/purchase-orders/` (+ `new`, `[id]`, `[id]/receive`) |
| PO APIs | `app/api/procurement/purchase-orders/**` |
| Receipts | `app/api/procurement/receipts/**`, confirm route |
| Services | `app/lib/admin-procurement.ts`, `procurement-requests.ts`, `procurement-rules.ts`, `procurement-documents.ts`, `procurement-lens.ts` |
| Reorder UI | `app/(admin)/inventory/power-wise-stock/page.tsx` |
| Stock matrix (legacy — **leave alone** this phase) | `app/(admin)/inventory/stock-matrix/`, `app/lib/stock-matrix.ts` — not SoT; later redirect to catalog parent |
| Stock overview | `app/(admin)/inventory/stock-overview/` |
| Requests queue | `app/(admin)/procurement/requests/` |
| Order shortage queue | `app/(admin)/orders/procurement/` |
| Suppliers | `app/(admin)/procurement/suppliers/` |
| Stock post patterns | `app/lib/stock-intake.ts` (or confirm-receipt path) |
| Prisma | `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt*`, `OpenPurchaseOrderPower`, `ReorderRule`, `ProcurementRequest`, `StockMovement` |

### 2.3 Identity problem (why client rejected the old story)

| Today | Target |
|-------|--------|
| PO line / reorder / movement / lock keyed by `lensType` + `lensId` (legacy lens tables) | Keyed by **`lensProductPowerId`** where leaf = **variant + sph + cyl** |
| Stock matrix products = string-group of legacy leaves | Matrix = **`LensProduct`** parent detail (family sheets) |
| Catalog matrix display-only | Same route / panel, **live** C / T / Target from leaves |
| Flat “product = attrs + range + SKU” language | Parent attrs + **variants**; SKU on variant; stock on cell |
| No first-class Stock Adjustment module | Controlled adjustment API + UI |
| Modules feel scattered | Suite under catalog-centered navigation |

**Keep:** Confirm-only stock post, open-PO power lock, bill+Excel receive, manual Run reorder, close-outstanding reasons, PO statuses, reorder math.

**Change:** Foreign keys / lookups / UI product pickers / matrix data source → variant leaf.

**Do not:** Delete PO tables and rewrite from zero; do not free-edit `quantity`; do not invent a parent-only optical unique key that re-stores axis/ADD/eye.

---

## 3. Schema changes

### 3.1 New: `LensProductPower` (name can vary; semantics fixed)

```prisma
model LensProductPower {
  id                    String   @id @default(cuid())
  lensProductVariantId  String
  lensProductVariant    LensProductVariant @relation(...)
  /// Exact cell inside the variant’s power range (0.25 grid)
  sph                   Decimal  @db.Decimal(6, 2)
  cyl                   Decimal  @db.Decimal(6, 2)
  quantity              Int      @default(0)   // on hand
  /// reserved: derive from open orders OR store — pick one and document in code
  blockedQty            Int      @default(0)   // discrepancy hold until Admin adjusts
  minStock              Int      @default(0)   // threshold
  targetStock           Int      @default(0)
  /// Optional bridge while shop still uses legacy leaves
  legacyLensType        LensType?
  legacyLensId          String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([lensProductVariantId, sph, cyl])
  @@index([lensProductVariantId])
  @@index([legacyLensType, legacyLensId])
}
```

**Do not** put `add` / `axis` / `eye` on the leaf for identity — they live on `LensProductVariant`. Denormalize for query/display only if a list screen needs it without joins (optional later).

Add `powers LensProductPower[]` on `LensProductVariant`.

### 3.2 Rebind existing models (migrations)

| Model | Change |
|-------|--------|
| `PurchaseOrderLine` | Add `lensProductVariantId`, `lensProductPowerId`, `sph`, `cyl` (as needed); stop requiring legacy ids once cut over |
| `OpenPurchaseOrderPower` | PK / unique on `lensProductPowerId` instead of `lensType`+`lensId` |
| `GoodsReceiptLine` | Same leaf FK |
| `ReorderRule` | Unique on `lensProductPowerId` |
| `ProcurementRequest` | Point at power leaf |
| `StockMovement` | Prefer `lensProductPowerId`; keep legacy columns only if dual-writing |
| **New** `StockAdjustment` | id, powerId, qtyBefore, countedQty, qtyDelta, qtyAfter, reasonCode, reasonText, submittedById, approvedById?, status, timestamps |

### 3.3 Greenfield stock

No production data to migrate. Prefer:

1. Create leaves under variants as ops use them (lazy).  
2. Leave legacy lens `quantity` alone until shop cutover.  
3. If a demo still needs shop orders: optional dual-write leaf ↔ legacy row via `legacyLensId`.

### 3.4 Catalog attribute lock (hook)

When parent-attr edit is introduced: if any variant of the parent has related `LensProductPower` with activity (or any orders), reject parent attr changes. See product-catalog CLIENT-PLAN §6.7.

---

## 4. APIs (target + reuse)

### 4.1 New / catalog-stock

| Method | Path (proposed) | Purpose |
|--------|-----------------|---------|
| GET | `/api/admin/catalog/lens-products/:id/matrix` | Family sheets + cells: current, min, target (0 if no leaf); each cell must resolve covering `variantId` |
| PATCH | `/api/admin/catalog/lens-products/:id/matrix/rules` | Bulk/single update min/target (upsert leaf by variantId+sph+cyl) |
| GET | `/api/admin/stock/powers` | Power-wise list + filters (parent attrs, variant SKU, q) |
| GET | `/api/admin/stock/powers/:id` | Position: onHand, reserved, available, incoming |
| GET | `/api/admin/stock/transactions` | Ledger |
| POST | `/api/admin/stock/adjustments` | Controlled adjustment |
| GET | `/api/admin/stock/adjustments` | History |
| GET | `/api/admin/stock/overview` | Aggregates / shortages |

Matrix GET should reuse / wrap `buildCatalogMatrix` coverage so SV/KT/V2 sheet layout stays identical to catalog placeholders.

### 4.2 Existing procurement (extend, don’t fork)

Keep `/api/procurement/purchase-orders/**` and `/api/procurement/receipts/**`.

**Code changes inside:**

- Create line / queue add: resolve variant + SPH/CYL → upsert `LensProductPower` → set FKs  
- `OpenPurchaseOrderPower`: lock by `lensProductPowerId`  
- Confirm Receipt: `quantity += accepted` on leaf; write `StockMovement` with new FK  
- Reorder-check: rules + available/reserved/incoming from new leaves + open PO qty  

Reorder-check route today: `app/api/inventory/reorder-check/route.ts`.

### 4.3 Client wrappers

- Extend `admin-lens-catalog.ts` or add `admin-stock.ts`  
- Reuse `admin-procurement.ts` with updated DTOs (variant SKU, parent attrs, SPH/CYL labels)

---

## 5. Admin UI changes & Navigation Structure

Consolidate into a dedicated **Stock & Procurement** section in the admin sidebar:

| Screen | Target Route | Action & Specifications |
|--------|--------------|-------------------------|
| **Stock Overview** | `/inventory/stock-overview` | **Product Card Browser**: Displays product cards (catalog parent level) with stock figures (on-hand, available, active shortages). Clicking a card navigates directly to that product's full **2D Excel matrix** (`/inventory/products-catalog/[id]`). |
| **Power-wise Inventory** | `/inventory/power-wise-stock` | Searchable flat table listing all valid power leaves (SPH/CYL) for all catalog products (including 0-stock unstocked leaves). Row-level threshold/target editing + Run Reorder. |
| **Stock Dashboard / Audit** | `/inventory/stock-dashboard` (or overview KPI mode) | High-level summary KPI cards (total on-hand, reserved, blocked) and top shortage alerts. |
| **Stock Adjustments** | `/inventory/stock-adjustments` | Controlled ± adjustment with mandatory reason codes, negative available guard, and audit trail. |
| **Stock Checks** | `/inventory/stock-checks` | Session-based physical counting with count freeze and blind employee submission. |
| **Stock Transactions** | `/inventory/stock-transactions` | Immutable audit ledger of all stock movements. |
| **Procurement Cart / Queue** | `/procurement/requests` (Cart Mode) | **Admin Purchase Cart**: Consolidates shortages from reorder runs, customer order backorders, and manual power picks across multiple products into supplier-grouped PO creation. |
| **Purchase Orders** | `/procurement/purchase-orders` | Multi-product PO workflow (Draft → Approve → Sent → Receive with Excel reconciliation → Confirm Receipt). |
| **Suppliers** | `/procurement/suppliers` | Vendor management and terms. |

### 5.1 Power Matrix Integration (2D Excel Grid)
- **Hub**: `/inventory/products-catalog/[id]` (also accessible when clicking any product card in Stock Overview).
- **Behavior**: Renders `CatalogMatrixPanel` with live `Current / Threshold / Target` triad per cell.
- **Unstocked Leaves**: Any valid cell with no database row must display `Current: 0` (never omitted from the grid).
- **Bulk / Multi-cell Reordering**: Admin can pick multiple powers or entire bands directly on the sheet to send into the Procurement Cart.

### 5.2 Procurement Cart Flow (Multi-Product Orders)
- Instead of single-product PO creation, the Admin uses the **Procurement Cart / Shortage Queue** (`/procurement/requests`).
- Collects power shortages from multiple products simultaneously (e.g. 15 Single Vision powers + 8 Blue Cut powers + 4 Progressive powers).
- Groups lines by **Supplier** $\rightarrow$ generates a single comprehensive PO containing all selected products and powers.

**UI styles:** Match existing admin inventory / catalog patterns (`AdminPage`, brand card borders, `AdminSelect`, matrix panel). Do not invent a separate visual system.

---

## 6. Behaviour rules (must preserve)

From RW-08 / CLIENT-PLAN — do not regress:

1. Manual Run reorder only; consolidated queue; draft editable before approve.  
2. Leaf-wise stock truth; variant/range for grouping/bills/SKU label.  
3. Current not free-editable.  
4. Open PO → no second PO for same leaf; expose **incoming** on UI/API.  
5. On-hand posts: Confirm Receipt (**accepted** only) + Stock Adjustment / stock check + pack deduct + return/reversal. Available also changes via reserve/release / blocked. Never free-edit qty.  
6. Close outstanding with reason list.  
7. Incoming = outstanding qty on open PO lines for that leaf.  
8. Reorder math per **§6.1** (available + incoming; never double-count reserved).  
9. Reject adjustments that would make available &lt; 0.  
10. Stock check: Employee API must **not** return system qty; Admin verifies.  
11. Open count session → **freeze** stock mutations on those leaves until complete.  
12. Pick short → blocked/discrepancy until Admin adjusts.  
13. Full audit on every stock-affecting mutation.  
14. Two variants that cover similar powers remain **separate** leaves (keyed by `variantId`).

Client follow-ons: [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md) — do not implement inside S1–S5 unless stock hooks only.

### 6.1 Reorder calculation (implement exactly)

Align with [CLIENT-PLAN §8.1](./CLIENT-PLAN.md). Existing helpers in `app/lib/procurement-rules.ts` already use:

- gate: `available <= minStock` (`isAtOrBelowMinimum`)
- need: `required = trunc(targetStock - available - incoming)` (`computeRecommendedQuantity` base)

**Definitions (stock leaf):**

```
available = onHand - reserved - blocked
incoming  = sum(outstanding open-PO qty for this leaf)   // OPEN / SENT / PARTIALLY_RECEIVED
```

**Run reorder per leaf:**

```
if openPoExists(leaf):
  skipNewRequirement = true   // still return position for UI
else if available <= threshold:
  required = max(0, target - available - incoming)
  required = max(required, max(0, unreservedShortage - incoming))
  // NEVER add `reserved` into required
  enqueue consolidated queue with required
else:
  skip
```

**Code touchpoints:** `procurement-rules.ts`, `reorder-check` route, `OpenPurchaseOrderPower` (rebind to `lensProductPowerId`), power-wise + Run reorder UI columns for incoming.

---

## 7. Phases (implement in order)

### S1 — Live matrix on `LensProduct` parent

- Add `LensProductPower` migration (`variantId` + `sph` + `cyl`)  
- GET matrix + PATCH rules (upsert leaf; reject `allowed: false` / cross gap-fail cells)  
- Wire parent detail UI (`CatalogMatrixPanel` live values + `editable`) — shell + Cross Style B already exist  
- Do **not** change legacy `/inventory/stock-matrix` in S1  

**Done when:** Admin opens a catalog parent and sees real C/T/Target on family sheets; threshold/target save creates/updates leaf; disabled cross cells stay non-editable.

### S2 — Stock Adjustment + movements + guards

- `StockAdjustment` model + API + UI  
- Post qty + `StockMovement` + audit  
- Negative-available guard  
- Reason codes: physical_mismatch, damaged, counting_error, wrong_entry, other  

**Done when:** Adjustment changes current; appears in transactions; illegal −qty rejected.

### S2b — Stock Check + freeze

- Count session model (leaves, status, frozen leaf ids)  
- Employee submit counted qty only (strip live qty from responses)  
- Admin verify → create adjustment  
- Block Confirm Receipt / other adjusts on frozen leaves  

**Done when:** End-to-end count → verify → adjust → unfreeze.

### S3 — Rebind PO + Confirm Receipt

- Lines / locks / receipt lines use `lensProductPowerId` (+ variant/sph/cyl as needed)  
- Accept/reject lines; only accepted updates on hand  
- Dual-write to legacy **only** if still required for orders  

**Done when:** PO → receive → confirm updates catalog stock leaf; open-PO lock works.

### S4 — Overview, power-wise, reserved/blocked, Run reorder

- ReorderRule on new leaf; reorder-check implements **§6.1**  
- Show incoming; skip new requirement when open PO exists  
- Overview + power-wise; pick-discrepancy → blocked  

**Done when:** Example (available 10, incoming 10, open PO) creates no second PO and shows incoming; required formula matches CLIENT-PLAN.

### S5 — Reports + polish

- Stock reports on new movements  
- Returns stock hooks use leaf id (full returns UX = follow-on)  
- Hide legacy-only stock-matrix if replaced  

---

## 8. Testing checklist

- [ ] Matrix cell coverage matches catalog family sheets; missing leaf shows 0 current  
- [ ] Leaf unique on `(variantId, sph, cyl)`; axis/ADD/eye not required on leaf row  
- [ ] Cannot PATCH quantity directly via a public “set qty” admin field  
- [ ] Adjustment: before/after + reason + actor; available cannot go negative  
- [ ] Employee stock-check response has no system qty  
- [ ] Frozen leaves reject concurrent stock posts  
- [ ] Confirm Receipt posts accepted only; rejected stays out  
- [ ] Confirm Receipt idempotent (`confirmationKey`)  
- [ ] Second PO for same leaf while open → rejected  
- [ ] Reorder: `required = max(0, target - available - incoming)` (+ unreserved shortage max); reserved not added again  
- [ ] Open PO → no second requirement; API/UI returns **incoming**  
- [ ] Two variants with overlapping numeric powers keep separate stock piles  
- [ ] Legacy shop order path still works until explicit cutover  

---

## 9. Suggested PR order

1. `LensProductPower` (variant+sph+cyl) + matrix GET/PATCH + parent detail UI (S1)  
2. StockAdjustment + transactions + available guard (S2)  
3. Stock Check session + freeze + employee/admin APIs (S2b)  
4. PO/receipt/reorder FK rebind + confirm accepted-only (S3)  
5. Overview / power-wise / reserved-blocked / Run reorder (S4)  
6. Reports + cleanup (S5)  

---

## 10. Open engineering decisions

1. Reserved: store column vs derive from open order lines (document choice in code).  
2. Dual-write to `SingleVisionLens.quantity` during S3 — yes/no (default **no** if shop not demoing stock).  
3. Freeze granularity: all leaves under parent vs leaves on the count sheet.  
4. Deprecate `/inventory/stock-matrix` vs keep as product list facade.  
5. When shop/cart switch to `lensProductPowerId` (separate cutover RW).  
6. Order/returns/WAC follow-ons — see CLIENT-FOLLOW-ONS.md.  
7. Matrix cell → covering variant resolution when UI paints parent sheets (must pick the variant that owns the cell for live qty).
