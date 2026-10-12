# DrishX — Remaining Work

**Document type:** End-phase backlog (bugs, changes, new modules)  
**Audience:** Developers picking up assigned work  
**Last updated:** 2026-10-12

## How to use

- Each item has a stable ID (`RW-01`, `RW-02`, …).
- Default sections: **Type**, **Goal**, **Current state**, **Scope (in)**, **Out of scope**.
- Larger items (e.g. RW-06, RW-08) add extra sections: catalog, architecture, phases, data sources, open questions, PDF UI references.
- Cross-repo work is listed under **Repos** in the index.

---

## Index

| ID | Task | Repos |
|----|------|-------|
| RW-01 | Auth session drops mid-use — Unauthorized / forced re-login | backend, website, mobile, admin panel |
| RW-02 | Admin grouped orders overview (card UI) | backend (admin panel) |
| RW-03 | Returns: show fuller order details (list + detail) | backend (admin panel) |
| RW-04 | Customer status: abandoned signups + admin status changes | backend (admin panel; loyalty filters) |
| RW-05 | RX + photo order visibility (admin hold → warehouse) | backend, website, mobile, admin panel |
| RW-06 | Reports module (client report catalog, phased) | backend (admin panel) |
| RW-07 | Client registration form — most fields optional | backend, website, mobile |
| RW-08 | Procurement: Purchase Order → receive → close (power-wise) | backend (admin panel) |
| RW-09 | Products & catalog: admin product master + ranges → powers | backend (admin panel) |
| RW-10 | Admin panel: create order on behalf of customer | backend (admin panel) |

---

## RW-01 — Auth session drops mid-use (Unauthorized)

### Type

Bug — session / refresh reliability (all clients)

### Goal

Users stay signed in for the life of a valid refresh session. Across **admin panel**, **web app**, and **mobile**, people currently hit **Unauthorized** mid-work and must refresh or log in again. Expired access tokens should refresh silently; force re-login only when the refresh session is truly invalid.

### Current state

Access JWT is **15 minutes**; refresh is **30 days** (cookie on web/admin, secure store + body on mobile). Website/admin/mobile already have auth-fetch wrappers with refresh-on-401, but clients still see Unauthorized mid-session — likely incomplete use of those wrappers, proxy/cookie gaps, or races. Fix spans backend refresh behavior plus all three frontends.

### Scope (in)

- Silent refresh + retry when access token expires and refresh is still valid
- Consistent `401` codes so clients know when to refresh vs force login
- All authenticated API calls on admin, website, and mobile go through the auth fetch path
- Cover admin (same-origin), website (BFF proxy + cookies), and mobile (secure refresh storage)

### Out of scope

- New auth providers or role-model changes
- “Fix” by only lengthening access-token TTL without making refresh reliable
- Permission / inactive / pending-account errors (those should still surface, not silent-refresh)

---

## RW-02 — Admin grouped orders overview (card UI)

### Type

New feature — admin order overview page

### Goal

Add a new admin page (keep existing `/orders` table) with a card-based UI where orders are **grouped** by a selected tab: **by date** or **by customer**. Each card shows the same kind of summary fields as the current Orders table (order id, customer, status, amounts, etc.) for the lines in that group. Opening a line goes to the existing order detail page `/orders/[id]`. Same order set as the main Orders screen. Admin panel only for now.

### Current state

Order Management has flat table pages (`/orders`, Rx, Dispatch, Procurement). Each row is one `Order` line. There is no card overview that groups by date or customer. Order detail already exists at `/orders/[id]`.

### Scope (in)

- New admin route + sidebar entry under Order Management
- Tabs (or equivalent) to group by **date** vs **customer**
- Card list UI for groups; card body shows order-table-style fields for lines in the group
- Navigate from a line in the card to `/orders/[id]`
- Same order population/filters as the main `/orders` screen (non-RX catalog / color / wholesale)

### Out of scope

- Replacing or redesigning the existing `/orders` table
- Employee web / mobile versions of this view
- Changing order lifecycle, assignment, or fulfillment APIs beyond what’s needed to list/group for this page

---

## RW-03 — Returns: show fuller order details (list + detail)

### Type

Change / UX — admin Returns & Replacements

### Goal

On admin **returns list** and **return detail**, the linked order(s) currently show too little (label, qty, reason, powers). Staff need the same necessary order fields as the Orders screen (order id, customer/business, catalog/lens summary, status, amounts, etc.) so they can understand the full return story without leaving the page. Layout can differ from the Orders table, but the information should match what Orders already surfaces.

### Current state

`/returns` and `/returns/[id]` focus on return workflow (status, items, photos, admin decision). Returned items expose `lensLabel`, qty, reason, original/requested powers, and remarks — not the fuller order context used on `/orders` and `/orders/[id]`.

### Scope (in)

- Enrich **list** and **detail** return UIs with order-screen-equivalent fields (different design/layout OK)
- Include enough order context per returned line/request for admin review (credit / replacement / reject)
- Admin panel only; API may need to include more order fields on return payloads if not already present
- Link to `/orders/[id]` where useful, but primary info should be visible on the return screens themselves

### Out of scope

- Employee web / mobile return screens
- Changing return decision rules, credit-note calculation, or replacement workflow logic (unless required to load extra display fields)
- Redesigning the main Orders pages

---

## RW-04 — Customer status: abandoned signups + admin status changes

### Type

Bug / change — admin Clients & customer approval lifecycle

### Goal

Fix two related gaps: (1) Users who start customer signup and abandon mid-wizard are already saved in the DB (`PENDING_REVIEW`, often without GST) but do **not** appear on Clients pending/approved — so admin cannot manage them — yet they **do** appear on Loyalty. (2) Admin cannot change status of an approved (or other) client back to pending or otherwise move statuses; approve/reject is only offered for pending+GST applications. Admin must be able to see incomplete/abandoned customers and change customer approval status as needed (including after approve).

### Current state

Signup creates the customer immediately with `approvalStatus: PENDING_REVIEW`, `isApproved: false`. Pending Clients API requires `gstNumber != null`; approved list requires `isApproved: true` — incomplete rows are invisible. Loyalty customers API lists all `role: CUSTOMER` with no approval filter. Approve API/UI only supports `approve` | `reject`, and detail actions show only when status is pending with GST — no reopen-to-pending or general status change for approved clients.

### Scope (in)

- Surface incomplete/abandoned signups on admin Clients (e.g. incomplete tab/filter or include in pending with clear labeling) so admin can act on them
- Align Loyalty (and any similar “all customers” lists) so incomplete/unapproved accounts do not appear as normal loyalty customers unless product says otherwise
- Allow admin to change customer approval status beyond one-way pending→approve/reject (at least: manage approved clients — e.g. reject/suspend/reopen to pending — with clear rules and UI on list/detail)
- Keep existing statuses: `PENDING_REVIEW`, `APPROVED`, `REJECTED` (+ `isActive` / `isApproved` consistency)

### Out of scope

- Redesigning the full customer self-signup wizard on web/mobile (unless a small hook is needed for status)
- Employee creating customers
- Loyalty points earning/redemption rules beyond who appears in the loyalty customers list

---

## RW-05 — RX + photo order visibility (admin hold → warehouse)

### Type

Change — order visibility / roles (RX + photo prescription orders)

### Goal

Custom prescription jobs (**RX form orders** and **photo prescription orders**) must stay **admin-only** until the physical warehouse step: admin reviews, can **assign**, and **manually marks** the order available / at warehouse. Only then should warehouse employees see them on staff RX/photo queues. Today both flows auto-assign and notify staff immediately, so employees can see them too early. Same hold/release rules apply to RX (`[RX Order]` / `POST /api/orders/rx`) and photo orders (`POST /api/orders/photo` / `orderImageUrl`). Wire through **roles/permissions** as well.

### Current state

RX is detected via `notes` containing `[RX Order]`; photo via image + not RX/Color. Create paths set `PENDING`, auto-`resolveOrderAssigneeId`, and notify staff. Admin has `/orders/rx-lab`; employees with `orders.rx` see assigned RX on web/mobile. There is no admin-hold / “at warehouse” / release flag — assignment happens at create for both RX and photo.

### Scope (in)

- On create (RX + photo): do **not** put on employee warehouse queues yet (no premature assign/notify, or equivalent hold)
- Admin panel always sees these orders; admin can **assign** and **manually mark available / at warehouse**
- After mark (+ assign as designed): employees with the right permission see them on staff queues (web + mobile)
- Enforce in **API** and UI; extend staff permissions/roles as needed (view vs work after release)
- Same rules for RX form orders and photo prescription orders

### Out of scope

- Redesigning the customer RX form or photo-upload UX (beyond visibility/lifecycle)
- Catalog / wholesale / color order queues
- Full RX pricing/lab workflow redesign beyond hold → mark warehouse → assign → staff see

---

## RW-06 — Reports module (client report catalog, phased)

### Type

New feature — Admin **Reports hub** (financial, inventory, power, order, sales)

### Goal

Deliver the client’s full report list as a structured **Reports** area in the admin panel (not 30 one-off pages). Reuse existing finance/inventory/order data; add shared query layer + consistent UI (filters, tables, later export). Build in **phases** so P1 can ship without waiting on SKU redesign or perfect stock-history.

### Current state

- **Exists today:** Admin **Finance → GST & Reports** (`/finance/reports`) with API `GET /api/finance/reports`:
  - `gst-summary` — output / input / net GST by financial year
  - `hsn` — HSN-wise sales
  - `power-wise` — power-wise **sales** (invoice lines), not warehouse stock analytics
- **Related UIs (not formal “reports”):** receivables + aging (`/finance/receivables`, `/api/finance/receivables`), payments/claims, invoices, purchases/payables, order lists by status, lens `quantity` + reserved/available helpers in `app/lib/order-inventory.ts`, reorder `minStock` on `ReorderRule`, stock movements / intake for some history.
- **Missing:** Reports hub navigation, most named reports below, shared report framework, CSV/Excel export, power fast/slow/dead rules, stock aging/valuation as report products.
- Older ops-spec text that said “Reports stubbed” is **out of date** for GST/HSN/power-wise sales.

### Client report catalog (required set)

#### Financial Reports

| Report | Notes for implementer |
|--------|------------------------|
| Sales Summary | Aggregate sales (prefer invoice lines / paid or issued invoices — confirm status filter) |
| Purchase Summary | Aggregate purchases (`PurchaseBill` and related) |
| Profit & Margin Report | Needs client formula (sales − COGS − ?expenses) |
| Outstanding Customers Report | Largely wrap receivables / unpaid invoices + aging |
| Payment Collection Report | Payments + confirmed payment claims in period |
| GST Summary Report | **Already implemented** — move/link into Reports hub |

#### Inventory Reports

| Report | Notes for implementer |
|--------|------------------------|
| Current Stock Report | On-hand `quantity` per catalog row (`lensType` + `lensId`) |
| Power-wise Stock Report | Group/filter stock by power fields on rows / order powers |
| Product-wise Stock Report | Group by category/brand/item/coating (product key) |
| Reserved Stock Report | Open-order committed qty (`reservedQuantity − pickedQuantity`) |
| Available Stock Report | `onHand − committed` (`getAvailableQuantity`) |
| Stock Aging Report | Needs receipt/movement dates; may be incomplete if history thin |

#### Power Reports (product-wise and overall)

| Report | Notes for implementer |
|--------|------------------------|
| Fast Moving Powers Report | Needs window + threshold (client) |
| Slow Moving Powers Report | Needs window + threshold (client) |
| Dead Powers Report | Needs definition (e.g. zero sales in N days with stock) |
| Stock Aging Report | Same aging caveats as inventory |
| Unsold Powers Report | Stock with no/zero sales in window |
| Out of Stock Powers Report | `quantity <= 0` (and/or available <= 0) |
| Low Stock Powers Report | Prefer `ReorderRule.minStock` when present |
| Stock Valuation Report | Needs cost basis (`costPrice` vs `price`) |

#### Order Reports

| Report | Notes for implementer |
|--------|------------------------|
| Pending Orders Report | Status filter (clarify which statuses count as “pending”) |
| Completed Orders Report | `COMPLETED` |
| Cancelled Orders Report | `CANCELLED` |
| RX Orders Report | `notes` contains `[RX Order]` (and decide photo orders: `orderImageUrl` / not Color) |
| Ready Stock Orders Report | **Needs client definition** (non-RX catalog? dispatch-ready? fully reserved?) |

#### Sales Reports

| Report | Notes for implementer |
|--------|------------------------|
| Daily Sales Report | Bucket by day (invoice or order date — confirm) |
| Monthly Sales Report | Calendar month / FY month |
| Quarterly Sales Report | Quarters |
| Yearly Sales Report | Calendar year and/or Indian FY (project already has FY helpers) |

### Architecture (how to build)

Do **not** create one unrelated page per report with duplicated Prisma queries.

```
Admin UI: Reports hub (categories → report → filters → table [→ export])
        │
        ▼
GET /api/reports?report=<key>&from=&to=&fy=&...   (or /api/reports/[key])
        │
        ▼
app/lib/reports/*
  - registry: key, title, category, filters, columns
  - queries: one function per report (or shared aggregators)
  - reuse: finance FY helpers, receivables aging, order-inventory available/reserved
```

**SKU note:** Inventory/power reports should key off **today’s catalog row** (`lensType` + `lensId`). Do not block this module on a full SKU rewrite. A future SKU facade can improve labels only.

**Not the same as:** warehouse power-matrix / verify-sheet procurement UI (meeting “power-wise stock” operations). Those are operational screens; this RW is **reporting**.

### Delivery phases

| Phase | Deliver | Why first |
|-------|---------|-----------|
| **P1** | Reports hub shell; GST (link/migrate existing); Outstanding customers; Payment collection; Pending/Completed/Cancelled/RX orders; Daily + Monthly sales | Data already exists |
| **P2** | Sales summary; Purchase summary; Profit & margin; Quarterly + Yearly sales | Needs aggregation + margin rules |
| **P3** | Current / product / power / reserved / available stock; OOS; Low stock | Row stock + reserved math |
| **P4** | Fast/slow/dead/unsold; stock aging; valuation | Needs client thresholds + movement/sales history quality |

Ship P1 even if open questions for P4 are unanswered.

### Scope (in)

- Admin-panel Reports hub covering the catalog above (phased)
- Shared report API + `app/lib/reports` registry/queries
- Date / FY filters where relevant; consistent table UI
- Reuse existing GST report; fold into hub (keep or redirect old `/finance/reports`)
- Auth: admin (and optional staff permission later)
- Export (CSV/Excel) as follow-on within this module once tables work

### Out of scope

- NIC e-Invoice / e-Way live filing APIs (`docs/finance-deferred.md`)
- Payment gateway integration
- Full CA chart-of-accounts / trial balance UI
- Warehouse matrix PO + receive-verify UI (separate backlog when written)
- Rewriting lens catalog into a new SKU master table as a prerequisite
- Customer-facing or mobile reports (unless client later asks)

### Key code / data pointers

| Area | Where to look |
|------|----------------|
| Existing GST/HSN/power sales | `app/(admin)/finance/reports/page.tsx`, `app/api/finance/reports/route.ts` |
| FY helpers | `app/lib/finance/financial-year.ts` |
| Receivables / aging | `app/api/finance/receivables/route.ts`, admin receivables page |
| Payments / claims | `app/api/finance/payments/route.ts` |
| Invoices / lines | `Invoice`, `InvoiceLine` (HSN, `powerLabel`, amounts) |
| Purchases | `PurchaseBill`, finance purchases API |
| On-hand / reserved / available | Lens `quantity`; `getCommittedQuantity` / `getAvailableQuantity` in `app/lib/order-inventory.ts` |
| Low-stock threshold | `ReorderRule.minStock` |
| Stock history | `StockMovement`, procurement intake / `STOCK_RECEIVED` audit paths |
| Orders / RX | `Order.status`; RX via `notes` `[RX Order]`; photo via `orderImageUrl` |
| Finance shipped vs deferred | `docs/finance-deferred.md` |

### Open questions (ask client before P2/P4; do not invent)

1. **Profit & margin** — exact formula (sales − purchase cost only? include procurement expenses, credit notes, returns)?
2. **Sales date basis** — invoice `issuedAt` vs order `createdAt` vs payment date?
3. **Fast / slow / dead / unsold** — time window and unit thresholds?
4. **Low stock** — always `ReorderRule.minStock`, or global default when no rule?
5. **Stock valuation** — `costPrice`, `price`, or weighted average?
6. **Stock aging** — age from last receipt only; what if no movement history?
7. **Ready stock orders** — definition?
8. **RX report** — include photo prescription orders?
9. **Export** — CSV only, or Excel too, for v1?

### Acceptance (module-level)

- [ ] Admin can open a Reports hub and run P1 reports with correct filters
- [ ] GST Summary remains available and matches current finance report numbers
- [ ] Inventory reserved/available reports match order-inventory semantics
- [ ] Unknown report keys fail cleanly; unauthorized roles blocked
- [ ] P2–P4 either shipped or explicitly blocked on documented open questions (no silent fake thresholds)

### Suggested first PR

Reports hub + registry + migrate GST + 2–3 P1 reports (e.g. outstanding customers, pending orders, daily sales) to prove the pattern; then fill the catalog phase by phase.

---

## RW-07 — Client registration form: most fields optional

### Type

Change — customer signup / onboarding (web + mobile + API)

### Depends on

**Start only after RW-04 is finished.** RW-04 owns incomplete/abandoned Clients visibility and admin status changes. This task must not redesign that flow — it relies on it (sparse signups land in incomplete; GST-complete stay in pending-ready).

### Goal

Relax customer registration so **only name, email, and contact (mobile)** are required at minimum (password remains required for auth). Shop/business, GST, billing, and shipping fields become optional. Users who skip or leave blanks still exist as customers and are managed through the **RW-04** incomplete / status paths — do not invent a parallel approval model.

### Current state

DB `User` columns for business/GST/addresses are already mostly nullable. Signup API still requires **business name** in addition to name/email/mobile/password. Web and mobile wizards (`business-info` → `gst-details` → `registration-addresses`) mark almost every field required. `POST /api/auth/gst` rejects unless the full business + GST + billing + shipping set is present. Frontend-only loosening is not enough — sparse submit gets **400** from the API today.

### Scope (in)

- Required minimum: **name, email, contact (mobile)** (+ password for account creation)
- Make remaining signup/wizard fields optional on **website**, **mobile**, and **backend** (`POST /api/auth/signup`, `POST /api/auth/gst`)
- Validate GSTIN/PAN format only when those values are provided
- Preserve existing wizard steps/flow shape where practical (optional/skippable fields, not a greenfield onboarding redesign)
- Align with RW-04: no GST / mid-wizard abandon → **incomplete**; with GST → existing **pending-ready** approve path; no change to RW-04 status model

### Out of scope

- Changing RW-04 (incomplete tab, loyalty filters, admin status transitions) — consume it as-is
- Admin create-customer form (unless a tiny hook is required)
- Invoice/GST tax-type product rules beyond accepting sparse profiles
- Forcing profile completion before first order (unless product later requires it)

---

## RW-08 — Procurement: Purchase Order → receive → close (power-wise)

### Type

New module / change — admin procurement (Purchase Order lifecycle on top of existing reorder)

### Audience note (for humans + AI)

This is the **single procurement PO task**. Implement against **this document + the client procurement PDF** (share the PDF with screenshots). Below, **PDF UI references** describe what each screenshot looks like so you know which mock is for which step — match layout/intent; use existing DrishX admin UI components (do not pixel-copy a foreign sidebar).

**SKU:** treat today’s catalog leaf as the SKU — `lensType` + `lensId` (power row). Do **not** build a new SKU master table as a prerequisite. Product/range labels on screens are display fields derived from the lens row / product tree.

### Goal

Deliver the full admin **Purchase Order** path the client described: power-wise threshold/target → manual **Run reorder** (keep) → generate **PO** (draft → review → approve/open → sent) → **Receive goods** (supplier bill + power-wise Excel) → validate → reconcile (power-wise + range-wise) → resolve exceptions → **Confirm Receipt** (only then stock updates) → close outstanding with reasons → PO closed. While a PO is open for a given power, **never** create another PO for that same power. Reorder may raise that power again **only after** the PO is closed.

### Current state (what already exists — reuse)

| Exists today | Where | Keep? |
|--------------|--------|--------|
| Power-wise reorder rules (`minStock` / `targetStock` per lens row) | `ReorderRule`, `/inventory/power-wise-stock` | **Yes** — extend UI toward matrix |
| Manual run reorder (creates demand, not money) | `POST /api/inventory/reorder-check`, Run button | **Yes — do not remove / do not auto-PO at EOD** |
| Demand rows | `ProcurementRequest` + `/procurement/requests` approve/cancel | **Yes** — feed “Add from Reorder Queue” into PO |
| Available / reserved / incoming math | `app/lib/procurement-requests.ts`, `procurement-rules.ts` | **Yes** — change `incoming` to count **open PO** qty (not only open requests) once POs exist |
| Thin suppliers + finance purchase bills | `Supplier`, `PurchaseBill`, `/finance/purchases` | Reuse/enrich; client said current purchases page feels incomplete |

**Missing today:** `PurchaseOrder` entity, create/review/approve/sent UI, receive wizard, bill+Excel validation, reconciliations, Confirm Receipt stock post, close-outstanding reasons, open-PO duplicate guard.

### Hard rules (do / do not)

**Do**

1. Keep **manual Run reorder** — admin clicks Run; system raises requirements; humans build/approve POs.
2. Work **power-wise** everywhere (stock, reorder, PO lines, receive Excel, short/extra). Range is a grouping/display/bill consolidation layer.
3. Show **current stock non-editable**; threshold + target editable (matrix cells: `Current / Threshold / Target`; red when current &lt; threshold).
4. On Run / next PO generation: include **available**, **reserved**, and **qty already on open (not closed) POs** for that power.
5. If an **open PO** already covers a power, **do not** create another PO line/PO for that same power until the PO is **closed**.
6. Update inventory **only** after user confirms **Confirm Receipt** (final dialog). Upload / validate / reconcile must not post stock.
7. After partial receive, allow **Close Outstanding Quantity** with a reason; then set cancelled qty and close PO when appropriate.
8. Prefer linking existing `ProcurementRequest` rows into a PO rather than inventing a parallel demand system.

**Do not**

1. Do not auto-create POs or spend money without admin approve.
2. Do not treat range-level stock as the source of truth (bills may consolidate by range; software stock is power-wise).
3. Do not rewrite the lens catalog / new SKU master as part of this RW (separate catalog work later).
4. Do not block on RW-06 reports; inventory *reports* are separate from this *ops* module.
5. Do not implement full QC quarantine / put-away / client allocation warehouse WMS from the PDF flowchart end — out of scope for v1 (stock becomes available on Confirm Receipt unless product later asks for QC gate).
6. Do not hardcode a single warehouse forever without an abstraction — use a **Main Warehouse** stub + customizable warehouse option for future multi-warehouse.

### Target end-to-end flow

```
Reorder rules (threshold/target per power)
  → Stock monitoring / Run reorder (manual)
  → Purchase requirements (ProcurementRequest — keep)
  → Create PO (add from reorder queue / import / search)
  → Review → Approve → PO OPEN / Sent to supplier
  → Receive shipment (upload Bill PDF + Power-wise Excel)
  → Validate documents → Reconcile (power + range)
  → Resolve exceptions (short/extra/damaged; keep open vs close)
  → Confirm Receipt → stock += accepted received
  → Close outstanding (reasons) → PO CLOSED
  → Only then can Run reorder raise that power again
```

### Phases (implement in order)

#### Phase A — PO core + open-PO guard

**Build**

- Data model: `PurchaseOrder`, `PurchaseOrderLine` (power = `lensType`+`lensId`, product/range labels, required qty, PO qty, rate optional, amounts).
- Statuses at least: `DRAFT` → `PENDING_APPROVAL` → `OPEN` / `SENT` → `PARTIALLY_RECEIVED` → `CLOSED` / `CANCELLED` (names can match Prisma enums; intent matters).
- UI: **Create Purchase Order** wizard (Select Items → Review → Approve).
- Header fields: Supplier (dropdown), Expected Delivery (date), Warehouse (Main + extensible).
- Lines table: Product, Range, Power, Required, PO Qty (editable), Rate (₹, may be empty), Amount.
- Actions: Add from Reorder Queue, Import Excel (optional in A), Search product/power, Add row, Save Draft, Next Review, Approve.
- PO detail: status badge, Download PDF / Download Excel, Approve; tabs Details / Items / Documents / History (Documents/History can be thin in A).
- After approve: acknowledgement **PO Sent to Supplier** (downloads + optional Send via Email can be stub or real SMTP later).
- Wire **incoming** for reorder-check to include outstanding qty on **OPEN / SENT / PARTIALLY_RECEIVED** PO lines for that power.

**Done when:** Admin can create a draft PO from reorder queue, approve it open, and Run reorder **does not** double-order the same open powers.

#### Phase B — Receive, validate, reconcile, confirm, close

**Build**

- From PO (status OPEN/SENT): **Receive Shipment** → Receive Goods wizard: Select PO → Upload Documents → Validate → Reconcile → Confirm.
- Uploads (both required for happy path): **Supplier Bill** (PDF/image) + **Power-wise Excel** (client will provide template — code to a documented template shape).
- Optional shipment meta: Supplier, PO, Dispatch Date, Courier, AWB/Tracking, Package Count (from PDF receive mock).
- **Document Validation:** checks (supplier/product/SKU/PO match, duplicates, format, qty ≤ ordered warnings); summary Valid / Warnings / Errors; View Exceptions; Next Reconcile.
- **Receipt Reconciliation (power-wise):** tabs All / Matched / Short / Extra / Invalid; columns Ordered, Received, Accepted, Short, Status, Action (e.g. Keep Pending, Mark Damaged).
- **Range-wise Reconciliation:** Bill Qty vs Excel Qty per product+range; Matched / Mismatch; resolve mismatch (bill correction / Excel correction / accept Excel & flag invoice / keep pending).
- Buttons on reconcile screen: **Save as Draft** (nothing posted), **Resolve Exceptions** (only if discrepancies), **Confirm Receipt**, **Cancel** (no changes).
- **Confirm Receipt** dialog must state e.g. “N units will be added to stock. M units remain outstanding against PO #…. Bill quantity reconciled. Continue?” — only on Confirm post stock + attach bill into purchase management.
- **Close Outstanding Quantity** with reasons:
  - Supplier unable to supply
  - Supplier discontinued item
  - Supplier cancelled balance
  - Commercial disagreement
  - Buyer cancellation
  - Other  
  Then Ordered / Received / Cancelled; PO can close. Exception screen options (Keep Open / Close Shortage / Create Supplier Claim / Request Replacement) — claims/replacement may be stubbed; **Keep Open** and **Close Shortage** must work. Options need not be mutually exclusive where PDF says so.
- Manual PDF bill upload in purchase management (outside PO path) for bills without usable ranges — minimum viable.

**Done when:** Partial receive + confirm updates stock correctly; outstanding can be closed with reason; closed PO allows reorder again; open PO still blocks duplicate PO for that power.

#### Phase C — Matrix UX + supplier polish

**Build**

- Power matrix for threshold/target (and/or stock view): product title + range subtitle; SPH×CYL grid; cell `Current / Threshold / Target`; below-threshold highlighted; current not editable.
- Navigation/filters so ~800 ranges are usable (product bifurcations — type / index / coating / search). Reuse patterns from power-wise stock + catalog filters where possible.
- Richer **supplier profile** (business entity, GST, addresses, phone, contact person) — closer to client profile depth.
- Fill gaps: email send PO, full Documents/History tabs, Import Excel on create PO if deferred from A.

**Done when:** Matrix editing is usable for day-to-day reorder setup; suppliers are proper profiles.

### PDF UI references (what the screenshots look like)

Use the client procurement PDF images as layout/intent references. Finder phrases:

| # | What the image shows (find this in the PDF) | Use for |
|---|---------------------------------------------|---------|
| 1 | **Title-like product header** e.g. “Prime BRC HC”, subtitle **Range: -0.25 to -2.00**; **SPH × CYL matrix**; each cell three numbers **`Current / Threshold / Target`**; legend; **red/pink cells** when below threshold | Phase C matrix; also explain power-wise thresholds |
| 2 | Small **example table**: Product, SKU, Power, Current Stock, Threshold, Target Stock (e.g. Air Smart BRC 1.61) — some rows below threshold | Reorder calc examples; SKU=power leaf |
| 3 | Screen **“Create Purchase Order”**; stepper **Select Items → Review & Edit → Approve**; fields Supplier / Expected Delivery / Warehouse; buttons **Add from Reorder Queue**, **Import Excel**, search; line table Product/Range/Power/Required/PO Qty/Rate/Amount; totals; **Save Draft** + **Next: Review** | Phase A create wizard |
| 4 | Screen **PO number** e.g. `PO-2025-00481` + badge **Pending Approval**; buttons Download PDF / Download Excel / **Approve**; tabs Details / Items / Documents / History; meta supplier/warehouse/dates/totals; items table | Phase A review/approve detail |
| 5 | Screen **“PO Sent to Supplier”** + green **Sent** badge; text that PO was sent; Download PDF/Excel; **Send via Email**; Supplier Details card (name, email, phone, contact) | Phase A post-approve ack |
| 6 | Flow mock: PO status **Acknowledged**, Ordered/Received/Outstanding, button **[ Receive Shipment ]** → **Shipment Details** with courier/AWB fields + **Upload Stock Excel** + **Upload Supplier Bill** | Phase B entry into receive |
| 7 | Screen **“Receive Goods”**; stepper **Select PO → Upload Documents → Validate → Reconcile → Confirm**; PO dropdown + Ordered/Previously Received/Remaining; two upload tiles **Supplier Bill** + **Power-wise Excel**; **Validate Documents →** | Phase B upload step |
| 8 | Pair of UIs: **“Document Validation”** checklist (Valid / Warnings) + counts; and **“Receipt Reconciliation”** with tabs All/Matched/**Short**/Extra/Invalid; table Ordered/Received/Accepted/Short/Status/Action (Keep Pending, Mark Damaged) | Phase B validate + power reconcile |
| 9 | Tables: PO ordered powers → Supplier Excel received → **DrishX calculates** Ordered/Received/**Short** (e.g. short 6 on one power) | Phase B short math |
| 10 | **“Range-wise Reconciliation”** table Product/Range/Bill Qty/Excel Qty/Difference/Status Matched\|Mismatch; side panel **Quantity Mismatch** with radio resolutions | Phase B range reconcile |
| 11 | Spec block **§20 After Upload** summary (PO qty vs Excel vs Bill vs Short) + power-wise table with ✓ / ⚠; **§21 buttons**: Save as Draft, Resolve Exceptions, Confirm Receipt, Cancel | Phase B reconcile actions |
| 12 | **§22 Exception Screen** — “Short Receipt Detected”; PO/Received/Short box; actions Keep Open / Close Shortage / Create Supplier Claim / Request Replacement; note actions need not be mutually exclusive | Phase B exceptions |
| 13 | Text NOTE on **Confirm Receipt** dialog copy + **Close Outstanding Quantity** reason list + Ordered/Received/Cancelled → PO close → reorder only after close; open-PO no duplicate | Phase B hard rules (also in Hard rules above) |
| 14 | ASCII/flowchart: Reorder rule → … → PO → Sent → Stock Excel + Bill → Receiving/Validation/Reconciliation → Match/Short/Excess → Confirm Receipt → (QC…) → Available | Overall architecture; **stop before full WMS/QC** unless later scoped |

### Scope (in)

- Admin panel only (backend APIs + admin UI)
- Phases A → B → C as above
- Reuse Run reorder + `ProcurementRequest` + lens stock rows
- Open-PO duplicate suppression; Confirm-only stock post; close outstanding with reasons
- Warehouse stub with room to grow; supplier dropdown + profile enrichment (C)
- PDF/Excel download for PO (A); receive Excel template-driven parse (B)

### Out of scope

- Full **Products & catalog** create/archive wizard (separate future RW; deactivate/`isActive` may already exist elsewhere)
- New global SKU master rewrite
- RW-06 report hub / aging / fast-slow reports
- Automatic email/ERP to supplier as a hard dependency (UI button OK; sending can stub)
- Full QC quarantine / put-away / pick WMS from flowchart tail
- Employee mobile receive (unless later asked)
- Changing customer order reserve/pack rules (only consume available/reserved for reorder math)

### Key code pointers

| Area | Path |
|------|------|
| Run reorder | `app/api/inventory/reorder-check/route.ts`, cron `app/api/cron/stock-reorder/route.ts` |
| Request create / incoming / approve | `app/lib/procurement-requests.ts`, `app/lib/procurement-rules.ts` |
| Admin power-wise UI | `app/(admin)/inventory/power-wise-stock/page.tsx` |
| Requests UI | `app/(admin)/procurement/requests/page.tsx` |
| Order shortage procurement | `app/(admin)/orders/procurement/page.tsx` |
| Suppliers / bills today | `Supplier`, `PurchaseBill`, `app/(admin)/finance/purchases/page.tsx` |
| Stock increment patterns | `app/lib/stock-intake.ts` (reuse patterns; post only on Confirm Receipt) |

### Open questions (do not block Phase A)

1. Final **receive Excel** column template from client (required before Phase B parse is finished).
2. Exact Prisma status enum names / whether `SENT` is separate from `OPEN`.
3. Whether **Send via Email** must be live in v1 or stub.
4. Whether **Create Supplier Claim / Request Replacement** need full modules or UI stubs in B.
5. QC step before stock available — default for this RW: **stock available on Confirm Receipt**.

### Acceptance

- [ ] Run reorder still manual; still creates/updates demand without auto-PO
- [ ] Admin can create draft PO from reorder queue, review, approve → open/sent
- [ ] Open PO qty for a power blocks a second PO for that power
- [ ] Receive: bill + Excel → validate → reconcile → Confirm Receipt posts stock once
- [ ] Partial short: Keep Open vs Close Outstanding with reason; closed PO allows reorder again
- [ ] Range-wise bill vs Excel mismatch can be reviewed/resolved
- [ ] Matrix (Phase C) shows Current/Threshold/Target with below-threshold highlight; current not editable
- [ ] No dependency on a new SKU master table

### Suggested first PR

Phase A only: `PurchaseOrder` schema + create/review/approve UI + reorder `incoming` from open PO lines + “Add from Reorder Queue”. Then Phase B receive/confirm/close. Phase C matrix + supplier profile.

---

## RW-09 — Products & catalog: admin product master + ranges → powers

### Type

New module / change — admin **Products & catalog** (product master, ranges, power generation, archive/hold)

### Audience note (for humans + AI)

This is the **single Products & catalog task**. Implement against **this document + Sep 28 meeting notes** (product tree, range → matrix, overlap errors, archive/hold). Client also shared a **Tech / competitor video** as UI inspiration — use as **reference only**, do not clone blindly.

**SKU:** a sellable unit remains one catalog **power leaf**: `lensType` + `lensId` (row in `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` / …). This RW builds the **admin way to define products and generate those leaves**. Do **not** invent a second stock system or require a greenfield SKU master table that breaks existing `Order.lensId` FKs.

**Relation to RW-08:** Procurement PO/reorder consumes existing power leaves. Catalog makes creating and navigating products/ranges sane. RW-08 Phase A/B can ship without this; RW-08 Phase C matrix UX benefits from catalog filters. Prefer coordinating product identity (brand/category/coating labels) so PO lines and matrices show the same names.

### Goal

Replace the empty **Products & catalog** admin page with a real product-master workflow: define a product (lens type → attributes → coatings/index/brand) → attach **ranges** (e.g. −6×2, −6×4) → system **auto-generates** the power-wise SKU matrix for that range → **reject overlapping ranges** on the same product with a clear error and suggested correction → **archive / hold** so products can be hidden from shop and ops. Admins must be able to navigate a large tree (hundreds of ranges / tens of thousands of powers) via categorization and search.

### Current state (what already exists — reuse)

| Exists today | Where | Keep / extend? |
|--------------|--------|----------------|
| Power-row catalog in DB | `SingleVisionLens`, `KryptokLens`, `ProgressiveLens`, `OriVisionLens`, … — fields like `category`, `brand`, `item`, `index`, `coating`, `sph`/`cyl`/ranges, `quantity`, `price`, `isDisabled` | **Yes** — leaves stay the stock source of truth |
| Shop / wholesale / mobile already sell these rows | lenses APIs, website, mobile | **Do not break** listing/order resolution |
| Admin browse stock by category → line → products | `/inventory/stock-overview` | Reuse patterns; catalog page should own **create/manage**, not only browse |
| Product line + coating filter chips | `CatalogProductLine`, `CoatingFilterLabel`; sheets in stock-overview | Reuse for filters/labels; may wire into create wizard |
| Create **one** lens row via API | `POST /api/lenses/single-vision` (etc.), `app/lib/admin-create-lens.ts` | Keep for edits/edge cases; **not** sufficient for “add −6×2 → explode matrix” |
| Selectable-range helpers (shop) | `app/lib/lens-power-range.ts` | Reuse power-step / range math when generating cells |
| **Products & catalog** nav page | `/inventory/products-catalog` | **Placeholder “Coming soon”** — this RW fills it |

**Missing today:** guided product create UI; range attach that **bulk-creates** all powers; overlap validation with suggestions; product-level archive/hold that hides everywhere consistently; full progressive/kryptok attribute wizard parity.

### Meeting requirements (source of truth for behavior)

From **28 Sep** client discussion (summarized):

1. Catalog hierarchy conceptually: **lens type** (Single Vision / Kryptok / Progressive / …) → **kind / material** (e.g. hardcoat, blue cut, poly, tintable, PG, PG poly) → **index** (1.49, 1.56, 1.61, 1.67, 1.74, …) → **coatings** (green, blue, magenta, LR, dual, gold, …) → **ranges**.
2. Creating a product + range (e.g. blue cut SV 1.56 green, range −6×2) should **generate a matrix** of powers for that range.
3. Ranges are named like −6×2, −6×4, −8×2, −8×4, −10×2, −12×2 (general range helper OK).
4. **SV:** spherical + cylinder (plus/minus); no axis/add. **Kryptok:** additions + axis-style components. **Progressive:** eye / axis / addition extras.
5. **Overlap forbidden:** if −6×2 already covers −5…−6 band, creating −8×2 that accidentally includes −5…−6 must error and **suggest** the correct non-overlapping bounds (price bands differ by range — that is why ranges are separate products/slices).
6. **Archive / Hold:** holding a product makes it **not visible** on relevant screens (shop + admin lists as applicable).
7. Scale: ~200 products × ≥4 ranges ≈ 800+ ranges; 6×4 matrix × 800 ≈ ~19k powers minimum — UI must filter/bifurcate, not dump one giant page.

### Hard rules (do / do not)

**Do**

1. Keep **power-wise stock** on existing lens tables; new powers from catalog create are real DB rows with `quantity` (usually 0 until procurement receive).
2. Generate powers with a **deterministic grid** from SPH/CYL (and ADD/axis/eye where required) start/end + step (align with existing 0.25 optical steps used in shop/wholesale).
3. Validate **range overlap** within the same product identity (same type + brand/line + index + coating / equivalent key) before insert; return human-readable error + suggested range.
4. Propagate **Hold / Archive / inactive** so held products do not appear in customer catalog search, wholesale grids, and (ideally) reorder product pickers — define exact surfaces in Phase C.
5. Support **edit** of product metadata and **add additional ranges** later without recreating the whole product.
6. Idempotent-ish create: re-running generate for an existing identical cell should not duplicate SKUs (unique natural key or upsert strategy — document chosen approach).
7. Audit important creates/updates (product, range expand, archive) if audit helpers already cover inventory.

**Do not**

1. Do not replace lens tables with a new SKU master that orphans `Order` / cart / reorder FKs.
2. Do not require finishing RW-08 before starting this (independent module); do not implement PO receive inside this RW.
3. Do not auto-create reorder rules for every new power unless product asks — optional hook later; default: powers exist, rules set on power-wise stock / RW-08 matrix.
4. Do not pixel-clone the Tech video; match DrishX admin chrome.
5. Do not delete historical power rows that are on open orders — archive/hold instead of hard-delete when in doubt.
6. Do not treat “category string soup” as unchangeable forever — you may introduce a clearer Product/Range model **as long as** leaves still map 1:1 to current lens rows (facade OK).

### Target admin flow

```
Products & catalog (admin)
  → List / search / filter products (type, index, coating, brand, active/held)
  → Create product
        lens type → kind/material → index → coating(s) / brand / line labels → price defaults
  → Add range (SPH start/end, CYL start/end → display name e.g. −6×2)
        → validate no overlap
        → Generate power matrix → bulk insert lens rows (SKU leaves)
  → Preview matrix (optional) before confirm
  → Hold / Archive product (or range) → hidden from shop/ops
  → Open product → see ranges → drill to powers / link to stock-overview or power-wise stock
```

### Phases (implement in order)

#### Phase A — Page + product create + SV range → bulk powers

**Build**

- Replace `/inventory/products-catalog` Coming soon with a real list + create flow.
- **Product list:** filters by lens type, search by name/brand/coating/index; show active vs held; counts of ranges/powers if cheap.
- **Create product (Single Vision first):** capture fields that map onto today’s row shape (`category`, `brand`, `item`, `index`, `coating`, default `price` / optional `costPrice`). Reuse `CatalogProductLine` / `CoatingFilterLabel` where they fit chips/dropdowns.
- **Add range:** SPH start/end, CYL start/end (or start-range fields consistent with existing schema); derive label (−6×2 style) for display.
- **Generate:** expand grid → `createMany` (or batched creates) of `SingleVisionLens` rows for each SPH×CYL cell; set `sph`/`cyl` and range bookkeeping fields consistently with `admin-create-lens` / `lens-power-range` conventions.
- **API:** prefer dedicated catalog endpoints (e.g. `/api/admin/catalog/products`, `.../ranges`, `.../generate`) rather than only calling single-row `createAdminLens` in a loop from the browser.
- Keep existing one-row POST APIs working for compatibility.

**Done when:** Admin can create an SV product, add −6×2 (or similar), and see all expected power rows in DB / stock-overview without hand-entering each power.

#### Phase B — Overlap validation + Kryptok / Progressive

**Build**

- **Overlap engine:** before generate, compute SPH×CYL coverage (and relevant ADD/axis/eye dimensions for non-SV) for existing ranges of that product; if intersection non-empty → **400** with message like “overlaps existing −6×2 (−6.00…−0.25 × …); suggested range: …” (suggestion algorithm can be “trim to nearest non-overlapping band” — document behavior).
- **Kryptok create:** include ADD, axis (and cross where applicable) in product/range generate rules per meeting.
- **Progressive create:** include eye, axis, ADD; respect `Eye` enum and existing progressive row shape.
- Other families (OriVision / Magnus / Bifocal) — include if already sold in admin; otherwise document as follow-on and do not block A/B for SV+KT+PROG.
- Range list on product detail: add range, see power counts, link into stock.

**Done when:** Overlapping range create fails safely with a suggestion; KT + Progressive products can be created with correct extra attributes and bulk powers.

#### Phase C — Archive / Hold + navigation + shop visibility

**Build**

- **Hold / Archive** on product (and optionally per-range): sets inactive flags and/or `isDisabled` on member powers; product disappears from customer-facing catalog/wholesale queries and from admin “active” catalogs.
- Clarify **Hold** vs **Archive** in UI copy (meeting: hold = not visible; archive may be stronger/permanent — pick clear semantics and stick to them).
- Bifurcation UI: type → index → coating / brand filters so users are not scrolling 800 matrices.
- Optional: “open in power-wise stock / stock-overview” deep links filtered to that product.
- Ensure inactive products do not get new customer orders; existing open orders with that `lensId` still resolve.

**Done when:** Held product is hidden from shop paths used in production; admin can still find it under a “Held / Archived” filter and un-hold if allowed.

### Data / design notes (important for implementers)

- **Product identity key (suggested):** `lensType` + brand/line + index + coating (+ category/item as needed). Exact unique key must be chosen and documented in code comments so overlap checks and “same product” grouping stay consistent with how stock-overview groups “products” today.
- **Facade vs new tables:** Acceptable approaches: (1) thin `CatalogProduct` / `CatalogRange` tables that point at generated lens ids, or (2) derive product grouping purely from lens field equality. Prefer (1) if overlap and hold need stable IDs without string matching — but migrate carefully.
- **Price:** meeting notes ranges can have different prices (−6×2 vs −8×2). Store price on each leaf (as today) from range default at generate time; allow later bulk price edit as stretch.
- **Steps:** default 0.25 D unless client specifies otherwise; exclude “non-selling” bonus powers only if client later asks (meeting mentioned rare compounds — do **not** silently skip cells in v1 unless product confirms).

### Scope (in)

- Admin panel: Products & catalog module (list, create, ranges, generate, overlap, hold/archive)
- Bulk power generation for SV (A), KT + Progressive (B)
- APIs + Prisma as needed; reuse lens tables as stock leaves
- Wire hold into customer catalog/wholesale visibility (C)
- Docs/comments for natural keys and overlap rules

### Out of scope

- RW-08 Purchase Order / receive / Confirm Receipt
- RW-06 reports
- Full WMS / warehouse locations
- Automatically emailing suppliers or changing procurement Run button
- Pixel-perfect clone of external Tech video
- Hard-deleting powers that appear on historical invoices/orders
- Customer self-serve “request new product”

### Key code pointers

| Area | Path |
|------|------|
| Empty catalog page | `app/(admin)/inventory/products-catalog/page.tsx` |
| Stock browse / activate lines | `app/(admin)/inventory/stock-overview/page.tsx` |
| Catalog line + coating admin API helpers | `app/lib/admin-lenses.ts`, components `catalog-product-line-sheet.tsx`, `coating-filter-label-sheet.tsx` |
| Create one lens | `app/lib/admin-create-lens.ts`, `app/api/lenses/*/route.ts` |
| Range / sibling math | `app/lib/lens-power-range.ts` |
| Prisma leaves + labels | `SingleVisionLens`, `KryptokLens`, `ProgressiveLens`, `CatalogProductLine`, `CoatingFilterLabel` |
| Domain background | `docs/lens-domain-logic.md`, `docs/how-to-add-lens-data.md` |

### Open questions (do not block Phase A)

1. Exact **product unique key** fields (brand vs category vs item) matching how sales sheets name products.
2. Whether generate should **skip** rare 0.25 compounds (2.25/2.75 etc.) — default **include all** until client says otherwise.
3. Hold vs Archive: soft-hide only vs hide + block reorder rules.
4. OriVision / Magnus / Bifocal in v1 or later.
5. Whether a formal `CatalogProduct` table is required in A or grouping-by-fields is enough for MVP.

### Acceptance

- [ ] `/inventory/products-catalog` is a real module (not Coming soon)
- [ ] Admin can create SV product + range and get full power matrix rows in DB
- [ ] Overlapping range on same product is rejected with a clear suggested correction
- [ ] Kryptok and Progressive create paths support their extra power attributes
- [ ] Hold/Archive hides product from customer catalog/wholesale (and admin active lists)
- [ ] Existing orders/carts still resolve `lensId`; no orphaning rewrite
- [ ] Filters/search make large catalogs navigable
- [ ] No dependency on completing RW-08; SKU leaves remain `lensType`+`lensId`

### Suggested first PR

Phase A: real Products & catalog list + SV product create + one range generate (bulk insert) + basic product detail. Then Phase B overlap + KT/PROG. Then Phase C hold/archive + shop query filters.

---

## RW-10 — Admin panel: create order on behalf of customer

### Type

New feature — admin Order Management (dedicated create-order flow + attribution)

### Audience note (for humans + AI)

Client wants admins to **place orders inside the admin panel** with a **dedicated flow/UI** (not “go use the website employee app”). Orders must remain owned by the **customer** (`Order.userId` = customer) and must be clearly marked as **placed by admin** (who + source), visible on admin list/detail.

Website **employee** on-behalf (`/employee/orders/on-behalf`) already exists and can stay for staff. This RW is the **admin-panel** path.

### Goal

Add an admin-only **Create order** experience: pick an approved customer → choose order type → build lines / RX (and later color/wholesale) → place via existing checkout APIs → persist attribution (`placed by admin`, source = admin panel) → show a badge on order list and detail. Same stock reserve, cutoff, delivery, and pricing rules as normal customer checkout — do not invent a parallel order engine.

### Current state

| Piece | Status |
|--------|--------|
| Website employee on-behalf (customer → catalog / RX / white / color) | **Exists** — `drishx-website` `/employee/orders/on-behalf` |
| APIs accept staff + `userId` (customer) for cart, retail order, RX, color, wholesale | **Exists** — `ADMIN` and `EMPLOYEE` treated as staff |
| Admin panel create order UI | **Missing** |
| Admin panel return-on-behalf from order detail | Exists (returns only) |
| `Order.userId` | Customer owner — correct; keep |
| Explicit `placedBy` / `orderSource` on `Order` | **Missing** — create is only loosely visible via audit / `OrderActivityLog` actor |

### Hard rules (do / do not)

**Do**

1. Build **dedicated admin UI** under Order Management (new route + sidebar/action from Orders).
2. Keep `Order.userId` = **customer**. Never set the admin as the order customer.
3. Persist attribution on create, e.g.:
   - `placedByUserId` → admin user id  
   - `orderSource` → `ADMIN_PANEL` (enum also allowing `CUSTOMER_APP`, `EMPLOYEE_ON_BEHALF` for consistency)  
   - Optionally store role snapshot if useful for display  
4. Show admin UI badge: **“Placed by admin · {name}”** on list + detail (and activity message on create).
5. Reuse existing place/cart/RX/color/wholesale APIs and libs (`place-order`, stock reserve, cutoff, delivery). Pass `userId` = selected customer; session = admin.
6. Default customer picker to **approved / active** customers (align with Clients). Block or warn on incomplete/unapproved unless product says otherwise.
7. Respect **RW-05** when implemented: admin-created RX/photo still follow admin-hold → warehouse release (do not bypass hold by placing from admin).
8. Write audit + order activity: actor = admin, message includes on-behalf customer.

**Do not**

1. Do not deep-link/iframe the website employee on-behalf screen as the “solution.”
2. Do not put “Placed by admin” only in customer-visible `notes` as the sole signal — use real fields + badge.
3. Do not change customer app checkout.
4. Do not remove or break website employee on-behalf.
5. Do not rebuild pricing, inventory reservation, or dispatch cutoff logic.
6. Do not require RW-08/09 to start (independent); catalog/RX product pickers use today’s lens APIs.

### Target admin flow

```
Admin → Orders → Create order
  1. Select customer (search by name / business / email / mobile)
  2. Choose type: Catalog (retail) | RX | Color (phase) | Wholesale (phase)
  3. Build order (powers, qty, notes, delivery service as required by type)
  4. Review totals / stock warnings
  5. Confirm → existing APIs with userId = customer
  6. Set placedByUserId + orderSource = ADMIN_PANEL
  7. Redirect to /orders/[id] with “Placed by admin” badge
```

### Phases

#### Phase A — Attribution + Catalog (retail) create + badge

**Build**

- Prisma: add `orderSource` enum + `placedByUserId` (FK to `User`, nullable for legacy rows). Backfill legacy as null / `CUSTOMER_APP` guess only if safe; otherwise leave null.
- On all create paths used by this flow (at least retail `POST /api/orders` / shared `place-order`): when session is ADMIN and body targets another `userId`, set `orderSource = ADMIN_PANEL`, `placedByUserId = session.userId`.
- Admin UI: `/orders/new` (or `/orders/create`) — step 1 customer, step 2 catalog line picker (reuse admin lens search patterns from inventory/orders), qty, notes, delivery if required, submit.
- Orders list + detail: badge when `orderSource === ADMIN_PANEL` (and show placer name).
- Activity: “Order created on behalf of {customer} by admin {name}.”

**Done when:** Admin can place a normal catalog order for a customer from the admin panel; detail shows who placed it; customer owns the order.

#### Phase B — RX (and photo if in scope)

**Build**

- Admin create flow branch for **RX** (same fields as customer/employee RX; call `POST /api/orders/rx` with `userId`).
- Optional: photo prescription upload on behalf if product needs it in admin (same API patterns as photo route — extend for staff `userId` if not already).
- Wire RW-05 hold behavior once RW-05 exists (create should not dump RX onto warehouse queues early).

**Done when:** Admin can place RX for a customer from admin panel with attribution badge.

#### Phase C — Color + Wholesale (as needed)

**Build**

- Color-lens wizard subset or “start color order” that posts to color-lens API with `userId`.
- Wholesale matrix checkout via existing wholesale-checkout + `userId` if client requires admin wholesale placement in panel.
- Filter orders by `orderSource` / “Placed by admin” on list.

**Done when:** Agreed extra channels work from admin with same attribution.

### Attribution display (product copy)

| Surface | Suggested UI |
|---------|----------------|
| Admin orders table | Pill: `Admin` or `Placed by admin` |
| Admin order detail | Line: `Placed by admin · {admin name} · {datetime}` |
| Customer web/mobile | Default: **do not** show admin name unless client asks; order still appears under their account normally |
| Employee order views | Can show same badge if useful for ops |

### Scope (in)

- Admin panel dedicated create-order UI + routing/nav
- Schema attribution + set on admin create
- Phase A catalog + badge; Phase B RX; Phase C color/wholesale if required
- Reuse staff-capable order APIs with `userId`
- Audit / activity on create
- Approved-customer selection rules

### Out of scope

- Replacing website employee on-behalf
- Multi-warehouse, procurement PO, catalog product-master (RW-08/09)
- Payment gateway / offline payment capture at create (unless already part of normal checkout)
- Letting admin create orders as themselves (no customer)
- Changing loyalty earn rules beyond “order belongs to customer”

### Key code pointers

| Area | Path |
|------|------|
| Retail place | `app/api/orders/route.ts`, `app/lib/place-order.ts` |
| RX on behalf | `app/api/orders/rx/route.ts` (already staff + `userId`) |
| Color on behalf | `app/api/orders/color-lens/route.ts` |
| Cart / wholesale staff `userId` | `app/api/cart/route.ts`, `app/api/orders/wholesale-checkout/route.ts` |
| Admin orders UI | `app/(admin)/orders/`, `app/(admin)/orders/[id]/page.tsx` |
| Website employee on-behalf (reference only) | `drishx-website` `components/employee/employee-order-on-behalf-screen.tsx` |
| Order model | `prisma/schema.prisma` → `Order` |
| Activity / audit | `OrderActivityLog`, `recordAuditEvent` / `ORDER_CREATED` |

### Open questions (do not block Phase A)

1. Must customer see “placed by office/admin” on their app? Default **no**.
2. Photo prescription from admin in v1 or RX-form only?
3. Wholesale/color required for first release or Phase C?
4. Should **EMPLOYEE_ON_BEHALF** also set `placedByUserId` when website staff places (nice consistency; can be small follow-up)?
5. Interaction with RW-05 timing — implement attribution first; hold rules when RW-05 merges.

### Acceptance

- [ ] Admin can open a dedicated Create order flow in the admin panel
- [ ] Catalog order for an approved customer succeeds; `userId` is the customer
- [ ] `orderSource = ADMIN_PANEL` and `placedByUserId` set to the admin
- [ ] List + detail show “Placed by admin · {name}” (or equivalent)
- [ ] Stock/cutoff/delivery behave like normal checkout
- [ ] Website employee on-behalf still works
- [ ] RX creatable from admin (Phase B) with same attribution
- [ ] No reliance on stuffing attribution only into `notes`

### Suggested first PR

Schema (`orderSource`, `placedByUserId`) + set on admin retail create + `/orders/new` customer + catalog place + list/detail badge. Then RX. Then color/wholesale if needed.
