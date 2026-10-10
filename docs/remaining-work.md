# DrishX — Remaining Work

**Document type:** End-phase backlog (bugs, changes, new modules)  
**Audience:** Developers picking up assigned work  
**Last updated:** 2026-10-10

## How to use

- Each item has a stable ID (`RW-01`, `RW-02`, …).
- Default sections: **Type**, **Goal**, **Current state**, **Scope (in)**, **Out of scope**.
- Larger items (e.g. RW-06) add extra sections: catalog, architecture, phases, data sources, open questions.
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
