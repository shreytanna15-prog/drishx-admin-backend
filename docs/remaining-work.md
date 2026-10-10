# DrishX — Remaining Work

**Document type:** End-phase backlog (bugs, changes, new modules)  
**Audience:** Developers picking up assigned work  
**Last updated:** 2026-10-10

## How to use

- Each item has a stable ID (`RW-01`, `RW-02`, …).
- Sections per item: **Type**, **Goal**, **Current state**, **Scope (in)**, **Out of scope**.
- Cross-repo work is listed under **Repos** in the index.

---

## Index

| ID | Task | Repos |
|----|------|-------|
| RW-01 | Auth session drops mid-use — Unauthorized / forced re-login | backend, website, mobile, admin panel |
| RW-02 | Admin grouped orders overview (card UI) | backend (admin panel) |
| RW-03 | Returns: show fuller order details (list + detail) | backend (admin panel) |
| RW-04 | Customer status: abandoned signups + admin status changes | backend (admin panel; loyalty filters) |

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
