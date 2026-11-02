# Stock management & procurement — Developer guide

**Companion:** [CLIENT-PLAN.md](./CLIENT-PLAN.md) (product contract — do not contradict without updating both)  
**Catalog:** [../product-catalog/DEVELOPER-GUIDE.md](../product-catalog/DEVELOPER-GUIDE.md)  
**Notes:** [../stock-management-notes.md](../stock-management-notes.md)  
**Legacy tracker:** [../remaining-work.md](../remaining-work.md) → RW-08 (keep **rules**; replace **identity** with `LensProduct` + power leaf)

**Repos:** `Drishx-admin-and-backend`  
**Data note:** Development phase — no production stock to preserve. Prefer clean identity under catalog; dual-write to legacy lens rows only if shop/orders still require `lensType`+`lensId` until cutover.

---

## 0. How to use this doc

1. Read **CLIENT-PLAN.md** for the target experience (do not expose migration language to the client).  
2. Implement **phases S1→S5** below.  
3. **Reuse** PO / receive / open-power-lock / Confirm-only post — do not rewrite from scratch.  
4. **Rebind** stock identity from legacy `lensType`+`lensId` to **catalog product + power** (new leaf table).  
5. Follow `drishx-api-auth-audit`, `drishx-client-api`, `drishx-prisma`.  
6. Never add a free-edit `quantity` field in UI. Stock moves only via audited events: Confirm Receipt (accepted), Stock Adjustment / stock check, reserve/release, pack deduct, return/reversal (see CLIENT-PLAN §5).

---

## 1. Target architecture

```
LensFamily / Base / Material / Index / Coating / Color
                    │
                    ▼
              LensProduct          (catalog — already shipped)
                    │ 1 → many (lazy)
                    ▼
           LensProductPower        (NEW — stock leaf)
              quantity, minStock, targetStock
              sph, cyl, (+ add/axis/eye when needed)
                    │
        ┌───────────┼───────────┬──────────────┐
        ▼           ▼           ▼              ▼
  StockMovement  ReorderRule  PO Line      StockAdjustment
  (ledger)       (+ Run)      + Receipt    (controlled)
```

**Warehouse v1:** `warehouseCode = "MAIN"` (already on PO / receipt).

**Lazy leaves:** Matrix renders every 0.25 cell from `LensProduct` range. Missing `LensProductPower` → display current `0`. Insert/update leaf on first adjustment or Confirm Receipt (and when saving threshold/target if desired).

---

## 2. What already exists (code map)

### 2.1 Catalog (keep — hub)

| Area | Path |
|------|------|
| LensProduct + attributes | `prisma/schema.prisma`, seed `seed-lens-catalog-attributes.ts` |
| Admin UI | `/inventory/attributes`, `/inventory/products-catalog`, `/new`, `/[id]` |
| APIs | `/api/admin/catalog/attributes/*`, `/api/admin/catalog/lens-products/*` |
| SKU | `app/lib/catalog/lens-product-sku.ts` |
| Matrix shell | `[id]/page.tsx` — currently `_ / _ / _` placeholders |
| Client wrappers | `app/lib/admin-lens-catalog.ts` |

### 2.2 Procurement / stock (reuse behaviour, rebind identity)

| Area | Path |
|------|------|
| PO UI | `app/(admin)/procurement/purchase-orders/` (+ `new`, `[id]`, `[id]/receive`) |
| PO APIs | `app/api/procurement/purchase-orders/**` |
| Receipts | `app/api/procurement/receipts/**`, confirm route |
| Services | `app/lib/admin-procurement.ts`, `procurement-requests.ts`, `procurement-rules.ts`, `procurement-documents.ts`, `procurement-lens.ts` |
| Reorder UI | `app/(admin)/inventory/power-wise-stock/page.tsx` |
| Stock matrix (legacy grouping) | `app/(admin)/inventory/stock-matrix/`, `app/lib/stock-matrix.ts` |
| Stock overview | `app/(admin)/inventory/stock-overview/` |
| Requests queue | `app/(admin)/procurement/requests/` |
| Order shortage queue | `app/(admin)/orders/procurement/` |
| Suppliers | `app/(admin)/procurement/suppliers/` |
| Stock post patterns | `app/lib/stock-intake.ts` (or confirm-receipt path) |
| Prisma | `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt*`, `OpenPurchaseOrderPower`, `ReorderRule`, `ProcurementRequest`, `StockMovement` |

### 2.3 Identity problem (why client rejected the story)

| Today | Target |
|-------|--------|
| PO line / reorder / movement / lock keyed by `lensType` + `lensId` (legacy lens tables) | Keyed by **`lensProductPowerId`** (or `lensProductId` + power fields) |
| Stock matrix products = string-group of legacy leaves | Matrix = **`LensProduct`** detail |
| Catalog matrix display-only | Same route, **live** C / T / Target |
| No first-class Stock Adjustment module | Controlled adjustment API + UI |
| Modules feel scattered | Suite under catalog-centered navigation |

**Keep:** Confirm-only stock post, open-PO power lock, bill+Excel receive, manual Run reorder, close-outstanding reasons, PO statuses.

**Change:** Foreign keys / lookups / UI product pickers / matrix data source.

**Do not:** Delete PO tables and rewrite from zero; do not free-edit `quantity`.

---

## 3. Schema changes

### 3.1 New: `LensProductPower` (name can vary; semantics fixed)

```prisma
model LensProductPower {
  id             String   @id @default(cuid())
  lensProductId  String
  lensProduct    LensProduct @relation(...)
  /// Optical cell — SV uses sph/cyl; KT/V2 may set add/axis/eye
  sph            Decimal
  cyl            Decimal
  add            Decimal?
  axis           Int?
  eye            String?
  quantity       Int      @default(0)   // on hand
  /// reserved often derived from open orders; store or compute — pick one and document in code
  blockedQty     Int      @default(0)   // discrepancy hold until Admin adjusts
  minStock       Int      @default(0)   // threshold
  targetStock    Int      @default(0)
  /// Optional bridge while shop still uses legacy leaves
  legacyLensType LensType?
  legacyLensId   String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([lensProductId, sph, cyl, add, axis, eye]) // refine nulls per DB rules
  @@index([lensProductId])
  @@index([legacyLensType, legacyLensId])
}
```

### 3.2 Rebind existing models (migrations)

| Model | Change |
|-------|--------|
| `PurchaseOrderLine` | Add `lensProductId`, `lensProductPowerId` (nullable during transition); stop requiring legacy ids once cut over |
| `OpenPurchaseOrderPower` | PK / unique on `lensProductPowerId` (or product+power) instead of `lensType`+`lensId` |
| `GoodsReceiptLine` | Same power FK |
| `ReorderRule` | Unique on `lensProductPowerId` |
| `ProcurementRequest` | Point at power leaf |
| `StockMovement` | Prefer `lensProductPowerId`; keep legacy columns only if dual-writing |
| **New** `StockAdjustment` | id, powerId, qtyBefore, countedQty, qtyDelta, qtyAfter, reasonCode, reasonText, submittedById, approvedById?, status, timestamps |

### 3.3 Greenfield stock

No production data to migrate. Prefer:

1. Create powers under `LensProduct` as ops use them.  
2. Leave legacy lens `quantity` alone until shop cutover (or zero / ignore for admin stock UI).  
3. If a demo still needs shop orders: optional dual-write leaf ↔ legacy row via `legacyLensId`.

---

## 4. APIs (target + reuse)

### 4.1 New / catalog-stock

| Method | Path (proposed) | Purpose |
|--------|-----------------|---------|
| GET | `/api/admin/catalog/lens-products/:id/matrix` | Cells: current, min, target (0 if no leaf) |
| PATCH | `/api/admin/catalog/lens-products/:id/matrix/rules` | Bulk/single update min/target (upsert leaf) |
| GET | `/api/admin/stock/powers` | Power-wise list + filters (product attrs, q) |
| GET | `/api/admin/stock/powers/:id` | Position: onHand, reserved, available, incoming |
| GET | `/api/admin/stock/transactions` | Ledger |
| POST | `/api/admin/stock/adjustments` | Controlled adjustment |
| GET | `/api/admin/stock/adjustments` | History |
| GET | `/api/admin/stock/overview` | Aggregates / shortages |

### 4.2 Existing procurement (extend, don’t fork)

Keep `/api/procurement/purchase-orders/**` and `/api/procurement/receipts/**`.

**Code changes inside:**

- Create line / queue add: resolve `LensProduct` + power → upsert `LensProductPower` → set FKs  
- `OpenPurchaseOrderPower`: lock by `lensProductPowerId`  
- Confirm Receipt: `quantity += accepted` on `LensProductPower`; write `StockMovement` with new FK  
- Reorder-check: rules + available/reserved/incoming from new leaves + open PO qty  

Reorder-check route today: `app/api/inventory/reorder-check/route.ts`.

### 4.3 Client wrappers

- Extend `admin-lens-catalog.ts` or add `admin-stock.ts`  
- Reuse `admin-procurement.ts` with updated DTOs (product SKU, power labels from catalog)

---

## 5. Admin UI changes

| Screen | Action |
|--------|--------|
| `/inventory/products-catalog/[id]` | Replace `_/_/_` with live matrix from GET matrix; edit threshold/target; no current edit |
| `/inventory/stock-matrix` | Prefer redirect/deep-link to catalog product detail **or** rebuild list as `LensProduct` cards → same matrix |
| `/inventory/power-wise-stock` | List `LensProductPower`; filters by catalog attrs; Run reorder against new rules |
| `/inventory/stock-overview` | Drive from catalog powers / products |
| **New** `/inventory/stock-adjustments` | Form per CLIENT-PLAN + history |
| **New** `/inventory/stock-transactions` | Ledger table |
| PO create / receive | Product picker from `LensProduct`; power picker from range / leaves; labels = catalog SKU + power |
| Sidebar | Group Stock Management entries; keep POs under Procurement |

---

## 6. Behaviour rules (must preserve)

From RW-08 / CLIENT-PLAN — do not regress:

1. Manual Run reorder only; consolidated queue; draft editable before approve.  
2. Power-wise stock truth; range for grouping/bills.  
3. Current not free-editable.  
4. Open PO → no second PO for same power; expose **incoming** on UI/API.  
5. On-hand posts: Confirm Receipt (**accepted** only) + Stock Adjustment / stock check + pack deduct + return/reversal. Available also changes via reserve/release / blocked. Never free-edit qty.  
6. Close outstanding with reason list.  
7. Incoming = outstanding qty on open PO lines for that power.  
8. Reorder math per **§6.1** (available + incoming; never double-count reserved).  
9. Reject adjustments that would make available &lt; 0.  
10. Stock check: Employee API must **not** return system qty; Admin verifies.  
11. Open count session → **freeze** stock mutations on those powers until complete.  
12. Pick short → blocked/discrepancy until Admin adjusts.  
13. Full audit on every stock-affecting mutation.

Client follow-ons (order modify, WAC, etc.): [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md) — do not implement inside S1–S5 unless stock hooks only.

### 6.1 Reorder calculation (implement exactly)

Align with [CLIENT-PLAN §8.1](./CLIENT-PLAN.md). Existing helpers in `app/lib/procurement-rules.ts` already use:

- gate: `available <= minStock` (`isAtOrBelowMinimum`)
- need: `required = trunc(targetStock - available - incoming)` (`computeRecommendedQuantity` base)

**Definitions (catalog power leaf):**

```
available = onHand - reserved - blocked
incoming  = sum(outstanding open-PO qty for this power)   // OPEN / SENT / PARTIALLY_RECEIVED
```

**Run reorder per power:**

```
if openPoExists(power):
  // do NOT create new PR/PO line for this power
  // still return position for UI: available, incoming, threshold, target
  skipNewRequirement = true
else if available <= threshold:  // threshold = minStock
  required = max(0, target - available - incoming)
  // unreserved customer shortage (never reserved):
  required = max(required, max(0, unreservedShortage - incoming))
  // NEVER add `reserved` into required (already excluded from available)
  enqueue consolidated queue with required
else:
  skip
```

**Worked example (client):** onHand 20, reserved 8, blocked 2 → available 10; threshold 12; target 30; incoming 10 on open PO → **skip new PO**; UI shows Incoming 10.  
If no open PO: `required = max(0, 30 - 10 - 0) = 20`.

**Code touchpoints:** `procurement-rules.ts`, `reorder-check` route, `OpenPurchaseOrderPower` (rebind to `lensProductPowerId`), power-wise + Run reorder UI columns for incoming.

---

## 7. Phases (implement in order)

### S1 — Live matrix on `LensProduct`

- Add `LensProductPower` migration (include reserved/blocked fields or compute reserved from orders)  
- GET matrix + PATCH rules (upsert leaf)  
- Wire product detail UI  

**Done when:** Admin opens a catalog product and sees real C/T/Target; threshold/target save.

### S2 — Stock Adjustment + movements + guards

- `StockAdjustment` model + API + UI  
- Post qty + `StockMovement` + audit  
- Negative-available guard  
- Reason codes: physical_mismatch, damaged, counting_error, wrong_entry, other  

**Done when:** Adjustment changes current; appears in transactions; illegal −qty rejected.

### S2b — Stock Check + freeze

- Count session model (product/range, status, frozen power ids)  
- Employee submit counted qty only (strip live qty from responses)  
- Admin verify → create adjustment  
- Block Confirm Receipt / other adjusts on frozen powers  

**Done when:** End-to-end count → verify → adjust → unfreeze.

### S3 — Rebind PO + Confirm Receipt

- Lines / locks / receipt lines use `lensProductPowerId`  
- Accept/reject lines; only accepted updates on hand  
- Dual-write to legacy **only** if still required for orders  

**Done when:** PO → receive → confirm updates catalog power stock; open-PO lock works.

### S4 — Overview, power-wise, reserved/blocked, Run reorder

- ReorderRule on new leaf; reorder-check implements **§6.1**  
- Show incoming; skip new requirement when open PO exists  
- Overview + power-wise; pick-discrepancy → blocked  

**Done when:** Example (available 10, incoming 10, open PO) creates no second PO and shows incoming; required formula matches CLIENT-PLAN.

### S5 — Reports + polish

- Stock reports on new movements  
- Returns stock hooks use power id (full returns UX = follow-on)  
- Hide legacy-only stock-matrix if replaced  

---

## 8. Testing checklist

- [ ] Matrix cell count = stepped range; missing leaf shows 0 current  
- [ ] Cannot PATCH quantity directly via a public “set qty” admin field  
- [ ] Adjustment: before/after + reason + actor; available cannot go negative  
- [ ] Employee stock-check response has no system qty  
- [ ] Frozen powers reject concurrent stock posts  
- [ ] Confirm Receipt posts accepted only; rejected stays out  
- [ ] Confirm Receipt idempotent (`confirmationKey`)  
- [ ] Second PO for same power while open → rejected  
- [ ] Reorder: `required = max(0, target - available - incoming)` (+ unreserved shortage max); reserved not added again  
- [ ] Open PO → no second requirement; API/UI returns **incoming**  
- [ ] Legacy shop order path still works until explicit cutover  

---

## 9. Suggested PR order

1. `LensProductPower` + matrix GET/PATCH + product detail UI (S1)  
2. StockAdjustment + transactions + available guard (S2)  
3. Stock Check session + freeze + employee/admin APIs (S2b)  
4. PO/receipt/reorder FK rebind + confirm accepted-only (S3)  
5. Overview / power-wise / reserved-blocked / Run reorder (S4)  
6. Reports + cleanup (S5)  

---

## 10. Open engineering decisions

1. Exact unique constraint for KT/V2 powers (nullable add/axis/eye).  
2. Dual-write to `SingleVisionLens.quantity` during S3 — yes/no (default **no** if shop not demoing stock).  
3. Freeze granularity: whole product range vs powers on the count sheet.  
4. Deprecate `/inventory/stock-matrix` vs keep as product list facade.  
5. When shop/cart switch to `lensProductPowerId` (separate cutover RW).  
6. Order/returns/WAC follow-ons — see CLIENT-FOLLOW-ONS.md.
