# DrishX � Remaining Work

**Document type:** End-phase backlog (bugs, changes, new modules)  
**Audience:** Developers picking up assigned work  
**Last updated:** 2026-11-04 (doc sync: most RWs shipped; residuals noted below)

## How to use

- Each item has a stable ID (`RW-01`, `RW-02`, …).
- Default sections: **Type**, **Goal**, **Current state**, **Scope (in)**, **Out of scope**.
- Larger items (e.g. RW-06, RW-08, RW-09, RW-11, RW-12) add extra sections: catalog, architecture, phases, data sources, open questions, PDF UI references.
- Cross-repo work is listed under **Repos** in the index.
- **Residuals (not feature work):** (1) RW-01 optional staging soak when a long-lived staging env is available; (2) RW-06 Profit & Margin stays deferred until invoice-line COGS exists; (3) RW-12 Phase E live 2factor/email/GSTIN credentials when the client delivers keys.

---

## Index

| ID | Task | Status | Repos |
|----|------|--------|-------|
| RW-01 | Auth session drops mid-use — Unauthorized / forced re-login | Shipped (ops soak optional) | backend, website, mobile, admin panel |
| RW-02 | Admin grouped orders overview (card UI) | Shipped | backend (admin panel) |
| RW-03 | Returns: show fuller order details (list + detail) | Shipped | backend (admin panel) |
| RW-04 | Customer status: abandoned signups + admin status changes | Shipped | backend (admin panel; loyalty filters) |
| RW-05 | RX + photo order visibility (admin hold → warehouse) | Shipped (photo retired RC-02) | backend, website, mobile, admin panel |
| RW-06 | Reports module (client report catalog, phased) | Shipped; Profit & Margin deferred | backend (admin panel) |
| RW-07 | Client registration form — most fields optional | Shipped | backend, website, mobile |
| RW-08 | Procurement: Purchase Order → receive → close (power-wise) | Shipped | backend (admin panel) |
| RW-09 | Products & catalog: admin product master + ranges → powers | Shipped (RC-03/04/05 parent+variants) | backend (admin panel) |
| RW-10 | Admin panel: create order on behalf of customer | Shipped | backend (admin panel) |
| RW-11 | Client API calling pattern + list/table performance | Shipped | backend, website, mobile, admin panel |
| RW-12 | Customer account config — OTP clients, reject/resubmit, Path C | Shipped (DEV OTP); Phase E credentials later | backend, website, mobile, admin panel |

---

## RW-01 — Auth session drops mid-use (Unauthorized)

**Status (2026-11-04):** **Shipped for acceptance.** Refresh-on-401 + single-flight `refreshPromise` + non-refreshable account codes + transient refresh backoff (admin `admin-auth-fetch`, web/mobile `auth-fetch`). Backend rotation race policy covered by `auth-refresh-race.test.ts`. Soak script: `scripts/e2e-rw01-refresh-soak.mjs` (local + deployed Vercel `drishx-admin-backend.vercel.app` — PASS).

### Type

Bug — session / refresh reliability (all clients)

### Goal

Users stay signed in for the life of a valid refresh session. Across **admin panel**, **web app**, and **mobile**, expired access tokens should refresh silently; force re-login only when the refresh session is truly invalid.

### Current state

Access JWT is **15 minutes**; refresh is **30 days** (cookie on web/admin, secure store + body on mobile). Auth-fetch wrappers on all three clients share one in-flight refresh, skip silent refresh for account/permission `401` codes, and retry once after transient refresh failures before surfacing auth failure.

### Scope (in)

- Silent refresh + retry when access token expires and refresh is still valid
- Consistent `401` codes so clients know when to refresh vs force login
- All authenticated API calls on admin, website, and mobile go through the auth fetch path
- Cover admin (same-origin), website (BFF proxy + cookies), and mobile (secure refresh storage)

### Out of scope

- New auth providers or role-model changes
- “Fix” by only lengthening access-token TTL without making refresh reliable
- Permission / inactive / pending-account errors (those should still surface, not silent-refresh)

### Acceptance

- [x] Silent refresh + retry on expired access with valid refresh (admin / web / mobile)
- [x] Single-flight refresh under parallel 401s (shared `refreshPromise`)
- [x] Non-refreshable account/permission codes do not trigger silent refresh
- [x] Transient refresh failure: one short backoff + second attempt before logout
- [x] **Local soak:** parallel authenticated calls after access JWT near-expiry / refresh path exercises single-flight (dev)
- [x] **Deployed soak:** same script against `https://drishx-admin-backend.vercel.app` (login + 12 parallel authed calls + parallel refresh) — PASS 2026-11-04

---

## RW-02 — Admin grouped orders overview (card UI)

**Status (2026-11-04):** **Shipped for acceptance.** `/orders/overview` + `AdminOrdersGroupedOverview` (group by date / customer).

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
- Changing order lifecycle, assignment, or fulfillment APIs beyond what�s needed to list/group for this page

---

## RW-03 — Returns: show fuller order details (list + detail)

**Status (2026-11-04):** **Shipped for acceptance.** Returns list/detail show order catalog summary, status, amounts, and customer business context.

### Type

Change / UX — admin Returns & Replacements

### Goal

On admin **returns list** and **return detail**, the linked order(s) currently show too little (label, qty, reason, powers). Staff need the same necessary order fields as the Orders screen (order id, customer/business, catalog/lens summary, status, amounts, etc.) so they can understand the full return story without leaving the page. Layout can differ from the Orders table, but the information should match what Orders already surfaces.

### Current state

`/returns` and `/returns/[id]` focus on return workflow (status, items, photos, admin decision). Returned items expose `lensLabel`, qty, reason, original/requested powers, and remarks � not the fuller order context used on `/orders` and `/orders/[id]`.

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

**Status (2026-11-04):** **Shipped for acceptance.** Clients tabs include incomplete; pending bucket + `setCustomerApprovalAction` (approve/reject/reopen/etc.).

### Type

Bug / change — admin Clients & customer approval lifecycle

### Goal

Fix two related gaps: (1) Users who start customer signup and abandon mid-wizard are already saved in the DB (`PENDING_REVIEW`, often without GST) but do **not** appear on Clients pending/approved � so admin cannot manage them � yet they **do** appear on Loyalty. (2) Admin cannot change status of an approved (or other) client back to pending or otherwise move statuses; approve/reject is only offered for pending+GST applications. Admin must be able to see incomplete/abandoned customers and change customer approval status as needed (including after approve).

### Current state

Signup creates the customer immediately with `approvalStatus: PENDING_REVIEW`, `isApproved: false`. Pending Clients API requires `gstNumber != null`; approved list requires `isApproved: true` � incomplete rows are invisible. Loyalty customers API lists all `role: CUSTOMER` with no approval filter. Approve API/UI only supports `approve` | `reject`, and detail actions show only when status is pending with GST � no reopen-to-pending or general status change for approved clients.

### Scope (in)

- Surface incomplete/abandoned signups on admin Clients (e.g. incomplete tab/filter or include in pending with clear labeling) so admin can act on them
- Align Loyalty (and any similar �all customers� lists) so incomplete/unapproved accounts do not appear as normal loyalty customers unless product says otherwise
- Allow admin to change customer approval status beyond one-way pending?approve/reject (at least: manage approved clients � e.g. reject/suspend/reopen to pending � with clear rules and UI on list/detail)
- Keep existing statuses: `PENDING_REVIEW`, `APPROVED`, `REJECTED` (+ `isActive` / `isApproved` consistency)

### Out of scope

- Redesigning the full customer self-signup wizard on web/mobile (unless a small hook is needed for status)
- Employee creating customers
- Loyalty points earning/redemption rules beyond who appears in the loyalty customers list

---

## RW-05 — RX + photo order visibility (admin hold → warehouse)

**Status (2026-11-04):** **Shipped for acceptance.** RX admin hold → assign → release; photo create retired (RC-02/RC-05). See `prescription-order-hold.ts`.

### Type

Change — order visibility / roles (RX prescription hold)

### Goal

**RX form orders** must stay **admin-only** until the physical warehouse step: admin reviews, can **assign**, and **manually marks** the order available / at warehouse. Only then should warehouse employees see them on staff RX queues.

**Update (RC-02):** Photo prescription create is **retired** (`POST /api/orders/photo` → 410). Hold/release/list/notify apply to **RX only** (`[RX Order]` notes). Do not treat legacy `orderImageUrl` rows as RX-lab siblings.

### Current state (post RC-02)

RX: `notes` containing `[RX Order]`; create uses warehouse hold → assign → release. Admin `/orders/rx-lab` is RX-only. Photo create unwired; legacy image rows stay on catalog lists with neutral “Image attached” UX.

### Scope (in)

- On create (RX): do **not** put on employee warehouse queues yet (no premature assign/notify, or equivalent hold)
- Admin panel always sees these orders; admin can **assign** and **manually mark available / at warehouse**
- After mark (+ assign as designed): employees with the right permission see them on staff queues (web + mobile)
- Enforce in **API** and UI; extend staff permissions/roles as needed (view vs work after release)

### Out of scope

- Photo prescription product (retired — see **RC-02**)
- Catalog / wholesale / color order queues
- Full RX pricing/lab workflow redesign beyond hold → mark warehouse → assign → staff see

---

## RW-06 — Reports module (client report catalog, phased)

**Status (2026-11-04):** **Shipped for acceptance (P1–P4).** Reports hub + `app/lib/reports` registry/`runReport` cover the client catalog. **Decision: keep Profit & Margin deferred** (`deferred-reports.ts` + `profit-cogs.ts`) until invoice-line historical COGS is persisted — do **not** invent margin from catalog `costPrice` or same-period purchases.

### Type

New feature — Admin **Reports hub** (financial, inventory, power, order, sales)

### Goal

Deliver the client's full report list as a structured **Reports** area in the admin panel (not 30 one-off pages). Reuse existing finance/inventory/order data; add shared query layer + consistent UI (filters, tables, later export). Build in **phases** so P1 can ship without waiting on SKU redesign or perfect stock-history.

### Current state

- **Reports hub:** admin Reports UI + `GET /api/reports` via `app/lib/reports` (registry, `runReport`, export helpers).
- **Runnable keys (phase ≤ 4):** `gst-summary`, `sales-summary`, `purchase-summary`, `outstanding-customers`, `payment-collection`, order lists (`pending` / `completed` / `cancelled` / `rx` / `ready-stock`), daily/monthly/quarterly/yearly sales, stock reports (current / reserved / available / product-wise / power-wise / OOS / low / valuation), power movement (`fast` / `slow` / `dead` / `unsold`), `stock-aging`.
- **Deferred (blocked, not fake):** `profit-margin` only — see `app/lib/reports/deferred-reports.ts` and `profit-cogs.ts`.
- **Legacy:** Finance GST/HSN/power-wise sales pages may still exist; hub is the structured reports product.
- P4 thresholds (fast/slow/dead windows, valuation basis, aging honesty) are documented on report definitions — not silent invented numbers.

### Client report catalog (required set)

#### Financial Reports

| Report | Notes for implementer |
|--------|------------------------|
| Sales Summary | Aggregate sales (prefer invoice lines / paid or issued invoices � confirm status filter) |
| Purchase Summary | Aggregate purchases (`PurchaseBill` and related) |
| Profit & Margin Report | **Deferred** — needs historical invoice-line COGS (`profit-cogs.ts`); do not invent margin |
| Outstanding Customers Report | Largely wrap receivables / unpaid invoices + aging |
| Payment Collection Report | Payments + confirmed payment claims in period |
| GST Summary Report | **Already implemented** � move/link into Reports hub |

#### Inventory Reports

| Report | Notes for implementer |
|--------|------------------------|
| Current Stock Report | On-hand `quantity` per catalog row (`lensType` + `lensId`) |
| Power-wise Stock Report | Group/filter stock by power fields on rows / order powers |
| Product-wise Stock Report | Group by category/brand/item/coating (product key) |
| Reserved Stock Report | Open-order committed qty (`reservedQuantity - pickedQuantity`) |
| Available Stock Report | `onHand - committed` (`getAvailableQuantity`) |
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
| Pending Orders Report | Status filter (clarify which statuses count as �pending�) |
| Completed Orders Report | `COMPLETED` |
| Cancelled Orders Report | `CANCELLED` |
| RX Orders Report | `notes` contains `[RX Order]` only (RC-02: photo create retired; do not mix `orderImageUrl`) |
| Ready Stock Orders Report | **Needs client definition** (non-RX catalog? dispatch-ready? fully reserved?) |

#### Sales Reports

| Report | Notes for implementer |
|--------|------------------------|
| Daily Sales Report | Bucket by day (invoice or order date � confirm) |
| Monthly Sales Report | Calendar month / FY month |
| Quarterly Sales Report | Quarters |
| Yearly Sales Report | Calendar year and/or Indian FY (project already has FY helpers) |

### Architecture (how to build)

Do **not** create one unrelated page per report with duplicated Prisma queries.

```
Admin UI: Reports hub (categories ? report ? filters ? table [? export])
        �
        ?
GET /api/reports?report=<key>&from=&to=&fy=&...   (or /api/reports/[key])
        �
        ?
app/lib/reports/*
  - registry: key, title, category, filters, columns
  - queries: one function per report (or shared aggregators)
  - reuse: finance FY helpers, receivables aging, order-inventory available/reserved
```

**SKU note:** Inventory/power reports should key off **today�s catalog row** (`lensType` + `lensId`). Do not block this module on a full SKU rewrite. A future SKU facade can improve labels only.

**Not the same as:** warehouse power-matrix / verify-sheet procurement UI (meeting �power-wise stock� operations). Those are operational screens; this RW is **reporting**.

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

1. **Profit & margin** � exact formula (sales - purchase cost only? include procurement expenses, credit notes, returns)?
2. **Sales date basis** � invoice `issuedAt` vs order `createdAt` vs payment date?
3. **Fast / slow / dead / unsold** � time window and unit thresholds?
4. **Low stock** � always `ReorderRule.minStock`, or global default when no rule?
5. **Stock valuation** � `costPrice`, `price`, or weighted average?
6. **Stock aging** � age from last receipt only; what if no movement history?
7. **Ready stock orders** � definition?
8. **RX report** — RX notes only (RC-02: no photo)
9. **Export** � CSV only, or Excel too, for v1?

### Acceptance (module-level)

- [x] Admin can open a Reports hub and run P1 reports with correct filters
- [x] GST Summary remains available and matches current finance report numbers
- [x] Inventory reserved/available reports match order-inventory semantics
- [x] Unknown report keys fail cleanly; unauthorized roles blocked
- [x] P2–P4 shipped where runnable; **Profit & Margin** explicitly deferred on historical COGS (`deferred-reports.ts` / `profit-cogs.ts`) — no silent fake thresholds

### Suggested first PR

Done — hub + registry + phased catalog. Follow-up only when invoice-line historical COGS lands for Profit & Margin.

---

## RW-07 — Client registration form: most fields optional

**Status (2026-11-04):** **Shipped for acceptance.** Signup requires name + email + mobile (+ password/OTP path); business/GST/addresses optional on API (`signup` / `gst`) and client wizards. Aligns with RW-04 incomplete vs pending-ready.

### Type

Change — customer signup / onboarding (web + mobile + API)

### Depends on

**Depends on RW-04 (shipped).** RW-04 owns incomplete/abandoned Clients visibility and admin status changes.

### Goal

Relax customer registration so **only name, email, and contact (mobile)** are required at minimum (password remains required for auth). Shop/business, GST, billing, and shipping fields become optional. Users who skip or leave blanks still exist as customers and are managed through the **RW-04** incomplete / status paths — do not invent a parallel approval model.

### Current state

**Done.** Sparse signup is accepted; optional GST/address payload writes nulls when blank. Incomplete signups surface under RW-04 incomplete.

### Scope (in)

- Required minimum: **name, email, contact (mobile)** (+ password for account creation)
- Make remaining signup/wizard fields optional on **website**, **mobile**, and **backend** (`POST /api/auth/signup`, `POST /api/auth/gst`)
- Validate GSTIN/PAN format only when those values are provided
- Preserve existing wizard steps/flow shape where practical (optional/skippable fields, not a greenfield onboarding redesign)
- Align with RW-04: no GST / mid-wizard abandon ? **incomplete**; with GST ? existing **pending-ready** approve path; no change to RW-04 status model

### Out of scope

- Changing RW-04 (incomplete tab, loyalty filters, admin status transitions) � consume it as-is
- Admin create-customer form (unless a tiny hook is required)
- Invoice/GST tax-type product rules beyond accepting sparse profiles
- Forcing profile completion before first order (unless product later requires it)

---

## RW-08 — Procurement: Purchase Order → receive → close (power-wise)

**Status (2026-11-04):** **Shipped for acceptance (Phases A–C).** Residual polish only (live supplier email send / claim modules if requested).

### Type

New module / change — admin procurement (Purchase Order lifecycle on top of existing reorder)

### Audience note (for humans + AI)

This is the **single procurement PO task**. Implement against **this document + the client procurement PDF** (share the PDF with screenshots). Below, **PDF UI references** describe what each screenshot looks like so you know which mock is for which step � match layout/intent; use existing DrishX admin UI components (do not pixel-copy a foreign sidebar).

**SKU:** treat today�s catalog leaf as the SKU � `lensType` + `lensId` (power row). Do **not** build a new SKU master table as a prerequisite. Product/range labels on screens are display fields derived from the lens row / product tree.

### Goal

Deliver the full admin **Purchase Order** path the client described: power-wise threshold/target ? manual **Run reorder** (keep) ? generate **PO** (draft ? review ? approve/open ? sent) ? **Receive goods** (supplier bill + power-wise Excel) ? validate ? reconcile (power-wise + range-wise) ? resolve exceptions ? **Confirm Receipt** (only then stock updates) ? close outstanding with reasons ? PO closed. While a PO is open for a given power, **never** create another PO for that same power. Reorder may raise that power again **only after** the PO is closed.

### Current state (shipped)

**Status (2026-11-04):** **Shipped for acceptance (Phases A–C).** Schema, APIs, admin UI, receive/confirm, and stock matrix are in-repo. Unit coverage: `purchase-order-*.test.ts`, `stock-matrix.test.ts`.

| Piece | Where |
|-------|--------|
| Models | `PurchaseOrder`, `PurchaseOrderLine`, `OpenPurchaseOrderPower`, allocations, goods receipts (Prisma) |
| APIs | `app/api/procurement/purchase-orders/**`, `app/api/procurement/receipts/**` |
| Domain | `app/lib/purchase-orders.ts`, receive/math/excel/wizard/allocations, `goods-receipts.ts` |
| Admin UI | `/procurement/purchase-orders` (list / new / detail / receive) |
| Matrix | `/inventory/stock-matrix` + `/inventory/power-wise-stock` (Current / Threshold / Target; current read-only) |
| Reorder + incoming | Manual Run reorder kept; `incoming` includes open PO outstanding; open-power lock blocks duplicate PO |

Legacy reorder requests + suppliers/bills remain. No new SKU master.


### Hard rules (do / do not)

**Do**

1. Keep **manual Run reorder** � admin clicks Run; system raises requirements; humans build/approve POs.
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
5. Do not implement full QC quarantine / put-away / client allocation warehouse WMS from the PDF flowchart end � out of scope for v1 (stock becomes available on Confirm Receipt unless product later asks for QC gate).
6. Do not hardcode a single warehouse forever without an abstraction � use a **Main Warehouse** stub + customizable warehouse option for future multi-warehouse.

### Target end-to-end flow

```
Reorder rules (threshold/target per power)
  ? Stock monitoring / Run reorder (manual)
  ? Purchase requirements (ProcurementRequest � keep)
  ? Create PO (add from reorder queue / import / search)
  ? Review ? Approve ? PO OPEN / Sent to supplier
  ? Receive shipment (upload Bill PDF + Power-wise Excel)
  ? Validate documents ? Reconcile (power + range)
  ? Resolve exceptions (short/extra/damaged; keep open vs close)
  ? Confirm Receipt ? stock += accepted received
  ? Close outstanding (reasons) ? PO CLOSED
  ? Only then can Run reorder raise that power again
```

### Phases (implement in order)

#### Phase A � PO core + open-PO guard

**Build**

- Data model: `PurchaseOrder`, `PurchaseOrderLine` (power = `lensType`+`lensId`, product/range labels, required qty, PO qty, rate optional, amounts).
- Statuses at least: `DRAFT` ? `PENDING_APPROVAL` ? `OPEN` / `SENT` ? `PARTIALLY_RECEIVED` ? `CLOSED` / `CANCELLED` (names can match Prisma enums; intent matters).
- UI: **Create Purchase Order** wizard (Select Items ? Review ? Approve).
- Header fields: Supplier (dropdown), Expected Delivery (date), Warehouse (Main + extensible).
- Lines table: Product, Range, Power, Required, PO Qty (editable), Rate (?, may be empty), Amount.
- Actions: Add from Reorder Queue, Import Excel (optional in A), Search product/power, Add row, Save Draft, Next Review, Approve.
- PO detail: status badge, Download PDF / Download Excel, Approve; tabs Details / Items / Documents / History (Documents/History can be thin in A).
- After approve: acknowledgement **PO Sent to Supplier** (downloads + optional Send via Email can be stub or real SMTP later).
- Wire **incoming** for reorder-check to include outstanding qty on **OPEN / SENT / PARTIALLY_RECEIVED** PO lines for that power.

**Done when:** Admin can create a draft PO from reorder queue, approve it open, and Run reorder **does not** double-order the same open powers.

#### Phase B � Receive, validate, reconcile, confirm, close

**Build**

- From PO (status OPEN/SENT): **Receive Shipment** ? Receive Goods wizard: Select PO ? Upload Documents ? Validate ? Reconcile ? Confirm.
- Uploads (both required for happy path): **Supplier Bill** (PDF/image) + **Power-wise Excel** (client will provide template � code to a documented template shape).
- Optional shipment meta: Supplier, PO, Dispatch Date, Courier, AWB/Tracking, Package Count (from PDF receive mock).
- **Document Validation:** checks (supplier/product/SKU/PO match, duplicates, format, qty = ordered warnings); summary Valid / Warnings / Errors; View Exceptions; Next Reconcile.
- **Receipt Reconciliation (power-wise):** tabs All / Matched / Short / Extra / Invalid; columns Ordered, Received, Accepted, Short, Status, Action (e.g. Keep Pending, Mark Damaged).
- **Range-wise Reconciliation:** Bill Qty vs Excel Qty per product+range; Matched / Mismatch; resolve mismatch (bill correction / Excel correction / accept Excel & flag invoice / keep pending).
- Buttons on reconcile screen: **Save as Draft** (nothing posted), **Resolve Exceptions** (only if discrepancies), **Confirm Receipt**, **Cancel** (no changes).
- **Confirm Receipt** dialog must state e.g. �N units will be added to stock. M units remain outstanding against PO #�. Bill quantity reconciled. Continue?� � only on Confirm post stock + attach bill into purchase management.
- **Close Outstanding Quantity** with reasons:
  - Supplier unable to supply
  - Supplier discontinued item
  - Supplier cancelled balance
  - Commercial disagreement
  - Buyer cancellation
  - Other  
  Then Ordered / Received / Cancelled; PO can close. Exception screen options (Keep Open / Close Shortage / Create Supplier Claim / Request Replacement) � claims/replacement may be stubbed; **Keep Open** and **Close Shortage** must work. Options need not be mutually exclusive where PDF says so.
- Manual PDF bill upload in purchase management (outside PO path) for bills without usable ranges � minimum viable.

**Done when:** Partial receive + confirm updates stock correctly; outstanding can be closed with reason; closed PO allows reorder again; open PO still blocks duplicate PO for that power.

#### Phase C � Matrix UX + supplier polish

**Build**

- Power matrix for threshold/target (and/or stock view): product title + range subtitle; SPH�CYL grid; cell `Current / Threshold / Target`; below-threshold highlighted; current not editable.
- Navigation/filters so ~800 ranges are usable (product bifurcations � type / index / coating / search). Reuse patterns from power-wise stock + catalog filters where possible.
- Richer **supplier profile** (business entity, GST, addresses, phone, contact person) � closer to client profile depth.
- Fill gaps: email send PO, full Documents/History tabs, Import Excel on create PO if deferred from A.

**Done when:** Matrix editing is usable for day-to-day reorder setup; suppliers are proper profiles.

### PDF UI references (what the screenshots look like)

Use the client procurement PDF images as layout/intent references. Finder phrases:

| # | What the image shows (find this in the PDF) | Use for |
|---|---------------------------------------------|---------|
| 1 | **Title-like product header** e.g. �Prime BRC HC�, subtitle **Range: -0.25 to -2.00**; **SPH � CYL matrix**; each cell three numbers **`Current / Threshold / Target`**; legend; **red/pink cells** when below threshold | Phase C matrix; also explain power-wise thresholds |
| 2 | Small **example table**: Product, SKU, Power, Current Stock, Threshold, Target Stock (e.g. Air Smart BRC 1.61) � some rows below threshold | Reorder calc examples; SKU=power leaf |
| 3 | Screen **�Create Purchase Order�**; stepper **Select Items ? Review & Edit ? Approve**; fields Supplier / Expected Delivery / Warehouse; buttons **Add from Reorder Queue**, **Import Excel**, search; line table Product/Range/Power/Required/PO Qty/Rate/Amount; totals; **Save Draft** + **Next: Review** | Phase A create wizard |
| 4 | Screen **PO number** e.g. `PO-2025-00481` + badge **Pending Approval**; buttons Download PDF / Download Excel / **Approve**; tabs Details / Items / Documents / History; meta supplier/warehouse/dates/totals; items table | Phase A review/approve detail |
| 5 | Screen **�PO Sent to Supplier�** + green **Sent** badge; text that PO was sent; Download PDF/Excel; **Send via Email**; Supplier Details card (name, email, phone, contact) | Phase A post-approve ack |
| 6 | Flow mock: PO status **Acknowledged**, Ordered/Received/Outstanding, button **[ Receive Shipment ]** ? **Shipment Details** with courier/AWB fields + **Upload Stock Excel** + **Upload Supplier Bill** | Phase B entry into receive |
| 7 | Screen **�Receive Goods�**; stepper **Select PO ? Upload Documents ? Validate ? Reconcile ? Confirm**; PO dropdown + Ordered/Previously Received/Remaining; two upload tiles **Supplier Bill** + **Power-wise Excel**; **Validate Documents ?** | Phase B upload step |
| 8 | Pair of UIs: **�Document Validation�** checklist (Valid / Warnings) + counts; and **�Receipt Reconciliation�** with tabs All/Matched/**Short**/Extra/Invalid; table Ordered/Received/Accepted/Short/Status/Action (Keep Pending, Mark Damaged) | Phase B validate + power reconcile |
| 9 | Tables: PO ordered powers ? Supplier Excel received ? **DrishX calculates** Ordered/Received/**Short** (e.g. short 6 on one power) | Phase B short math |
| 10 | **�Range-wise Reconciliation�** table Product/Range/Bill Qty/Excel Qty/Difference/Status Matched\|Mismatch; side panel **Quantity Mismatch** with radio resolutions | Phase B range reconcile |
| 11 | Spec block **�20 After Upload** summary (PO qty vs Excel vs Bill vs Short) + power-wise table with ? / ?; **�21 buttons**: Save as Draft, Resolve Exceptions, Confirm Receipt, Cancel | Phase B reconcile actions |
| 12 | **�22 Exception Screen** � �Short Receipt Detected�; PO/Received/Short box; actions Keep Open / Close Shortage / Create Supplier Claim / Request Replacement; note actions need not be mutually exclusive | Phase B exceptions |
| 13 | Text NOTE on **Confirm Receipt** dialog copy + **Close Outstanding Quantity** reason list + Ordered/Received/Cancelled ? PO close ? reorder only after close; open-PO no duplicate | Phase B hard rules (also in Hard rules above) |
| 14 | ASCII/flowchart: Reorder rule ? � ? PO ? Sent ? Stock Excel + Bill ? Receiving/Validation/Reconciliation ? Match/Short/Excess ? Confirm Receipt ? (QC�) ? Available | Overall architecture; **stop before full WMS/QC** unless later scoped |

### Scope (in)

- Admin panel only (backend APIs + admin UI)
- Phases A ? B ? C as above
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
| PO domain + HTTP | `app/lib/purchase-orders.ts`, `app/lib/purchase-order-http.ts`, `app/lib/admin-purchase-orders.ts` |
| Receive / confirm | `app/lib/goods-receipts.ts`, `app/api/procurement/receipts/[id]/confirm/route.ts` |
| Run reorder | `app/api/inventory/reorder-check/route.ts`, cron `app/api/cron/stock-reorder/route.ts` |
| Request create / incoming / approve | `app/lib/procurement-requests.ts`, `app/lib/procurement-rules.ts` |
| Admin PO + matrix UI | `app/(admin)/procurement/purchase-orders/**`, `app/(admin)/inventory/stock-matrix/page.tsx` |
| Requests UI | `app/(admin)/procurement/requests/page.tsx` |
| Suppliers / bills today | `Supplier`, `PurchaseBill`, `app/(admin)/finance/purchases/page.tsx` |
| Stock increment patterns | `app/lib/stock-intake.ts` (post only on Confirm Receipt) |

### Open questions (mostly settled)

1. Receive Excel template — implemented parser + downloadable template (`purchase-order-excel` / import).
2. Status enum — `SENT` is distinct from approved/open (covered in tests).
3. **Send via Email** — mailto stub OK for v1; live SMTP optional follow-up.
4. Supplier Claim / Request Replacement — UI stubs acceptable; full modules out of v1 unless client asks.
5. QC before stock — default remains **stock available on Confirm Receipt**.

### Acceptance

- [x] Run reorder still manual; still creates/updates demand without auto-PO
- [x] Admin can create draft PO from reorder queue, review, approve → open/sent
- [x] Open PO qty for a power blocks a second PO for that power
- [x] Receive: bill + Excel → validate → reconcile → Confirm Receipt posts stock once
- [x] Partial short: Keep Open vs Close Outstanding with reason; closed PO allows reorder again
- [x] Range-wise bill vs Excel mismatch can be reviewed/resolved
- [x] Matrix (Phase C) shows Current/Threshold/Target with below-threshold highlight; current not editable
- [x] No dependency on a new SKU master table

### Suggested first PR

Done — Phases A–C shipped. Follow-ups only for live supplier email send or claim/replacement modules if the client requires them beyond stubs.

---

## RW-09 — Products & catalog: admin product master + ranges → powers

**Status (2026-11-04):** **Shipped for acceptance** via product-catalog work + **RC-03/RC-04/RC-05** (optional material, power-range attribute, parent + variants, null-material uniqueness). `/inventory/products-catalog` is a real module (list/create/detail/variants). Leaf stock remains `lensType`+`lensId`.

### Type

New module / change — admin **Products & catalog** (product master, ranges, power generation, archive/hold)

### Audience note (for humans + AI)

This is the **single Products & catalog task**. Implement against **this document + Sep 28 meeting notes** (product tree, range ? matrix, overlap errors, archive/hold). Client also shared a **Tech / competitor video** as UI inspiration � use as **reference only**, do not clone blindly.

**SKU:** a sellable unit remains one catalog **power leaf**: `lensType` + `lensId` (row in `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` / �). This RW builds the **admin way to define products and generate those leaves**. Do **not** invent a second stock system or require a greenfield SKU master table that breaks existing `Order.lensId` FKs.

**Relation to RW-08:** Procurement PO/reorder consumes existing power leaves. Catalog makes creating and navigating products/ranges sane. RW-08 Phase A/B can ship without this; RW-08 Phase C matrix UX benefits from catalog filters. Prefer coordinating product identity (brand/category/coating labels) so PO lines and matrices show the same names.

### Goal

Replace the empty **Products & catalog** admin page with a real product-master workflow: define a product (lens type ? attributes ? coatings/index/brand) ? attach **ranges** (e.g. -6�2, -6�4) ? system **auto-generates** the power-wise SKU matrix for that range ? **reject overlapping ranges** on the same product with a clear error and suggested correction ? **archive / hold** so products can be hidden from shop and ops. Admins must be able to navigate a large tree (hundreds of ranges / tens of thousands of powers) via categorization and search.

### Current state (what already exists � reuse)

| Exists today | Where | Keep / extend? |
|--------------|--------|----------------|
| Power-row catalog in DB | `SingleVisionLens`, `KryptokLens`, `ProgressiveLens`, `OriVisionLens`, � � fields like `category`, `brand`, `item`, `index`, `coating`, `sph`/`cyl`/ranges, `quantity`, `price`, `isDisabled` | **Yes** � leaves stay the stock source of truth |
| Shop / wholesale / mobile already sell these rows | lenses APIs, website, mobile | **Do not break** listing/order resolution |
| Admin browse stock by category ? line ? products | `/inventory/stock-overview` | Reuse patterns; catalog page should own **create/manage**, not only browse |
| Product line + coating filter chips | `CatalogProductLine`, `CoatingFilterLabel`; sheets in stock-overview | Reuse for filters/labels; may wire into create wizard |
| Create **one** lens row via API | `POST /api/lenses/single-vision` (etc.), `app/lib/admin-create-lens.ts` | Keep for edits/edge cases; **not** sufficient for �add -6�2 ? explode matrix� |
| Selectable-range helpers (shop) | `app/lib/lens-power-range.ts` | Reuse power-step / range math when generating cells |
| **Products & catalog** nav page | `/inventory/products-catalog` | **Placeholder �Coming soon�** � this RW fills it |

**Missing today:** guided product create UI; range attach that **bulk-creates** all powers; overlap validation with suggestions; product-level archive/hold that hides everywhere consistently; full progressive/kryptok attribute wizard parity.

### Meeting requirements (source of truth for behavior)

From **28 Sep** client discussion (summarized):

1. Catalog hierarchy conceptually: **lens type** (Single Vision / Kryptok / Progressive / �) ? **kind / material** (e.g. hardcoat, blue cut, poly, tintable, PG, PG poly) ? **index** (1.49, 1.56, 1.61, 1.67, 1.74, �) ? **coatings** (green, blue, magenta, LR, dual, gold, �) ? **ranges**.
2. Creating a product + range (e.g. blue cut SV 1.56 green, range -6�2) should **generate a matrix** of powers for that range.
3. Ranges are named like -6�2, -6�4, -8�2, -8�4, -10�2, -12�2 (general range helper OK).
4. **SV:** spherical + cylinder (plus/minus); no axis/add. **Kryptok:** additions + axis-style components. **Progressive:** eye / axis / addition extras.
5. **Overlap forbidden:** if -6�2 already covers -5�-6 band, creating -8�2 that accidentally includes -5�-6 must error and **suggest** the correct non-overlapping bounds (price bands differ by range � that is why ranges are separate products/slices).
6. **Archive / Hold:** holding a product makes it **not visible** on relevant screens (shop + admin lists as applicable).
7. Scale: ~200 products � =4 ranges � 800+ ranges; 6�4 matrix � 800 � ~19k powers minimum � UI must filter/bifurcate, not dump one giant page.

### Hard rules (do / do not)

**Do**

1. Keep **power-wise stock** on existing lens tables; new powers from catalog create are real DB rows with `quantity` (usually 0 until procurement receive).
2. Generate powers with a **deterministic grid** from SPH/CYL (and ADD/axis/eye where required) start/end + step (align with existing 0.25 optical steps used in shop/wholesale).
3. Validate **range overlap** within the same product identity (same type + brand/line + index + coating / equivalent key) before insert; return human-readable error + suggested range.
4. Propagate **Hold / Archive / inactive** so held products do not appear in customer catalog search, wholesale grids, and (ideally) reorder product pickers � define exact surfaces in Phase C.
5. Support **edit** of product metadata and **add additional ranges** later without recreating the whole product.
6. Idempotent-ish create: re-running generate for an existing identical cell should not duplicate SKUs (unique natural key or upsert strategy � document chosen approach).
7. Audit important creates/updates (product, range expand, archive) if audit helpers already cover inventory.

**Do not**

1. Do not replace lens tables with a new SKU master that orphans `Order` / cart / reorder FKs.
2. Do not require finishing RW-08 before starting this (independent module); do not implement PO receive inside this RW.
3. Do not auto-create reorder rules for every new power unless product asks � optional hook later; default: powers exist, rules set on power-wise stock / RW-08 matrix.
4. Do not pixel-clone the Tech video; match DrishX admin chrome.
5. Do not delete historical power rows that are on open orders � archive/hold instead of hard-delete when in doubt.
6. Do not treat �category string soup� as unchangeable forever � you may introduce a clearer Product/Range model **as long as** leaves still map 1:1 to current lens rows (facade OK).

### Target admin flow

```
Products & catalog (admin)
  ? List / search / filter products (type, index, coating, brand, active/held)
  ? Create product
        lens type ? kind/material ? index ? coating(s) / brand / line labels ? price defaults
  ? Add range (SPH start/end, CYL start/end ? display name e.g. -6�2)
        ? validate no overlap
        ? Generate power matrix ? bulk insert lens rows (SKU leaves)
  ? Preview matrix (optional) before confirm
  ? Hold / Archive product (or range) ? hidden from shop/ops
  ? Open product ? see ranges ? drill to powers / link to stock-overview or power-wise stock
```

### Phases (implement in order)

#### Phase A � Page + product create + SV range ? bulk powers

**Build**

- Replace `/inventory/products-catalog` Coming soon with a real list + create flow.
- **Product list:** filters by lens type, search by name/brand/coating/index; show active vs held; counts of ranges/powers if cheap.
- **Create product (Single Vision first):** capture fields that map onto today�s row shape (`category`, `brand`, `item`, `index`, `coating`, default `price` / optional `costPrice`). Reuse `CatalogProductLine` / `CoatingFilterLabel` where they fit chips/dropdowns.
- **Add range:** SPH start/end, CYL start/end (or start-range fields consistent with existing schema); derive label (-6�2 style) for display.
- **Generate:** expand grid ? `createMany` (or batched creates) of `SingleVisionLens` rows for each SPH�CYL cell; set `sph`/`cyl` and range bookkeeping fields consistently with `admin-create-lens` / `lens-power-range` conventions.
- **API:** prefer dedicated catalog endpoints (e.g. `/api/admin/catalog/products`, `.../ranges`, `.../generate`) rather than only calling single-row `createAdminLens` in a loop from the browser.
- Keep existing one-row POST APIs working for compatibility.

**Done when:** Admin can create an SV product, add -6�2 (or similar), and see all expected power rows in DB / stock-overview without hand-entering each power.

#### Phase B � Overlap validation + Kryptok / Progressive

**Build**

- **Overlap engine:** before generate, compute SPH�CYL coverage (and relevant ADD/axis/eye dimensions for non-SV) for existing ranges of that product; if intersection non-empty ? **400** with message like �overlaps existing -6�2 (-6.00�-0.25 � �); suggested range: �� (suggestion algorithm can be �trim to nearest non-overlapping band� � document behavior).
- **Kryptok create:** include ADD, axis (and cross where applicable) in product/range generate rules per meeting.
- **Progressive create:** include eye, axis, ADD; respect `Eye` enum and existing progressive row shape.
- Other families (OriVision / Magnus / Bifocal) � include if already sold in admin; otherwise document as follow-on and do not block A/B for SV+KT+PROG.
- Range list on product detail: add range, see power counts, link into stock.

**Done when:** Overlapping range create fails safely with a suggestion; KT + Progressive products can be created with correct extra attributes and bulk powers.

#### Phase C � Archive / Hold + navigation + shop visibility

**Build**

- **Hold / Archive** on product (and optionally per-range): sets inactive flags and/or `isDisabled` on member powers; product disappears from customer-facing catalog/wholesale queries and from admin �active� catalogs.
- Clarify **Hold** vs **Archive** in UI copy (meeting: hold = not visible; archive may be stronger/permanent � pick clear semantics and stick to them).
- Bifurcation UI: type ? index ? coating / brand filters so users are not scrolling 800 matrices.
- Optional: �open in power-wise stock / stock-overview� deep links filtered to that product.
- Ensure inactive products do not get new customer orders; existing open orders with that `lensId` still resolve.

**Done when:** Held product is hidden from shop paths used in production; admin can still find it under a �Held / Archived� filter and un-hold if allowed.

### Data / design notes (important for implementers)

- **Product identity key (suggested):** `lensType` + brand/line + index + coating (+ category/item as needed). Exact unique key must be chosen and documented in code comments so overlap checks and �same product� grouping stay consistent with how stock-overview groups �products� today.
- **Facade vs new tables:** Acceptable approaches: (1) thin `CatalogProduct` / `CatalogRange` tables that point at generated lens ids, or (2) derive product grouping purely from lens field equality. Prefer (1) if overlap and hold need stable IDs without string matching � but migrate carefully.
- **Price:** meeting notes ranges can have different prices (-6�2 vs -8�2). Store price on each leaf (as today) from range default at generate time; allow later bulk price edit as stretch.
- **Steps:** default 0.25 D unless client specifies otherwise; exclude �non-selling� bonus powers only if client later asks (meeting mentioned rare compounds � do **not** silently skip cells in v1 unless product confirms).

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
- Customer self-serve �request new product�

### Key code pointers

| Area | Path |
|------|------|
| Empty catalog page | `app/(admin)/inventory/products-catalog/page.tsx` |
| Stock browse / activate lines | `app/(admin)/inventory/stock-overview/page.tsx` |
| Catalog line + coating admin API helpers | `app/lib/admin-lenses.ts`, components `catalog-product-line-modal.tsx`, `coating-filter-label-modal.tsx` |
| Create one lens | `app/lib/admin-create-lens.ts`, `app/api/lenses/*/route.ts` |
| Range / sibling math | `app/lib/lens-power-range.ts` |
| Prisma leaves + labels | `SingleVisionLens`, `KryptokLens`, `ProgressiveLens`, `CatalogProductLine`, `CoatingFilterLabel` |
| Domain background | `docs/lens-domain-logic.md`, `docs/how-to-add-lens-data.md` |

### Open questions (do not block Phase A)

1. Exact **product unique key** fields (brand vs category vs item) matching how sales sheets name products.
2. Whether generate should **skip** rare 0.25 compounds (2.25/2.75 etc.) � default **include all** until client says otherwise.
3. Hold vs Archive: soft-hide only vs hide + block reorder rules.
4. OriVision / Magnus / Bifocal in v1 or later.
5. Whether a formal `CatalogProduct` table is required in A or grouping-by-fields is enough for MVP.

### Acceptance

- [x] `/inventory/products-catalog` is a real module (not Coming soon)
- [x] Admin can create product + power range variant(s); matrix leaves remain on lens tables
- [x] Duplicate parent+range / uniqueness rules enforced (incl. null-material parent reuse — RC-05)
- [x] SV / Kryptok / Progressive families supported via catalog attribute + parent model
- [x] Hold/Archive / `isActive` hides inactive products from active admin/shop paths as implemented
- [x] Existing orders/carts still resolve `lensId`; no orphaning rewrite
- [x] Filters/search make large catalogs navigable
- [x] No dependency on completing RW-08; SKU leaves remain `lensType`+`lensId`

### Suggested first PR

_(Shipped — historical note only.)_ Phase A–C + RC-03/04/05 covered the catalog cutover.

---

## RW-10 — Admin panel: create order on behalf of customer

**Status (2026-11-04):** **Shipped for acceptance.** `/orders/new` + `AdminCreateOrderPanel` (catalog + RX); attribution via `orderSource` / `placedByUserId`. Walk-in Path C aligned with RC-06.

### Type

New feature — admin Order Management (dedicated create-order flow + attribution)

### Audience note (for humans + AI)

Client wants admins to **place orders inside the admin panel** with a **dedicated flow/UI** (not �go use the website employee app�). Orders must remain owned by the **customer** (`Order.userId` = customer) and must be clearly marked as **placed by admin** (who + source), visible on admin list/detail.

Website **employee** on-behalf (`/employee/orders/on-behalf`) already exists and can stay for staff. This RW is the **admin-panel** path.

### Goal

Add an admin-only **Create order** experience: pick an approved customer ? choose order type ? build lines / RX (and later color/wholesale) ? place via existing checkout APIs ? persist attribution (`placed by admin`, source = admin panel) ? show a badge on order list and detail. Same stock reserve, cutoff, delivery, and pricing rules as normal customer checkout � do not invent a parallel order engine.

### Current state

| Piece | Status |
|--------|--------|
| Website employee on-behalf (customer ? catalog / RX / white / color) | **Exists** � `drishx-web-app` `/employee/orders/on-behalf` |
| APIs accept staff + `userId` (customer) for cart, retail order, RX, color, wholesale | **Exists** � `ADMIN` and `EMPLOYEE` treated as staff |
| Admin panel create order UI | **Missing** |
| Admin panel return-on-behalf from order detail | Exists (returns only) |
| `Order.userId` | Customer owner � correct; keep |
| Explicit `placedBy` / `orderSource` on `Order` | **Missing** � create is only loosely visible via audit / `OrderActivityLog` actor |

### Hard rules (do / do not)

**Do**

1. Build **dedicated admin UI** under Order Management (new route + sidebar/action from Orders).
2. Keep `Order.userId` = **customer**. Never set the admin as the order customer.
3. Persist attribution on create, e.g.:
   - `placedByUserId` ? admin user id  
   - `orderSource` ? `ADMIN_PANEL` (enum also allowing `CUSTOMER_APP`, `EMPLOYEE_ON_BEHALF` for consistency)  
   - Optionally store role snapshot if useful for display  
4. Show admin UI badge: **�Placed by admin � {name}�** on list + detail (and activity message on create).
5. Reuse existing place/cart/RX/color/wholesale APIs and libs (`place-order`, stock reserve, cutoff, delivery). Pass `userId` = selected customer; session = admin.
6. Default customer picker to **approved / active** customers (align with Clients). Block or warn on incomplete/unapproved unless product says otherwise.
7. Respect **RW-05** when implemented: admin-created RX/photo still follow admin-hold ? warehouse release (do not bypass hold by placing from admin).
8. Write audit + order activity: actor = admin, message includes on-behalf customer.

**Do not**

1. Do not deep-link/iframe the website employee on-behalf screen as the �solution.�
2. Do not put �Placed by admin� only in customer-visible `notes` as the sole signal � use real fields + badge.
3. Do not change customer app checkout.
4. Do not remove or break website employee on-behalf.
5. Do not rebuild pricing, inventory reservation, or dispatch cutoff logic.
6. Do not require RW-08/09 to start (independent); catalog/RX product pickers use today�s lens APIs.

### Target admin flow

```
Admin ? Orders ? Create order
  1. Select customer (search by name / business / email / mobile)
  2. Choose type: Catalog (retail) | RX | Color (phase) | Wholesale (phase)
  3. Build order (powers, qty, notes, delivery service as required by type)
  4. Review totals / stock warnings
  5. Confirm ? existing APIs with userId = customer
  6. Set placedByUserId + orderSource = ADMIN_PANEL
  7. Redirect to /orders/[id] with �Placed by admin� badge
```

### Phases

#### Phase A � Attribution + Catalog (retail) create + badge

**Build**

- Prisma: add `orderSource` enum + `placedByUserId` (FK to `User`, nullable for legacy rows). Backfill legacy as null / `CUSTOMER_APP` guess only if safe; otherwise leave null.
- On all create paths used by this flow (at least retail `POST /api/orders` / shared `place-order`): when session is ADMIN and body targets another `userId`, set `orderSource = ADMIN_PANEL`, `placedByUserId = session.userId`.
- Admin UI: `/orders/new` (or `/orders/create`) � step 1 customer, step 2 catalog line picker (reuse admin lens search patterns from inventory/orders), qty, notes, delivery if required, submit.
- Orders list + detail: badge when `orderSource === ADMIN_PANEL` (and show placer name).
- Activity: �Order created on behalf of {customer} by admin {name}.�

**Done when:** Admin can place a normal catalog order for a customer from the admin panel; detail shows who placed it; customer owns the order.

#### Phase B � RX (and photo if in scope)

**Build**

- Admin create flow branch for **RX** (same fields as customer/employee RX; call `POST /api/orders/rx` with `userId`).
- Optional: photo prescription upload on behalf if product needs it in admin (same API patterns as photo route � extend for staff `userId` if not already).
- Wire RW-05 hold behavior once RW-05 exists (create should not dump RX onto warehouse queues early).

**Done when:** Admin can place RX for a customer from admin panel with attribution badge.

#### Phase C � Color + Wholesale (as needed)

**Build**

- Color-lens wizard subset or �start color order� that posts to color-lens API with `userId`.
- Wholesale matrix checkout via existing wholesale-checkout + `userId` if client requires admin wholesale placement in panel.
- Filter orders by `orderSource` / �Placed by admin� on list.

**Done when:** Agreed extra channels work from admin with same attribution.

### Attribution display (product copy)

| Surface | Suggested UI |
|---------|----------------|
| Admin orders table | Pill: `Admin` or `Placed by admin` |
| Admin order detail | Line: `Placed by admin � {admin name} � {datetime}` |
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
- Changing loyalty earn rules beyond �order belongs to customer�

### Key code pointers

| Area | Path |
|------|------|
| Retail place | `app/api/orders/route.ts`, `app/lib/place-order.ts` |
| RX on behalf | `app/api/orders/rx/route.ts` (already staff + `userId`) |
| Color on behalf | `app/api/orders/color-lens/route.ts` |
| Cart / wholesale staff `userId` | `app/api/cart/route.ts`, `app/api/orders/wholesale-checkout/route.ts` |
| Admin orders UI | `app/(admin)/orders/`, `app/(admin)/orders/[id]/page.tsx` |
| Website employee on-behalf (reference only) | `drishx-web-app` `components/employee/employee-order-on-behalf-screen.tsx` |
| Order model | `prisma/schema.prisma` ? `Order` |
| Activity / audit | `OrderActivityLog`, `recordAuditEvent` / `ORDER_CREATED` |

### Open questions (do not block Phase A)

1. Must customer see �placed by office/admin� on their app? Default **no**.
2. Photo prescription from admin in v1 or RX-form only?
3. Wholesale/color required for first release or Phase C?
4. Should **EMPLOYEE_ON_BEHALF** also set `placedByUserId` when website staff places (nice consistency; can be small follow-up)?
5. Interaction with RW-05 timing � implement attribution first; hold rules when RW-05 merges.

### Acceptance

- [x] Admin can open a dedicated Create order flow in the admin panel
- [x] Catalog order for an approved customer succeeds; `userId` is the customer
- [x] `orderSource = ADMIN_PANEL` and `placedByUserId` set to the admin
- [x] List + detail show “Placed by admin — {name}” (or equivalent)
- [x] Stock/cutoff/delivery behave like normal checkout
- [x] Website employee on-behalf still works
- [x] RX creatable from admin (Phase B) with same attribution
- [x] No reliance on stuffing attribution only into `notes`

### Suggested first PR

_(Shipped — historical note only.)_

---

## RW-11 — Client API calling pattern + list/table performance

**Status (2026-11-04):** **Complete for acceptance.** Phase 0–C foundation + hot lists shipped across admin/web/mobile. Admin UI no longer calls `adminFetch` / `adminAuthFetch` from pages/components (all via `app/lib/admin-*.ts`). Opportunistic leftover hooks on non-hot web/mobile screens can continue as touched.

### Type

Cross-cutting change — **all three frontends** + shared backend list APIs (admin panel, website, mobile)

### Audience note (for humans + AI)

This is the **single API-calling + list performance task**. It has two layers that must stay in order:

1. **Skills first (documentation / agent contract)** � extend the already-added `drishx-client-api` skills in all three repos so every new fetch/mutation and every list screen follows one pattern (no React Query).
2. **Code second (foundation + hot list APIs)** � implement the shared client hooks, then fix the **logical** list/table problems (unbounded payloads, fat includes, client-side filter, inconsistent pagination). Without (2), (1) only makes slow calls cleaner.

**Do not** introduce TanStack Query / SWR / Axios for this RW. Transport stays what each repo already uses:

| Repo | Transport (keep) |
|------|------------------|
| Admin panel (`drishx-admin-backend`) | `adminFetch` / `AdminApiError` ? `app/lib/admin-api.ts` (+ `adminAuthFetch` refresh) |
| Website (`drishx-web-app`) | `authFetch` / `authFetchJson` ? `lib/auth-fetch.ts` (BFF `/api/...`) |
| Mobile (`drishx-mobile-app`) | `apiFetch` ? `lib/api-request.ts` (+ `authFetch`, offline queue, `BACKEND_BASE_URL`) |

**Relation to other RWs:** Independent of RW-08/09/10 product features. New admin screens from those RWs **must** follow this pattern once Phase A lands. Do not block PO/catalog/create-order on finishing every list in Phase C � but **do** block merging new list UIs that still call `adminFetch` / `authFetch` / `apiFetch` from components after Phase A.

### Goal

After this RW:

- Every client has **one** way to read and write APIs: pure api functions ? `useApiQuery` / `useApiMutation` ? screens (loading + error from hooks).
- Agent skills in all three repos accurately describe that pattern **including list/pagination contracts**.
- Hot list endpoints (especially **orders**, then customers / returns / invoices) are **paginated**, return **summary** payloads for tables, support **server-side** status/search filters, and keep fat detail on `GET �/:id` only.
- Admin tables, website order lists, and mobile order lists feel acceptably fast as data grows � not because of a nicer hook wrapper alone, but because less data crosses the wire.

### Current state (what already exists � reuse)

| Exists today | Where | Keep / extend? |
|--------------|--------|----------------|
| `drishx-client-api` skill (no React Query) | `.agents/skills/drishx-client-api/SKILL.md` in **admin**, **website**, **mobile** | **Yes** � Phase 0 expands it (pagination, list DTO, checklist) |
| `AGENTS.md` points at the skill | All three repos | Keep; update row text if skill scope grows |
| Admin transport | `app/lib/admin-api.ts`, `admin-auth-fetch.ts` | Keep � hooks call api layer that uses these |
| Website transport | `lib/auth-fetch.ts`, `lib/fetch-with-retry.ts` | Keep |
| Mobile transport | `lib/api-request.ts`, `lib/auth-fetch.ts`, `lib/app-alert` | Keep � alerts stay in hooks/options, not api files |
| Feature api files | Admin `app/lib/admin-*.ts`; web/mobile `lib/*-api.ts` | Keep as pure api layer; add hooks beside them |
| Good pagination examples | `GET /api/lenses` (`page`/`limit`/`hasMore`); `GET /api/admin/catalog/products`; stock-matrix / suppliers `page`/`pageSize`; loyalty ledger `cursor` | **Reuse contract style** � do not invent a fourth shape without reason |
| Fat unbounded lists (problem) | `GET /api/orders` � no `take`, heavy `include`, signed image URL per row in a loop | **Must change** in Phase B |
| In-memory search | `GET /api/users/customers` � load all then `.filter` on `q` | **Must change** |
| Client filter after full fetch | Website `my-orders-screen`; admin dispatch/procurement filters; mobile order screens | **Must move to server params** once APIs support them |
| Hard caps without �next page� | Loyalty customers `take: 100`; many finance lists `take: 50�100` | Document + fix in Phase C or explicit �load more� |

**Missing today:** Shared `useApiQuery` / `useApiMutation` implementations; `QUERY_REGISTRY` / `MUTATION_REGISTRY`; list vs detail DTOs for orders; unified `{ items, page, limit, total?, hasMore }` (or documented cursor) on hot endpoints; skills that spell out list/pagination rules.

### Hard rules (do / do not)

**Do**

1. **Phase 0 before feature code:** Update `drishx-client-api` in all three repos so implementers and agents share one contract (see Phase 0 checklist below).
2. Components/screens talk **only** to hooks (`useGet*` / `use*`). Never call `adminFetch` / `authFetch` / `authFetchJson` / `apiFetch` / raw `fetch` from UI files for new or migrated work.
3. Api files are **pure** (no React, no toast/`appAlert`). Hooks own `loading` / `refreshing` / `pending` / `error` and `onSuccess` / `onError`.
4. **401 / auth:** never toast or `appAlert` for auth failures � existing refresh / sign-out paths handle them.
5. Mutations take **one** argument; wrap `{ id, data }` when needed. Void response ? `void`; no payload ? `null`.
6. List endpoints used by tables must support **server** `page` + `limit` (or cursor) + filters (`status`, `q`, �). Default `limit` capped (e.g. 20�50); max hard-capped (e.g. 100).
7. **List response = summary.** Detail relations (full wholesale lines, all power versions, signed images, full lens rows) belong on detail GET � not on every list row.
8. Prefer one list envelope across new work: `{ items, page, limit, hasMore }` and `total` when cheap. If cursor is better (ledgers), document it in the skill and stick to it for that domain.
9. Migrate **opportunistically** for non-hot screens; **must** migrate orders (+ consumers) in Phase B/C.
10. Keep role scoping on `GET /api/orders` (CUSTOMER own / EMPLOYEE assigned / ADMIN all + existing query filters).

**Do not**

1. Do not add React Query, SWR, Axios, or a second HTTP client �framework.�
2. Do not �fix� slowness only by adding skeletons while still downloading all orders.
3. Do not silently truncate with `take: 100` and present the UI as complete � either page or show �load more� / total.
4. Do not break offline cache on mobile without a plan � cache **pages** or summary lists, not an unbounded forever-growing blob if avoidable.
5. Do not change order lifecycle, pricing, or attribution (RW-10) as part of this RW.
6. Do not require finishing RW-08/09 first.
7. Do not rewrite every admin `adminFetch` page in one PR � Phase A foundation + Phase B orders is the critical path.

### Problems this RW must address (inventory)

These are **logical** issues independent of hook style. Track them through phases.

| # | Problem | Impact | Primary fix phase |
|---|---------|--------|-------------------|
| 1 | Unbounded `GET /api/orders` | Admin / web / mobile all slow as orders grow | B |
| 2 | List payload is detail-shaped (lenses + lines + delivery + suggestions + versions) | Huge JSON + DB cost | B |
| 3 | Per-row `getSignedOrderImageUrl` in list loop | N+1 latency | B |
| 4 | Customers: load all + in-memory `q` | Admin clients directory does not scale | C |
| 5 | Returns / invoices: full `findMany`, no page | Admin tables | C |
| 6 | Client-side status/search after full download | Web my-orders, admin dispatch subsets | B�C |
| 7 | Inconsistent pagination params (`page`/`limit` vs `pageSize` vs `cursor` vs none) | Hard to share UI helpers | A skill + B/C APIs |
| 8 | Same fat list reused for dashboard counts / queues | Extra work for wrong shape | B (summary + filters) |
| 9 | Mobile offline cache of entire orders array | Storage + stale giant payloads | B mobile follow-through |
| 10 | Website BFF proxies full fat JSON | Double transfer cost | B (smaller JSON helps both hops) |
| 11 | Hard caps without next page (loyalty/finance) | Silent missing rows | C / follow-up |

### Target end-to-end pattern

```
[Skill: drishx-client-api] documents contract
        ?
lib/.../api.ts          ? pure transport call (adminFetch / authFetch / apiFetch)
lib/.../query|mutation  ? useApiQuery / useApiMutation
Screen                  ? loading / error / data / mutate only from hook
        ?
List APIs               ? ?page=&limit=&status=&q= ? { items, page, limit, hasMore[, total] }
Detail APIs             ? GET /:id ? full include (unchanged richness)
```

### Phases (implement in order)

#### Phase 0 � Skills first (all three repos) � **do this before code PRs that invent patterns**

**Goal:** Anyone (human or agent) reading `drishx-client-api` knows exactly how to call APIs **and** how lists/pagination must work. Skills today cover fetch/mutation isolation; they do **not** yet nail list contracts.

**Update in each repo** (`.agents/skills/drishx-client-api/SKILL.md`):

1. **Single pattern reminder** � `useApiQuery` for reads, `useApiMutation` for writes; no transport in components; registry; options types; 401 rules; mobile `appAlert` only via options.
2. **New section: List & pagination contract**
   - Query hooks for lists accept `params` as first arg: `{ page, limit, status?, q?, � }`.
   - `deps` for `useApiQuery` must include every param that changes the request.
   - Response typing: `Paginated<T> = { items: T[]; page: number; limit: number; hasMore: boolean; total?: number }`.
   - UI: table/list uses `loading` for first page, `refreshing` or `pending` for page changes / load-more; do not keep a second ad-hoc loading flag.
   - **Forbidden:** fetch all then `.filter` for primary status/search tabs when the API supports (or should support) those params.
3. **New section: List vs detail**
   - List hooks/types use summary types (`OrderListItem`, �).
   - Detail hooks call `GET /:id` (or existing detail routes).
   - Do not type list rows as full detail models �for convenience.�
4. **New section: Migration rule**
   - New screens: must use hooks.
   - Touched list screens: migrate in the same PR when changing that feature.
   - Hot paths in this RW (orders, then customers/returns/invoices): mandatory.
5. **Repo-specific notes stay** � admin `adminFetch`, website BFF, mobile `apiFetch` + offline + `appAlert`.
6. **AGENTS.md / `.agents/README.md`** � one-line note that `drishx-client-api` covers lists/pagination too (if not already obvious).
7. **Optional short `reference.md`** inside the skill folder for copy-paste hook templates (only if SKILL.md would become too long � prefer keeping one SKILL.md unless needed).

**Done when:** All three skills agree on the same list envelope + hook rules; a reviewer can reject a PR that violates the skill without debating style.

#### Phase A � Client foundation (all three repos)

**Build**

- Shared types: `QueryOptions`, `MutationOptions`, `Paginated<T>` under each repo�s `types/api-client` (or equivalent path from the skill).
- `QUERY_REGISTRY` / `MUTATION_REGISTRY` constants.
- `useApiQuery` + `useApiMutation` implementations matching the skill contract (`loading`, `refreshing`, `refetch`, `pending`, `error`, `enabled`, callbacks; skip UI `onError` for auth failures).
- One **gold-example** migration per repo (small screen, not necessarily orders): e.g. admin loyalty customers list **or** a thin settings GET; website a small authenticated list; mobile a small authenticated list � proves the kit works end-to-end.
- Do **not** claim performance fixed until Phase B.

**Done when:** Hooks exist and are used on at least one real screen per repo; skills match the code paths.

#### Phase B � Orders list API + all consumers (critical path)

**Backend (`GET /api/orders`)**

- Add query params: `page` (default 1), `limit` (default ~20�30, max ~100), plus filters needed by UIs: at least `status` (single or CSV), `q` (order number / business / customer name as agreed), keep existing `employeeId` / `userId` / `batchId` where already used.
- Return paginated **summary** items: fields needed for tables/cards (id, orderNumber, status, dates, customer summary, assignee summary, amounts, lens one-liner / type, flags like warehouseHold / awaiting procurement � **document the exact field list in the PR**).
- **Exclude** from list default: full `wholesaleLineItems` arrays, full lens row dumps, `powerVersions`, pending suggestion blobs, delivery pack internals, **signed order image URLs** (expose `hasOrderImage` boolean or omit; sign only on detail).
- Preserve role `where` clauses; apply filters in Prisma `where`, not after fetch.
- Keep `GET /api/orders/[id]` (or current detail) as the fat payload for detail screens.
- Backward compatibility: prefer additive response shape `{ items, page, limit, hasMore, total? }`. If any client still expects a bare array, either dual-support briefly behind a query flag (`?view=summary`) **or** migrate all three clients in the same release train � **do not** leave mobile/web broken. Prefer one coordinated cutover for orders.

**Admin panel**

- Orders table(s), dispatch, procurement order subsets: call paginated summary API with server filters; wire loading/error via hooks (`useGetOrders`).
- Detail pages keep detail GET.
- Stop loading full `/api/orders` then `.filter` for dispatch/history where a status filter on the API suffices (may use dedicated pending-dispatch endpoint if one already exists � prefer extending filters over duplicate fat fetches).

**Website**

- `fetchOrders` / my-orders / employee orders / any dashboard that currently pulls all orders: switch to paginated summary (+ load more or page controls).
- Status tabs + search ? query params, not only client `filter` on a full array.
- BFF: if website proxies `/api/orders`, ensure query params pass through unchanged.

**Mobile**

- `fetchOrders` + order list UI: paginated summary; pull-to-refresh = page 1; infinite scroll or �load more� for next pages.
- Offline cache: cache latest summary page(s) or a bounded recent set; document behavior when offline (stale summary OK; do not require full history offline unless product demands it).
- Hooks + `appAlert` on non-auth errors per skill.

**Done when:** Creating more orders no longer forces every client to download the entire order history with detail includes; list UIs page; detail still complete.

#### Phase C � Other hot admin lists + consistency

**Build**

- **Customers** (`GET /api/users/customers`): Prisma/`where` search for `q`; `page`/`limit`/`hasMore`; admin Clients UI uses hooks + server search.
- **Returns** + **Invoices** list routes: same pagination + summary fields for tables; detail routes stay rich (aligns with RW-03 �fuller detail on detail,� not on list).
- Align param names with Phase B (`page`/`limit`) unless an existing endpoint already standardized on `pageSize` � then document exception in skill.
- Finance/loyalty hard caps: either add real paging/load-more or show explicit �showing latest N� � no silent incompleteness.
- Migrate corresponding admin screens to hooks.

**Done when:** Main admin directory/tables that hurt in production are paginated and hooked; skills� list rules have concrete examples in-repo.

#### Phase D � Polish (optional but recommended)

- Shared tiny UI helpers: `ErrorState` + retry, table pagination controls (admin), load-more button patterns (web/mobile).
- Dashboard endpoints that only need counts: prefer count/aggregate APIs instead of downloading order lists.
- Audit that no new PR reintroduced component-level `adminFetch` for lists.
- Performance smoke: rough before/after payload size on `/api/orders` for a seeded large dataset (note numbers in PR description).

### Skill update checklist (Phase 0 � copy into PR description)

For **each** of admin / website / mobile `drishx-client-api`:

- [x] Transport section still accurate
- [x] Query + mutation gold examples still accurate
- [x] **List & pagination** section added (`Paginated`, params, deps, no client-only primary filter)
- [x] **List vs detail** section added
- [x] Migration / hot-path rules mention orders (+ Phase C entities)
- [x] Error/loading contract unchanged (401 silent; non-401 via `error` / `onError`)
- [x] `AGENTS.md` still points at skill

### Scope (in)

- Phase 0 skill updates in all three repos
- Phase A shared hooks + registry + types + one gold example per repo
- Phase B orders list API summary + pagination + filter; admin + website + mobile consumers
- Phase C customers / returns / invoices (and hard-cap honesty)
- Opportunistic migration of touched screens to hooks
- Docs: this RW + skills as source of truth for agents

### Out of scope

- Adopting TanStack Query / SWR / Axios
- RW-08 PO / RW-09 catalog product master / RW-10 create-order UX (they consume this pattern; they are not this RW)
- Rewriting every historical screen in one go
- Changing order business rules, payments, or auth token TTLs (RW-01)
- Full reports module (RW-06) � but new report tables should follow this list contract when built
- Pixel redesign of tables (behavior/performance first; mild UI for page controls OK)

### Key code pointers

| Area | Path |
|------|------|
| Admin skill | `drishx-admin-backend/.agents/skills/drishx-client-api/SKILL.md` |
| Website skill | `drishx-web-app/.agents/skills/drishx-client-api/SKILL.md` |
| Mobile skill | `drishx-mobile-app/.agents/skills/drishx-client-api/SKILL.md` |
| Orders list (problem) | `app/api/orders/route.ts` `GET` |
| Order detail | `app/api/orders/[id]/�` (keep fat) |
| Customers list | `app/api/users/customers/route.ts` |
| Returns list | `app/api/returns/route.ts` |
| Invoices list | `app/api/invoices/route.ts` |
| Good pagination refs | `app/api/lenses/route.ts`, `app/api/admin/catalog/products/route.ts` |
| Admin transport | `app/lib/admin-api.ts` |
| Website orders client | `drishx-web-app/lib/orders-api.ts` ? `fetchOrders` |
| Website my-orders UI | `drishx-web-app/components/orders/my-orders-screen.tsx` |
| Mobile orders client | `drishx-mobile-app/lib/orders-api.ts` ? `fetchOrders` |
| Admin orders / dispatch UI | `app/(admin)/orders/`, `app/(admin)/orders/dispatch/page.tsx` |

### Open questions (do not block Phase 0 / A)

1. Orders list cutover: additive `{ items, � }` only, or short dual-mode (`?view=summary`) for one release?
2. Default `limit` for admin tables vs customer apps (30 vs 20)?
3. Should `total` count always be returned (extra SQL `count`) or only `hasMore`?
4. Mobile offline: how many recent summary pages to cache?
5. Dispatch �pending� � extend `GET /api/orders` filters vs keep/expand a dedicated pending endpoint?

### Acceptance

- [x] Phase 0: all three `drishx-client-api` skills include list/pagination + list-vs-detail rules; AGENTS still reference the skill
- [x] Phase A: `useApiQuery` / `useApiMutation` (+ registry/types) exist in all three repos; one gold screen each uses them
- [x] Phase B: `GET /api/orders` is paginated summary; no per-row signed image on list; detail still complete
- [x] Phase B: admin + website + mobile order list UIs use pagination + hooks; primary filters are server-side
- [x] Phase C: customers / returns / invoices lists paginated (or explicitly bounded with UI honesty) + hooked admin UI
- [x] No new list screen merged that calls transport directly from a component
- [x] 401s still not user-toasted; non-401 errors surface via hook `error` / `onError` (mobile: `appAlert` when appropriate)
- [x] Measurable win: smaller `/api/orders` list payload and faster first paint on order tables/lists vs pre-RW baseline (note in PR)

### Suggested first PR

1. **Skills-only PR (Phase 0)** across all three repos � list/pagination sections.  
2. **Foundation PR (Phase A)** � hooks + registry + one gold example per repo.  
3. **Orders PR (Phase B)** � backend summary pagination + admin/web/mobile cutover.  
4. **Follow-ups (Phase C)** � customers, returns, invoices, hard-cap honesty.

---

## RW-12 — Customer account configuration: OTP clients + reject/resubmit + Path C (web / mobile)

**Status (2026-11-04):** Path A OTP + login + reject/resubmit + Path C walk-in shipped on web/mobile. Password signup API gated **410** (`ALLOW_LEGACY_PASSWORD_SIGNUP=1` escape). Customer `mobileNumber` unique partial index applied. Live 2factor/email/GSTIN credentials still pending (DEV OTP OK).

### Type

Change / completion — **customer identity & account flows** across website + mobile (backend/admin mostly done; wire clients + finish gaps)

### Audience note (for humans + AI)

This is the **remaining implementation work** for the Oct 2026 customer onboarding / account configuration slice. Product contract and engineer detail live in:

| Doc | Role |
|-----|------|
| [`docs/customer-account-configuration/CLIENT-PLAN.md`](./customer-account-configuration/CLIENT-PLAN.md) | Agreed behavior (paths A/B/C, OTP, tiers, credit, reject/resubmit, GST button) |
| [`docs/customer-account-configuration/DEVELOPER-GUIDE.md`](./customer-account-configuration/DEVELOPER-GUIDE.md) | Schema, routes, phases, code map |
| [`docs/customer-account-configuration/README.md`](./customer-account-configuration/README.md) | Index + providers |

**Do not re-plan the product** in this RW � implement against those docs. This RW exists because **backend + admin are largely shipped**, while **website and mobile still run the old email+password identity model**, so end-to-end acceptance cannot pass.

**Credentials reality (important):** Client has **not** delivered live **2factor**, **email OTP**, or **GSTIN.cloud** credentials yet. Until then:

- Keep **`OTP_DEV_MODE=1`** (and known `OTP_DEV_CODE`, default `123456`) so web + mobile can complete full OTP flows against existing APIs.
- OTP codes are **generated / accepted in the API** (logged server-side in DEV) � clients **never** expect the API response body to return the OTP.
- Live provider wiring is a **separate final phase** once credentials arrive � not a reason to delay Path A/B/C UX.

**Web vs mobile parity:** Gaps below apply to **both** clients equally unless noted. Do not ship OTP signup on mobile only (or web only) and call the slice done.

**Relation to other RWs:** Independent of RW-08/09/10. Prefer RW-11 hooks when touching new screens. Overlaps RW-07 (optional registration fields) � keep fields optional per RW-07; this RW owns **identity / OTP / approval loops**, not �make GSTIN optional� by itself. Live / Non-live stock order views stay **out of scope** (separate module).

### Goal

After this RW:

1. **Path A (self-signup)** on website and mobile starts with **mobile OTP** (DEV code OK) ? optional email OTP ? rest of registration wizard; email+password is no longer the primary signup path.
2. **OTP login** works on website and mobile so Path B (admin-created) and Path C (walk-in) customers can enter the app without a random password.
3. **Reject ? edit & resubmit** works while authenticated (both clients); profile material edits call `PATCH /api/users/me/profile` and return to `PENDING_REVIEW`.
4. **Path C walk-in create** (phone + OTP ? create customer ? on-behalf order) exists on **employee** website + mobile surfaces (admin create-order already has it).
5. Checkout UIs surface **tier discount** (when %) and clear **credit / blocked / suspended** errors from the API.
6. When credentials arrive: flip off DEV for mobile SMS (2factor), wire email OTP vendor, enable live GSTIN.cloud � **without redesigning flows**.

### Current state (what already exists � reuse)

| Exists today | Where | Keep / extend? |
|--------------|--------|----------------|
| Product + eng plans | `docs/customer-account-configuration/*` | **Yes** � source of truth for behavior |
| Schema: verified timestamps, `accountAction`, `pricingTierId`, `creditAllowed`, GST verify fields, `createdByStaffId` | `prisma/schema.prisma` ? `User` | Keep |
| `PricingTier`, `OtpChallenge`, `OrderRefund` / `OrderRefundPayout` | Prisma | Keep |
| Mobile OTP APIs (2factor client + DEV) | `app/api/auth/otp/mobile/{send,verify}`, `app/lib/otp/twofactor-sms.ts` | **Reuse** � clients must call these |
| Email OTP APIs (DEV only until vendor) | `app/api/auth/otp/email/{send,verify}`, `app/lib/otp/email-otp.ts` | **Reuse** with DEV; wire vendor later |
| Path A create-from-OTP (backend) | mobile verify `purpose=SIGNUP` ? `createCustomerFromMobileOtp` | Keep � web/mobile must use it |
| Legacy email+password signup (still used by clients) | `POST /api/auth/signup`; website `app/signup`; mobile `app/signup.tsx` | **Replace as primary Path A** after OTP clients ship; may keep briefly for dual-login |
| Path B Admin create | `POST /api/users/customers`, `app/(admin)/clients/new` | Keep; add invite / first-login OTP UX as needed |
| Path C walk-in API + **admin** UI | `POST �/walk-in`; OTP + create inside `admin-create-order-panel.tsx` | Keep admin; **port to employee web + mobile** |
| Profile ? pending (API) | `PATCH /api/users/me/profile`, `customer-profile-update.ts` | Keep � clients must call it |
| Pricing tiers admin + checkout math | `/finance/pricing-tiers`, `pricing-tier-math`, place-order tier discount | Keep � expose in client checkout UI |
| Hard credit at checkout | `assertHardCreditAtCheckout` on place-order / wholesale | Keep � map errors in client UI |
| Account actions + Verify GST (stub/DEV) | clients `[id]`, `verify-gst`, `gstin-cloud.ts` | Keep button; live key later |
| Refunds admin payout | `AdminOrderRefundPanel`, refund APIs | Keep; customer-visible status optional |
| Website / mobile registration | email+password ? business ? GST ? addresses ? pending | **Rewrite identity steps** to OTP |
| Website / mobile login | email+password only | **Add mobile OTP login** |
| Company profile UI | read-only on web + mobile | **Make editable** ? profile PATCH |
| Reject UX | pending-approval logs out / �Sign up again�; no edit CTA | **Must fix** both clients |

**Missing today (this RW):** zero `otp/mobile` / `otp/email` calls from website or mobile; OTP login UI; reject?resubmit loop; editable profile; Path C on employee apps; checkout tier/credit messaging; live providers when creds arrive.

### Hard rules (do / do not)

**Do**

1. Implement against **CLIENT-PLAN** behavior; update CLIENT-PLAN + DEVELOPER-GUIDE together if product intent changes.
2. Ship **website and mobile in lockstep** for Path A OTP, OTP login, reject/resubmit, and profile edit � same acceptance criteria on both.
3. Use existing OTP APIs with **`OTP_DEV_MODE`** until credentials arrive. Document the fixed DEV code in `.env.example` / internal runbook only � never show OTP in API JSON responses.
4. Path A: **mobile verified required** before continuing registration; email optional � if entered, run email OTP (DEV OK) ? `emailVerifiedAt`.
5. Path B create may still create without verified mobile at save time (match current admin API); customer **must** verify via invite / first OTP login before self-serve ordering.
6. Path C: employee creates with phone + OTP; walk-in on-behalf order allowed while `PENDING_REVIEW` when `createdByStaffId` is set (existing eligibility rules).
7. Rejected customers stay able to **edit and resubmit** (authenticated); do not force �sign up again� as the only path.
8. Material profile changes ? `PENDING_REVIEW`; freeze self-serve orders until Admin approves (existing backend gates).
9. Prefer RW-11 `useApiQuery` / `useApiMutation` for new client API wiring when that foundation exists; otherwise pure api files + existing auth fetch � do not invent a third pattern.
10. Audit security-relevant OTP / account-action / GST verify events via existing audit / security helpers.

**Do not**

1. Do **not** block Path A/B/C client UX waiting on 2factor / email / GSTIN.cloud production keys � DEV OTP is intentional.
2. Do **not** return OTP codes in API response bodies (even in DEV).
3. Do **not** auto-call GSTIN.cloud on every signup � Admin **Verify GST** button only.
4. Do **not** build Live / Non-live stock order views in this RW.
5. Do **not** add credit **period** (15/30 days) � credit **limit** only.
6. Do **not** ship OTP on mobile and leave website on password signup (or the reverse).
7. Do **not** treat admin walk-in UI as Path C done for employees � employee web + mobile still need it.
8. Do **not** rewrite finance / loyalty modules; document tier � loyalty stacking only if you touch checkout totals (keep existing backend stacking unless product says otherwise).

### Target flows (summary)

```
Path A (web + mobile):
  Enter mobile ? Send OTP ? Verify (DEV code OK)
  ? optional email ? email OTP verify
  ? business / GST / addresses (optional fields per RW-07)
  ? PENDING_REVIEW ? Admin approve (+ tier / credit)

Path B:
  Admin /clients/new ? create (commercial optional)
  ? Customer first login via mobile OTP (LOGIN purpose)
  ? if still pending commercial, Admin finishes on client detail

Path C (employee web + mobile � not only admin):
  Staff login ? Create customer (mobile OTP WALK_IN)
  ? optional live on-behalf order now
  ? Admin commercial setup later

Reject / profile:
  REJECTED ? stay able to open Edit profile ? save ? PENDING_REVIEW
  APPROVED + material edit ? PENDING_REVIEW again ? orders frozen until approve
```

### Phases (implement in order)

#### Phase A � OTP signup + OTP login on website and mobile (DEV OTP)

**Build**

- **Website + mobile Path A:** replace primary signup entry with mobile number ? `POST /api/auth/otp/mobile/send` (`SIGNUP`) ? verify ? continue wizard. Stop requiring password as the identity for new customers.
- Optional email step: `POST /api/auth/otp/email/send|verify` when email provided (works under `OTP_DEV_MODE`).
- **OTP login** screen (or login mode) on both clients: mobile ? send/verify `purpose=LOGIN` ? session (same as backend already supports).
- Keep dual-login briefly if needed for existing email+password customers; new Path B/C users must be able to enter via OTP.
- Env / runbook: `OTP_DEV_MODE=1`, `OTP_DEV_CODE=123456` (or agreed code) for local/staging until 2factor keys exist.
- Loading/error UX: rate-limit and invalid-code messages from API; no fake �OTP sent� if send failed.

**Done when:** A new customer can complete Path A on **both** website and mobile using DEV OTP only; an admin-created customer can log in with mobile OTP on both clients.

#### Phase B � Reject ? edit & resubmit + editable profile (both clients)

**Build**

- Pending / rejected screens: if `REJECTED`, show **Edit details & resubmit** (stay signed in or re-auth via OTP � prefer stay signed in when session valid).
- Editable **My Business / company profile** on website + mobile ? `PATCH /api/users/me/profile` (or documented equivalent).
- After save: UI reflects `PENDING_REVIEW`; self-serve order entry blocked with a clear message until Admin approves.
- Stop �Sign up again� as the only rejected CTA (may keep as secondary if product wants).
- Align error messaging with eligibility codes the API returns (`CUSTOMER_NOT_ORDERABLE` / account-action codes � map to plain language).

**Done when:** Rejected customer on web and on mobile can fix fields and land back in pending review without creating a second account; approved customer material edit re-triggers pending on both.

#### Phase C � Path C walk-in on employee website + mobile

**Build**

- Employee surfaces (website employee area + mobile staff): **Create customer** = phone ? OTP (`WALK_IN`) ? `POST /api/users/customers/walk-in` ? continue on-behalf order (reuse existing on-behalf order UI).
- Mirror the capability already in `admin-create-order-panel` (OTP + create), adapted to employee chrome and permissions.
- Admin panel Path C remains valid; do not remove it.
- Ensure pending walk-in customers created by staff can order via on-behalf exception; self-serve still gated until Admin approves + commercial setup.

**Done when:** An employee (not only Admin) can create a walk-in customer with OTP and place a live order on **both** employee web and mobile.

#### Phase D � Checkout messaging + Path B invite polish

**Build**

- Website + mobile checkout / order summary: show **tier discount** line when `tierDiscountPercent` / amount > 0 (use fields already returned or extend summary payload if missing � prefer existing order quote fields).
- Map hard-fail codes to UI: `CREDIT_LIMIT_EXCEEDED`, `ACCOUNT_BLOCKED`, `CREDIT_SUSPENDED`, closed/pending messaging � do not show a generic �Something went wrong� for these.
- Path B: after Admin create, clear first-login path (OTP invite messaging or �log in with this mobile� copy). Random password must not be the only access story.
- Optional: customer-visible refund status on cancelled orders (admin payout already exists) � only if cheap; otherwise leave admin-only.

**Done when:** Customer sees why checkout blocked for credit/action reasons; tier discount visible when applicable; admin-created clients have a documented OTP login path.

#### Phase E � Live providers (blocked on client credentials)

**Build only when keys are available**

| Provider | Work |
|----------|------|
| **2factor** SMS | Set `TWOFACTOR_API_KEY` (+ template/sender as required); disable `OTP_DEV_MODE` in staging/prod for mobile SMS; smoke send/verify |
| **Email OTP** | Choose vendor (Resend / SES / SendGrid / Postmark); implement behind existing `email-otp` / `OtpSender` interface; env keys; turn off DEV for email in prod |
| **GSTIN.cloud** | Set `GSTIN_CLOUD_API_KEY`; disable mock/DEV mode for Admin Verify GST; keep button-only, no auth auto-verify |

**Done when:** Staging/prod can verify real SMS (and email if chosen) and Admin GST button hits live GSTIN.cloud; DEV mode remains for local.

#### Phase F � Schema hardening + cleanup (after OTP clients are live)

**Build**

- Enforce `mobileNumber` required + unique for CUSTOMER (migrate nulls / duplicates first).
- Decide and document **nullable email vs placeholder** strategy; migrate placeholders if moving to nullable.
- Deprecate or feature-flag legacy `POST /api/auth/signup` password Path A once both clients are on OTP.
- Align DEVELOPER-GUIDE / CLIENT-PLAN �today vs after� and acceptance checklists with shipped reality.
- Optional: consolidate legacy `isActive` �suspended� language vs `accountAction` in admin filters/copy.

**Done when:** Identity model matches CLIENT-PLAN; docs status matches code; password signup is not the default Path A.

### Problems this RW must address (inventory)

| # | Problem | Impact | Primary fix phase |
|---|---------|--------|-------------------|
| 1 | Web + mobile still email+password Path A | Docs/acceptance fail; OTP APIs unused | A |
| 2 | No OTP login on clients | Path B/C users locked out of self-serve apps | A |
| 3 | Reject = dead end / sign up again | CLIENT-PLAN � reject?resubmit unmet | B |
| 4 | Company profile read-only | Profile?pending API unused | B |
| 5 | Path C only in admin create-order | Employees cannot walk-in create on their apps | C |
| 6 | Checkout silent on tier / credit errors | Bad UX; support load | D |
| 7 | Live 2factor / email / GSTIN waiting on creds | Prod SMS/GST not real yet | E (blocked) |
| 8 | Email required + placeholder; mobile not DB-unique | Identity hardening incomplete | F |
| 9 | Docs still read as greenfield | Misleading for next assignee | F (and light touch when shipping A�D) |

### Scope (in)

- Website + mobile: Path A OTP signup, OTP login, reject/resubmit, editable profile
- Employee website + mobile: Path C walk-in create + order continuation
- Checkout: tier discount visibility + credit/account-action error mapping (both clients)
- Path B first-login / invite clarity
- Phase E provider wiring when credentials arrive
- Phase F schema + doc sync after clients are OTP-first
- Small backend fixes only as needed to support the above (error codes, invite helpers) � not a second admin rebuild

### Out of scope

- Rebuilding admin Clients / pricing tiers / refund payout / Verify GST button (already present)
- Live / Non-live stock order module
- Credit period (days)
- Full KYC document vault
- Automatic GST verification on signup
- Loyalty program redesign (tier � loyalty stacking stays as backend does today unless product opens it)
- RW-09 product catalog hierarchy implementation
- Pixel redesign of admin chrome

### Key code pointers

| Area | Path |
|------|------|
| Client plan | `docs/customer-account-configuration/CLIENT-PLAN.md` |
| Developer guide | `docs/customer-account-configuration/DEVELOPER-GUIDE.md` |
| Mobile OTP API | `app/api/auth/otp/mobile/send/route.ts`, `�/verify/route.ts` |
| Email OTP API | `app/api/auth/otp/email/send/route.ts`, `�/verify/route.ts` |
| 2factor / DEV SMS | `app/lib/otp/twofactor-sms.ts` |
| Email OTP (DEV / TBD) | `app/lib/otp/email-otp.ts` |
| Path A create from OTP | signup-from-mobile helper used by mobile OTP verify `SIGNUP` |
| Legacy signup | `app/api/auth/signup/route.ts` |
| Path B create | `app/api/users/customers/route.ts`, `app/(admin)/clients/new/page.tsx` |
| Path C walk-in | `app/api/users/customers/walk-in/route.ts`, `components/admin-create-order-panel.tsx` |
| Profile ? pending | `app/api/users/me/profile/route.ts` |
| Order eligibility / credit | `app/lib/customer-order-eligibility.ts`, `assertHardCreditAtCheckout` |
| GST stub | `app/lib/gst/gstin-cloud.ts`, clients verify-gst route |
| Website signup / login / pending | `drishx-web-app/app/signup`, `app/login`, pending-approval / company-profile screens |
| Mobile signup / login / profile | `drishx-mobile-app/app/signup.tsx`, `app/login.tsx`, company-profile |
| Employee on-behalf (no walk-in create yet) | website + mobile `employee-order-on-behalf*` |

### Open questions (do not block Phase A)

1. Dual-login duration: how long keep email+password signup/login after OTP Path A ships?
2. Rejected session: require OTP re-login before edit, or keep existing session?
3. Email OTP vendor preference when client is ready (Resend vs SES vs other)?
4. Should customer apps show refund payout status in v1, or admin-only forever?
5. Exact Path B invite channel (SMS deep link vs �open app ? login with this mobile� copy only)?
6. Nullable email migration now vs after OTP clients stabilize?

### Acceptance

- [x] Website Path A: mobile OTP (DEV) → optional email OTP → registration → pending
- [x] Mobile Path A: same as website (parity)
- [x] Website + mobile: OTP login works for admin-created / walk-in mobiles
- [x] Rejected customer can edit & resubmit on website **and** mobile without “sign up again” as only path
- [x] Material profile edit → `PENDING_REVIEW` on both clients; self-serve ordering blocked with clear copy
- [x] Employee website + mobile: Path C walk-in (RC-06 skip OTP / history / staff-only) + continue on-behalf order
- [x] Checkout shows tier discount when applicable; credit/blocked/suspended errors are explicit
- [x] No dependency on live 2factor/email/GSTIN keys to pass Phases A–D (DEV OTP sufficient)
- [ ] Phase E: with credentials, staging/prod SMS (and email if chosen) + live GST button work; DEV off outside local — **blocked on client credentials (later)**
- [x] Phase F: mobile uniqueness / email strategy documented and migrated; CLIENT-PLAN / DEVELOPER-GUIDE status matches code
- [x] Admin Clients / tiers / GST button / refunds remain working (no regressions)

### Suggested first PR

1. **Phase A (website + mobile together):** OTP signup + OTP login against DEV OTP APIs.  
2. **Phase B:** reject/resubmit + editable profile on both clients.  
3. **Phase C:** employee walk-in create on website + mobile.  
4. **Phase D:** checkout tier/credit messaging + Path B login copy.  
5. **Phase E** when client credentials arrive.  
6. **Phase F** schema/doc cleanup after OTP is the default Path A.
