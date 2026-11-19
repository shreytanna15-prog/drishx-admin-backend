# Stock management & procurement — Client plan

**Document type:** Stock + purchase order plan  
**Repos:** Admin panel (primary). Shared backend APIs.  
**Depends on:** [Product catalog](../product-catalog/CLIENT-PLAN.md) — **parent + variants + family matrix** (locked Nov 2026 contract)  
**Feedback source:** [stock-management-notes.md](../stock-management-notes.md)  
**Related (later modules):** [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md)

This plan describes the **finished** stock and procurement experience.  
**Product catalog** defines parents, variants (SKU/name/price), and the matrix shell.  
**Stock** puts live quantity on each **matrix cell** — the deepest pin-point under a variant.

---



## 1. Goal

1. Treat each **catalog parent** as the stock hub (open product → **live** family power matrix).
2. Hold quantity on the **deepest leaf**: one **variant** + one exact **SPH** + one exact **CYL** (axis / ADD / eye already come from that variant).
3. Move stock only through **controlled, audited events** (never free-edit quantity):
  - **Warehouse inbound / correction:** purchase receipt (accepted qty) and stock adjustment / physical stock check  
  - **Order-linked:** reserve and release; **pack deduct** when stock leaves for an order; return / reversal when an order is cancelled or modified after stock was held or deducted (full cancel/modify UX may sit in Orders; stock effects are required here)
4. Run **purchase orders** from reorder needs through receive → confirm → close — always against that same deepest leaf.
5. Track **on hand, reserved, available, blocked** clearly; prevent invalid negative available.
6. Keep a **full audit trail** for every stock change.
7. Give Admin a clear **Stock Management** area (overview, power-wise list, transactions, receipts, adjustments, stock check, reorder, reports).

Shop / mobile order cutover to the new stock leaves can follow once admin stock is stable.

---



## 2. In scope / out of scope



### In scope

- Live **parent matrix** (same family-aware sheets as catalog): Current / Threshold / Target per cell (Current not free-edited)  
- **Stock leaf** per variant × SPH × CYL (lazy: cell can show 0 until first receipt or adjustment)  
- **Stock Overview**, **Power-wise Inventory**, **Stock Transactions**  
- **Purchase Orders** (create → review → approve → sent → receive → confirm → close)  
- **Purchase Receipts** (import receipt Excel + bill → side-by-side vs PO → summary short/extra → Confirm posts accepted qty to sellable stock)  
- **Stock Adjustments** (Admin corrections + bulk where provisioned)  
- **Physical stock check** (Employee counts → Admin verifies → adjustment)  
- **Count freeze** on leaves in an open count session  
- **Reserved / available / blocked**; pack deduct; reserve/release; return/reversal stock effects; pick-short discrepancy  
- **Stock Transactions** ledger covering receipt, pack, reserve/release, adjustment, return/reversal  
- **Reorder Rules** + manual **Run reorder** → consolidated queue → PO (available stock only)  
- Single warehouse (**Main**) for v1  
- Stock **reports** (movement, shortages, discrepancies)  
- **Audit trail** on every stock-affecting action  
- Respect catalog **attribute lock**: once a variant has stock or orders, parent attrs for that product must not be edited (create a new parent combo instead)



### Out of scope (this phase) — see [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md)

- Multi-location **Stock Transfers**  
- Full WMS (QC quarantine, put-away, pick paths as a warehouse system)  
- Free-edit quantity on any screen  
- Order modify / controlled reversal UX  
- Full returns accept/edit cycle UX (stock *effects* stay in rules below where noted)  
- Weighted average purchase cost (Finance)  
- Detailed live vs non-live shop checkout policy (Orders)  
- Customer website / mobile rewrite to new leaves  
- Auto-creating a PO without Admin approve

---



## 3. Core concepts


| Concept                  | Meaning                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Parent**               | Catalog product attrs: Family · Base · Material? · Index? · Coating? · Color? · Diameter? · Progressive type? (only Family + Base required). No SKU on the parent. |
| **Variant**              | Sellable child: parent × power **range** × optional axis × optional ADD × optional eye — has **SKU**, name, price.                                                 |
| **Stock leaf (deepest)** | One matrix cell under a variant: **variant + exact SPH + exact CYL**. Axis / ADD / eye are already on the variant — do not duplicate them on the leaf.             |
| **On hand (current)**    | Physical quantity in system for that leaf                                                                                                                          |
| **Reserved**             | Held for orders (not free to sell again)                                                                                                                           |
| **Available**            | On hand − reserved − blocked (used for reorder and new live sales)                                                                                                 |
| **Blocked**              | Temporarily unavailable (e.g. pick discrepancy until Admin adjusts)                                                                                                |
| **Matrix**               | Same family-aware stacked sheets as catalog (SV / KT / V2); each covered cell shows **Current / Threshold / Target**                                               |
| **Purchase receipt**     | Import what arrived vs PO; only **Confirm Receipt** adds **accepted** qty to on hand                                                                               |
| **Stock adjustment**     | Controlled ± change with reason + audit (Admin, or after stock check)                                                                                              |
| **Stock check**          | Physical count session: Employee enters counted qty; Admin verifies                                                                                                |
| **Reserve / release**    | Order holds available; cancel or unpick releases reserve                                                                                                           |
| **Pack deduct**          | On hand decreases when stock is packed / issued for an order                                                                                                       |
| **Return / reversal**    | Stock returned after cancel-after-pack, return accept, or controlled order reversal                                                                                |


```
Attributes → Parent (attrs)
                 │
                 ▼
           Variants (range + axis? + ADD? + eye? + SKU)
                 │
                 ▼
        Matrix cells = stock leaves
          (this variant · this SPH · this CYL)
          on hand / reserved / available / blocked
                 │
  ┌──────────────┼──────────────┬────────────────┐
  ▼              ▼              ▼                ▼
Purchase     Stock check /   Order reserve    Pack deduct
receipt      adjustment      + release        + return/reversal
(Confirm)    (audited)       (available)      (on hand)
  │              │              │                │
  └──────────────┴──────────────┴────────────────┘
                 ▼
        Stock leaf + audit trail
                 │
                 ▼
  Transactions · Reorder (on available) · Reports
```

**Why not “parent + SPH + CYL + axis + ADD + eye” as the stock key?**  
The variant already carries axis, ADD, eye, and the power range. Pinning **variant + SPH + CYL** is enough for one cell and avoids overkill. Two different variants = two separate stock piles even if numeric powers look similar.

---



## 4. Stock Management modules


| #   | Module                     | What Admin / staff does                                         |
| --- | -------------------------- | --------------------------------------------------------------- |
| 1   | **Stock Overview**         | Physical, reserved, available, blocked, shortages               |
| 2   | **Power-wise Inventory**   | Search every stock leaf; open parent matrix                     |
| 3   | **Stock Transactions**     | Ledger: receipts, sales, returns, adjustments, discrepancy      |
| 4   | **Purchase Receipts**      | Receive against POs; accept / reject short / extra              |
| 5   | **Stock Adjustments**      | Corrections, damage, loss, opening balances, bulk (provisioned) |
| 5b  | **Stock Check**            | Physical count sessions (Employee count → Admin approve)        |
| 6   | **Returns & Replacements** | Existing ops; stock effects use same leaf identity              |
| 7   | **Stock Transfers**        | Later — multi-location                                          |
| 8   | **Reorder Rules**          | Min / target; Run reorder; consolidated queue                   |
| 9   | **Stock Reports**          | Movement, shortages, discrepancies                              |


Procurement **Purchase Orders** sit beside these.

---



## 5. How stock moves (controlled events only)

Quantity is **never** a simple editable field. Every change is an audited event against a **stock leaf** (variant + SPH + CYL).

### 5.0 Event types


| Event                              | Typical effect                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Purchase receipt (Confirm)**     | On hand ↑ (accepted qty only); becomes sellable                                                                               |
| **Stock adjustment / stock check** | On hand ↑ or ↓ with reason                                                                                                    |
| **Reserve**                        | Reserved ↑, available ↓ (on hand unchanged)                                                                                   |
| **Release**                        | Reserved ↓, available ↑ (e.g. cancel before pack)                                                                             |
| **Pack deduct**                    | On hand ↓ when stock is issued for the order                                                                                  |
| **Return / reversal**              | On hand ↑ (or reserved adjusted) when goods/commitment come back after cancel-after-pack, return accept, or controlled modify |


Warehouse **inbound / correction** paths are receipt + adjustment/stock check.  
**Order-linked** paths (reserve, pack, return/reversal) are required stock behaviour; full order-modify screens may live under Orders ([CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md)).

### 5.1 Purchase receipt (import Excel → compare to PO → update stock)

```
PO open / sent (list of stock leaf + ordered qty)
    → Receive shipment
    → Upload Supplier Bill + Power-wise Excel (receipt data)
    → Validate
    → Reconcile side by side with PO
         (this leaf: ordered vs received → match / short / extra)
    → Summary: shorts, extras, mismatches (reconcile report)
    → Accept / reject lines as needed
    → Confirm Receipt  (= “update stock” for accepted qty)
    → On hand += ACCEPTED only → sellable for customers
```

- Import is **against the PO**, not a free overwrite of all stock.  
- Side-by-side shows ordered vs received per stock leaf (variant SKU + SPH/CYL, plus axis/ADD/eye from the variant when present).  
- Rejected quantity does **not** enter stock.  
- Upload / validate / reconcile do **not** post stock. Only **Confirm Receipt** does.



### 5.2 Stock adjustment (Admin)

Used when stock was entered wrong, wrong power was used, damage/loss, or after a verified stock check.


| Field               | Example                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| Leaf                | Variant SKU `PG-BR-1P56-KT-HC-GREEN-…` · SPH −2.00 / CYL −0.50 (axis/ADD from variant) |
| Current (system)    | 20                                                                                     |
| Counted / new       | 18                                                                                     |
| Reason              | Physical count discrepancy / wrong entry / wrong power correction                      |
| Quantity adjustment | −2                                                                                     |
| Resulting balance   | 18                                                                                     |


**Audit (required):** who submitted, who approved (when applicable), when, before/after balance, reason.  
Wrong-power correction is still an audited adjustment (correct the wrong leaf and/or the right leaf) — not a silent edit.

**Bulk adjustment:** allowed through procurement receive (many leaves) and through manual adjustment **with proper provisioning** — never a free spreadsheet overwrite of live qty without reason.

### 5.3 Physical stock check (Employee → Admin)

```
Admin starts count session for product / leaves
    → Those leaves are FROZEN (no other stock changes)
    → Employee fills COUNTED quantity only
       (Employee must NOT see live / system stock)
    → Employee submits
    → Admin verifies
    → Difference becomes stock adjustment
    → Session completes → freeze lifted
```


| Role     | Can see system qty | Can enter counted qty | Applies adjustment |
| -------- | ------------------ | --------------------- | ------------------ |
| Employee | **No**             | Yes                   | No                 |
| Admin    | Yes                | Yes (if needed)       | Yes (after verify) |


---



## 6. Quantity rules (available, reserved, blocked)



### 6.1 Definitions


| Quantity      | Rule                                                       |
| ------------- | ---------------------------------------------------------- |
| **On hand**   | Physical in warehouse (system current)                     |
| **Reserved**  | Committed to orders                                        |
| **Blocked**   | Held from sale until Admin clears discrepancy / adjustment |
| **Available** | On hand − reserved − blocked                               |


**Reorder** uses **available only** (does not include reserved or blocked).

### 6.2 Prevent negative available

Example: on hand 10, reserved 8 → available 2.  
Admin must **not** be allowed to adjust −5 (would break reserved stock). Adjustments that would make available < 0 are rejected and reviewed.

### 6.3 Pick finds less than reserved (discrepancy)

Example:


|                         | Qty |
| ----------------------- | --- |
| Ordered                 | 8   |
| Available at order time | 6   |
| Reserved                | 6   |
| Pending shortage        | 2   |
| Employee picks / finds  | 4   |


- Record picked **4**; **2** go to **discrepancy / blocked** (unavailable).  
- Order shortage is recalculated.  
- When Admin investigates and adjusts:  
  - If stock is found → clear block and make available / re-reserve as needed.  
  - If not found → stock adjustment reduces on hand; block cleared with audit.



### 6.4 Count freeze

During an open **stock check** for selected leaves:

- No receipt confirm, other adjustment, or reserve change that would alter those leaves.  
- After count completes and any adjustment is applied → resume normal operations.

---



## 7. Product matrix (live stock)

**Where:** Products & catalog → open **parent**.

**Header:** Parent attribute summary (Family · Base · Material? · Index? · Coating? · Color? · Diameter? · Progressive type?) + list/summary of variants (SKU / range / axis / ADD / eye). Parent has **no** single SKU.

**Grid:** Same **family-aware stacked sheets** as the catalog matrix (not a single flat SPH×CYL table only):


| Family | Sheets (stacked)                     | Cell identity                                             |
| ------ | ------------------------------------ | --------------------------------------------------------- |
| **SV** | SPH × CYL                            | variant + SPH + CYL                                       |
| **KT** | Sphere → CYL+Axis → Compound → Cross | variant already has axis + ADD; cell adds SPH + CYL       |
| **V2** | Same sheet kinds; RE then LE blocks  | variant already has axis + ADD + eye; cell adds SPH + CYL |


Steps stay **0.25** from the covering variants’ ranges. Empty sheets omitted. Layout rules match catalog (stub columns, axis blocks largest-first, 135°/45° oblique sharing, etc.).


| Cell          | Meaning                                                  |
| ------------- | -------------------------------------------------------- |
| **Current**   | On hand for that leaf — **not** typed freely             |
| **Threshold** | Reorder min (editable with permission)                   |
| **Target**    | Desired level after replenish (editable with permission) |


Below threshold → highlight. Sticky headers for large sheets.  
Missing leaf → show Current **0** until first receipt / adjustment / rule save (lazy create).

---



## 8. Purchase order & reorder flow

PO lines, receive lines, reorder rules, and Run reorder all target the **same deepest leaf** (variant + SPH + CYL). UI may show parent attrs + variant SKU + power + axis/ADD/eye for clarity.

```
Reorder rules (threshold / target per stock leaf)
        │
        ▼
 Manual Run reorder → consolidated requirements queue
        │  (only leaves still short; skip leaves already on open PO)
        ▼
 Admin selects leaf + supplier → Create PO
        │  (qty/items editable before approve)
        ▼
 Review → Approve → PO OPEN / Sent
        │
        ▼
 Receive → Validate → Reconcile (accept/reject)
        │
        ▼
 Confirm Receipt → on hand += accepted only
        │
        ▼
 Close outstanding (reason) if needed → PO CLOSED
        │
        ▼
 That leaf may enter reorder again
```



### 8.1 Reorder calculation (locked)

Per **stock leaf**:


| Term          | Formula / meaning                                                 |
| ------------- | ----------------------------------------------------------------- |
| **On hand**   | Physical quantity                                                 |
| **Reserved**  | Held for orders                                                   |
| **Blocked**   | Discrepancy / held back                                           |
| **Available** | On hand − reserved − blocked                                      |
| **Threshold** | Reorder trigger (min)                                             |
| **Target**    | Desired level after replenishment                                 |
| **Incoming**  | Outstanding qty on an **open** PO for this same leaf (not closed) |


**Do not count reserved twice:** reserved is already removed when computing **available**. Never add reserved again into “qty to buy.”

**Suggested need (when a new requirement is allowed):**

```
required = max(0, target − available − incoming)
```

**When does Run reorder raise a new requirement?**

1. If this leaf already has an **open PO** → **do not** create another PO / PR for that leaf. Still show the leaf (or a “already on PO” view) with **Incoming**.
2. Else if **available ≤ threshold** → candidate; set **required** as above (incoming is usually 0 if no open PO).
3. **Unreserved customer shortage** = order qty still needed that was **never reserved**.
  - May appear on the consolidated queue as demand context / priority.  
  - When computing buy qty:  
  `required = max(0, target − available − incoming, unreservedShortage − incoming)`  
  - Do **not** add reserved into that max.  
  - If an open PO already exists → still **no second PO**; shortage waits on that PO (or Admin edits the open PO).

**Worked example**


| Field               | Value             |
| ------------------- | ----------------- |
| On hand             | 20                |
| Reserved            | 8                 |
| Blocked             | 2                 |
| Available           | 10 (= 20 − 8 − 2) |
| Threshold           | 12                |
| Target              | 30                |
| Incoming on open PO | 10                |


- Available (10) ≤ threshold (12) → looks short.  
- Open PO already covers **incoming 10** → **no new PO**.  
- UI must show **Incoming: 10**.  
- If there were **no** open PO: `required = max(0, 30 − 10 − 0) = 20`.



### Hard rules

1. **Manual** Run reorder — no silent auto-PO.
2. **One consolidated reorder queue**; Admin picks lines + supplier.
3. Day 1: 10 leaves short → PO. Day 2: 2 *new* leaves short → new PR/PO lines only for those 2 (leaves already on an **open** PO are not duplicated).
4. Draft PR/PO: quantity and items **editable before approve**.
5. Stock truth is the **leaf**; range/variant for display / bill consolidation / SKU label.
6. Matrix **Current** is not free-edited.
7. Open PO for a leaf → **no second PO** for that leaf until closed; **always display incoming**.
8. Stock qty changes only via controlled events in §5. No free-edit quantity.
9. Reorder math uses **available** (+ incoming / unreserved shortage as in §8.1) — never double-count reserved.
10. Partial receive: Keep Open or **Close Outstanding** with reason.
11. Warehouse v1 = **Main**.
12. Parent attribute edit (if ever added) is **locked** once any variant under that parent has stock or orders.



### Create PO / Receive (UI intent)

Select stock leaves (via parent matrix and/or variant SKU + power) → Review → Approve; Receive → Upload → Validate → Reconcile → Confirm.  
Receive must support accept/reject for short, extra, and power mismatch lines.  
Reorder / power-wise screens show **on hand, reserved, blocked, available, incoming, threshold, target** plus catalog labels (parent attrs, variant SKU, SPH/CYL, axis/ADD/eye).

---



## 9. Data shape (plain language)

```
Parent (catalog attrs)
  └── Variant (range × axis? × ADD? × eye? · SKU · price)
        └── Stock leaf (SPH, CYL)
              ├── on hand, reserved, blocked, available
              ├── threshold, target
              └── audit via stock transactions

Count session (optional)
  └── Frozen leaves → employee counts → admin adjust → unfreeze

Purchase order
  └── Lines (stock leaf + qty)
        └── Receipts → accepted qty → on hand ↑

Stock adjustment / stock check
  └── ± qty + reason + actors → transaction
```

---



## 10. Admin navigation (target)

- Products & catalog → parent detail **live matrix**  
- Stock Overview · Power-wise Inventory · Stock Transactions  
- Stock Adjustments · **Stock Check**  
- Purchase Orders (+ receive) · Reorder queue · Suppliers  
- Stock Reports · Returns & Replacements

---



## 11. APIs (capability view)


| Area            | Capabilities                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Product stock   | Parent matrix (current / threshold / target per cell); patch threshold/target on leaf                          |
| Power inventory | List/search leaves; on hand, reserved, available, blocked, incoming; labels from parent + variant              |
| Stock check     | Start/complete session; employee submit counts (no live qty in response); admin verify                         |
| Adjustments     | Create / approve adjustment; reject if available would go negative                                             |
| Transactions    | Ledger by leaf / variant / product / type / date (**audit**)                                                   |
| Reorder         | Rules; Run reorder per §8.1; consolidated queue; show incoming; block 2nd open PO per leaf                     |
| Purchase orders | Draft (editable) → approve → sent; close outstanding                                                           |
| Receipts        | Upload Excel; side-by-side vs PO; short/extra summary; accept/reject; confirm (accepted only → sellable stock) |


---



## 12. Phased delivery


| Phase   | Outcome                                                                           |
| ------- | --------------------------------------------------------------------------------- |
| **S1**  | Live matrix on parent (current / threshold / target) keyed by variant + SPH + CYL |
| **S2**  | Stock Adjustment + audit transactions + negative-available guard                  |
| **S2b** | Stock Check (employee count, no live qty) + freeze + Admin verify                 |
| **S3**  | POs / Confirm Receipt → stock leaf (accepted only)                                |
| **S4**  | Overview, power-wise, reserved/blocked, Run reorder on available                  |
| **S5**  | Reports + polish; pick-discrepancy blocked flow                                   |


Transfers / multi-location after Main warehouse is solid.  
Order/returns/costing follow-ons: [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md).

---



## 13. Acceptance

- [ ] Parent catalog matrix shows Current / Threshold / Target on each covered cell; Current not free-edited  
- [ ] Stock leaf identity is **variant + SPH + CYL** (axis/ADD/eye via variant)  
- [ ] Confirm Receipt posts only **accepted** qty after side-by-side PO vs Excel reconcile + summary  
- [ ] Rejected receipt qty does not enter stock  
- [ ] Stock also moves via reserve/release, pack deduct, and return/reversal events (audited); no free-edit qty  
- [ ] Employee stock check: counted qty only; **no live stock visible**  
- [ ] Admin verifies stock check → adjustment + audit  
- [ ] Leaves in an open count session are frozen until complete  
- [ ] Adjustment cannot drive available below zero when reserved exists  
- [ ] Pick short → blocked/discrepancy until Admin adjusts  
- [ ] Reorder uses §8.1 formula; reserved not double-counted  
- [ ] Open PO → no second PO for that leaf; **Incoming** visible to Admin  
- [ ] Consolidated queue; draft PO editable before approve  
- [ ] Full audit trail for stock changes  
- [ ] Single Main warehouse in v1  
- [ ] Parent attrs not editable once variants under that parent have stock/orders (when edit exists)

---



## 14. Open points (non-blocking)

1. Freeze granularity: all leaves under a parent vs only leaves listed on the count sheet.
2. Receive Excel final column template (must identify variant SKU + SPH/CYL clearly).
3. Send PO via Email live vs stub.
4. Shop/mobile cutover timing to new stock leaves.
5. Whether leaves “already on open PO” stay visible on the Run-reorder result list (read-only + incoming) or only on PO / power-wise detail.
6. If two variants’ ranges visually overlap on the parent matrix, UI must still attribute each cell to the correct **variant** leaf (no shared pile).

