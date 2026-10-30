# Stock management & procurement — Client plan

**Document type:** Stock + purchase order plan  
**Repos:** Admin panel (primary). Shared backend APIs.  
**Depends on:** [Product catalog](../product-catalog/CLIENT-PLAN.md) (attributes + products + matrix shell — approved / implemented)  
**Feedback source:** [stock-management-notes.md](../stock-management-notes.md)

This plan describes the **finished** stock and procurement experience. Product catalog stays the place Admin defines products; stock and POs operate on those products’ powers.

---

## 1. Goal

1. Treat each **catalog product** as the hub for stock (open product → live power matrix).  
2. Hold quantity **power by power** (e.g. SPH −2.00 / CYL 0.00), not only at product/range level.  
3. Change stock in **exactly two ways**: purchase receipt and controlled stock adjustment.  
4. Run **purchase orders** from reorder needs through receive → confirm → close.  
5. Give Admin a clear **Stock Management** area (overview, power-wise list, transactions, receipts, adjustments, reorder, reports).

Shop / mobile order cutover to the new stock leaves can follow once admin stock is stable.

---

## 2. In scope / out of scope

### In scope

- Live **product matrix**: Current / Threshold / Target per SPH×CYL cell (Current not free-edited)  
- **Power stock** under each catalog product (lazy: a cell can show 0 until first receipt or adjustment)  
- **Stock Overview**, **Power-wise Inventory**, **Stock Transactions**  
- **Purchase Orders** (create → review → approve → sent → receive → confirm → close)  
- **Purchase Receipts** (bill + power Excel → validate → reconcile → confirm)  
- **Stock Adjustments** (form with reason and audit)  
- **Reorder Rules** + manual **Run reorder** → queue → add to PO  
- **Returns & Replacements** remain available; stock effects use the same power identity  
- Single warehouse (**Main**) for v1, with room to add locations later  
- Stock **reports** (movement, shortages, discrepancies) as part of the suite  

### Out of scope (this phase)

- Multi-location **Stock Transfers** as a full module (design allows later)  
- Full WMS (QC quarantine, put-away, pick paths)  
- Free-edit quantity on any screen  
- Customer website / mobile rewrite to new leaves (follow-on)  
- Auto-creating a PO without Admin approve  
- Pixel-cloning external ERP UIs — DrishX admin chrome  

---

## 3. Core concepts

| Concept | Meaning |
|---------|---------|
| **Catalog product** | Family · Base · Material · Index · Coating · Color + **power range** + auto SKU (from product catalog) |
| **Power stock** | One stock unit inside that product’s range (e.g. SPH −2.00 / CYL 0.00) with quantity and reorder thresholds |
| **Matrix** | Excel-style SPH × CYL sheet for one product; each cell shows **Current / Threshold / Target** |
| **Purchase receipt** | Goods against a PO; only **Confirm Receipt** adds accepted qty to stock |
| **Stock adjustment** | Counted vs current, reason, ± units; who / when / resulting balance recorded |

```
        Attributes → Catalog product (range + auto SKU)
                            │
                            ▼
                 Power matrix (0.25 steps)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     Purchase receipt              Stock adjustment
     (Confirm Receipt)             (reason + audit)
              │                           │
              └─────────────┬─────────────┘
                            ▼
                   Power stock quantity
                            │
                            ▼
              Transactions · Reorder · Reports
```

---

## 4. Stock Management modules

| # | Module | What Admin does |
|---|--------|-----------------|
| 1 | **Stock Overview** | See physical, reserved, available, shortages — filter by catalog attributes |
| 2 | **Power-wise Inventory** | Search every power (product + SPH/CYL + qty); open product matrix |
| 3 | **Stock Transactions** | Ledger: receipts, sales deductions, returns, adjustments |
| 4 | **Purchase Receipts** | Receive against POs; accepted / rejected / short / extra |
| 5 | **Stock Adjustments** | Opening counts, physical count, damage, loss, corrections |
| 6 | **Returns & Replacements** | Customer / supplier returns (existing ops; tied to same powers) |
| 7 | **Stock Transfers** | Later — between locations (v1 = Main warehouse only) |
| 8 | **Reorder Rules** | Min / target per power; Run reorder; suggestions into PO |
| 9 | **Stock Reports** | Movement history, shortages, discrepancies |

Procurement **Purchase Orders** sit beside these (create / approve / send / receive).

---

## 5. Two ways to update stock

Quantity is **never** a simple editable field (no “change 20 → 25” with no reason).

### 5.1 Purchase receipt

```
PO open / sent
    → Receive shipment
    → Upload Supplier Bill + Power-wise Excel
    → Validate → Reconcile (power + range)
    → Confirm Receipt
    → Accepted qty added to power stock
```

Upload / validate / reconcile **do not** post stock. Only **Confirm Receipt** does.

### 5.2 Stock adjustment

Illustrative form:

| Field | Example |
|-------|---------|
| Product / power | `SV · HC · Plain · 1.56` · SPH −2.00 / CYL 0.00 |
| Current quantity | 20 |
| Counted quantity | 18 |
| Reason | Physical stock count discrepancy |
| Quantity adjustment | −2 |
| Resulting balance | 18 |

Record: who submitted, when, resulting balance.  
**(Open for build):** whether a second person must approve, or Admin can apply with audit only.

---

## 6. Product matrix (live stock)

**Where:** Product catalog → open product (same screen as today’s matrix shell).

**Header:** Product name, auto SKU, attribute summary, range.

**Grid:** SPH × CYL at **0.25** steps from the product range.

| Cell | Meaning |
|------|---------|
| **Current** | On-hand for that power (0 if never stocked yet) — **not** typed freely |
| **Threshold** | Reorder min (editable with permission) |
| **Target** | Desired level after replenish (editable with permission) |

Below threshold → highlight (e.g. red/pink).  
Large grids scroll with sticky SPH / CYL headers.

```
┌──────────────────────────────────────────────────────────┐
│  Hard Coat Single Vision +     SKU: SV-HC-PLAIN-…        │
│  HC · Plain · 1.56 · SPH 0…+10 · CYL 0…+4                │
├─────────┬──────────┬──────────┬──────────┬─────          │
│ SPH\CYL │    0     │  +0.25   │  +0.50   │ …             │
├─────────┼──────────┼──────────┼──────────┼─────          │
│  0      │ 2/5/10   │ 0/5/10   │ 0/5/10   │               │
│ +0.25   │ 0/5/10   │ …                                   │
└─────────┴────────────────────────────────────────────────┘
```

---

## 7. Purchase order flow

```
Reorder rules (threshold / target per power)
        │
        ▼
 Manual Run reorder → purchase requirements (queue)
        │
        ▼
 Create PO (Add from queue / search product+power)
        │
        ▼
 Review → Approve → PO OPEN / Sent to supplier
        │
        ▼
 Receive (Bill + Power Excel) → Validate → Reconcile
        │
        ▼
 Confirm Receipt → stock += accepted
        │
        ▼
 Close outstanding (with reason) if needed → PO CLOSED
        │
        ▼
 That power may enter reorder again
```

### Hard rules

1. **Manual** Run reorder — Admin clicks; no silent auto-PO.  
2. Stock work is **power-wise**; range is for display / bill consolidation.  
3. Matrix **Current** is not free-edited.  
4. While a PO is **open** for a power, do **not** create another PO for that same power.  
5. Stock updates **only** on Confirm Receipt (or via Stock Adjustment).  
6. Partial receive: Keep Open or **Close Outstanding** with a reason (supplier unable to supply, discontinued, cancelled balance, commercial disagreement, buyer cancellation, other).  
7. Warehouse v1 = **Main** (extensible later).

### Create PO (UI intent)

Stepper: **Select items → Review → Approve**

- Supplier, expected delivery, warehouse  
- Lines: Product, Range, Power, Required, PO Qty, Rate, Amount  
- Actions: Add from Reorder Queue, search, Save Draft, Next, Approve  
- After approve: PO reference, downloads (PDF/Excel), mark sent  

### Receive goods (UI intent)

Stepper: **Select PO → Upload → Validate → Reconcile → Confirm**

- Uploads: Supplier Bill + Power-wise Excel  
- Reconciliation tabs: All / Matched / Short / Extra / Invalid  
- Range-wise bill vs Excel mismatch resolution  
- Confirm dialog states units to add and remaining outstanding  

---

## 8. Data shape (plain language)

```
Catalog product
  └── Power stock rows (as needed)
        ├── quantity (current)
        ├── threshold (min)
        ├── target
        └── history via stock transactions

Purchase order
  └── Lines (product + power + qty)
        └── Goods receipts → lines → on Confirm → power stock ↑

Stock adjustment
  └── One power → ± qty + reason → transaction + new balance
```

Powers inside a product’s range may appear in the matrix as **0 / threshold / target** before any stock row exists; the first receipt or adjustment creates the working stock for that cell.

---

## 9. Admin navigation (target)

Under Inventory / Procurement (labels can match build):

- Products & catalog (existing) → product detail **live matrix**  
- Stock Overview  
- Power-wise Inventory  
- Stock Matrix entry can deep-link into catalog products  
- Stock Transactions  
- Stock Adjustments  
- Purchase Orders (+ receive)  
- Procurement / reorder queue  
- Suppliers  
- Stock Reports (or under Reports hub)  
- Returns & Replacements (existing)

---

## 10. APIs (capability view)

Client-facing summary of what the backend will support (paths may use `/api/admin/...` or `/api/procurement/...` in build):

| Area | Capabilities |
|------|----------------|
| Product stock | Get matrix for product (current / threshold / target); patch threshold/target |
| Power inventory | List/search powers; get one power position (on hand, reserved, available, incoming) |
| Adjustments | Create adjustment (counted, reason); list history |
| Transactions | Paginated ledger filtered by product / power / type / date |
| Reorder | List/update rules; Run reorder; list requirements queue |
| Purchase orders | CRUD draft; submit; approve; mark sent; PDF/Excel; close outstanding |
| Receipts | Create draft receipt; upload bill/excel; validate; reconcile; confirm; cancel draft |

Exact routes are in the developer guide.

---

## 11. Phased delivery (for planning)

| Phase | Outcome |
|-------|---------|
| **S1** | Live matrix on catalog product (current / threshold / target) |
| **S2** | Stock Adjustment + transactions for adjustments |
| **S3** | POs and Confirm Receipt post to catalog power stock |
| **S4** | Overview, power-wise list, Run reorder on catalog powers |
| **S5** | Reports + polish; returns stock effects aligned |

Transfers / multi-location after Main warehouse is solid.

---

## 12. Acceptance

- [ ] Opening a catalog product shows a live SPH×CYL matrix with Current / Threshold / Target  
- [ ] Current quantity cannot be typed freely on the matrix  
- [ ] Stock increases via Confirm Receipt on a PO  
- [ ] Stock can change via Stock Adjustment with reason and audit  
- [ ] Open PO blocks a second PO for the same power until closed  
- [ ] Run reorder is manual and feeds the PO queue  
- [ ] Stock Overview and Power-wise Inventory filter by catalog product attributes  
- [ ] Stock Transactions show receipts and adjustments  
- [ ] Single Main warehouse in v1  

---

## 13. Open points (non-blocking)

1. Stock adjustment: dual approval vs Admin apply + audit only.  
2. Receive Excel final column template (lock before receive parse is finished).  
3. Whether “Send PO via Email” is live or stub in first release.  
4. Timing of shop/mobile cutover to new power stock (after S3–S4).
