# DrishX — Requested changes

**Document type:** Client meeting change backlog (bugs, UX, behaviour)  
**Audience:** Developers picking up assigned work  
**Last updated:** 2026-11-02

## How to use

- Each item has a stable ID (`RC-01`, `RC-02`, …).
- Default sections: **Type**, **Goal**, **Current state**, **Scope (in)**, **Out of scope**.
- Discuss → lock behaviour → then write the task here. Add items one by one across any module.
- End-phase / older backlog stays in [`remaining-work.md`](./remaining-work.md) (`RW-*`). This file is for newer requested changes.

---

## Index

| ID | Task | Repos |
|----|------|-------|
| RC-01 | Admin edit client + detail UX + verify rules + change history | backend (admin panel); APIs as needed |
| RC-02 | Unwire / remove photo prescription orders from RX | backend, website, mobile, admin panel |

---

## RC-01 — Admin edit client (detail UX, verify rules, notes, history)

### Type

Change / gap — Admin Clients

### Goal

Admin can fix customer entity data when the shop will not update their own profile. Client detail becomes a proper page; Edit opens a prefilled form; sensitive field changes re-trigger verification without un-approving the account; GST/PAN stay locked once verified; every Admin update is noted and listed in a change history.

### Current state

- Admin has Clients list, detail (`/clients/[id]`), and create (`/clients/new`).
- Detail is a narrow single-column card stack (poor use of space, heavy scroll).
- No solid Admin **edit** path that reuses the create form with prefilled values.
- Customer-account plan already *says* Admin can edit; product still lacks this UX + verify/lock rules as agreed in meeting.

### Locked behaviour

1. **Detail page UX**  
   Redesign `/clients/[id]` as a proper full-width admin page (not a skinny one-column card stack).

2. **Edit client**  
   Button on detail → client form with fields **prefilled** (same form as create, edit mode).  
   After Admin save → account stays **Approved** (do not send back to pending review).

3. **Admin update notes (required)**  
   On every Admin update, require a **Notes** string (reason), e.g. “Client asked to change delivery address due to construction.”  
   Notes apply to Admin updates only (not a substitute for customer self-edit flows).

4. **Change history**  
   Second button beside Edit (e.g. **Change history**).  
   List/table page (or equivalent) showing for each Admin update:
   - Date and time  
   - Admin who updated  
   - Required note text  
   - Human-readable field names that changed (e.g. “Delivery address”, “Mobile” — not DB column names)

5. **Mobile / email re-verify**  
   If **client or Admin** changes mobile or email → mark that channel **unverified**.  
   User must run verify again (OTP / verify button) before it counts as verified.

6. **Address verify (Option A)**  
   - Add address verified flag (e.g. `addressVerifiedAt` / equivalent).  
   - On **onboarding Admin approve** → set address **verified** immediately (no extra step).  
   - If **client or Admin** later changes address → set address **unverified**.  
   - Account stays **Approved**.  
   - Admin confirms via **Verify address** on detail (no OTP).  
   - Show a clear banner while address is pending verification.

7. **GST / PAN lock**  
   Once verified, **neither client nor Admin** can change GST or PAN.

### Scope (in)

- Admin detail layout redesign
- Edit button + prefilled edit form + save API
- Required Admin notes on update
- Change-history UI + persistence of note / actor / time / changed field labels
- Unverify mobile/email on change + OTP/verify again
- Address verified flag; set on approve; clear on address change; Admin verify action
- Lock GST/PAN after verified
- Audit as needed for Admin updates

### Out of scope

- Sending account back to Pending when Admin edits
- Full KYC document vault
- Changing pricing-tier / credit UX (unless already on same page; not the focus of RC-01)
- Hard-blocking dispatch while address unverified (v1 = banner + Admin must verify; harden later if asked)

### Acceptance

- [ ] Client detail is a proper full-page layout (usable width, less wasted side space)
- [ ] Edit client opens prefilled form; save persists; account stays Approved
- [ ] Admin cannot save an update without Notes
- [ ] Change history lists note, datetime, admin, human field names
- [ ] Mobile/email change by anyone → unverified until OTP/verify again
- [ ] Address verified on Admin approve at onboarding; any later address change → unverified until Admin verifies
- [ ] Verified GST/PAN cannot be edited by client or Admin

### Suggested first PR

Detail layout + Edit prefilled form + required notes + stay Approved. Then verify flags (mobile/email/address) + GST/PAN lock. Then change-history button + list.

---

## RC-02 — Unwire / remove photo prescription orders from RX

### Type

Change — remove photo-order coupling from RX

### Goal

RX form orders stay as today. Photo prescription orders (`POST /api/orders/photo`, `orderImageUrl` path, staff/admin combined “RX and Photo” UX) are **removed / unwired** so RX is RX-only. Everything previously bolted onto RX for photo should come out.

### Current state

- RW-05 / `prescription-order-hold` treats RX (`[RX Order]` notes) and photo (`orderImageUrl`, not RX/Color) as the same hold/release family.
- Photo create (`POST /api/orders/photo`) uses the same warehouse-hold create fields as RX; staff access/list filters and notify rules share that module.
- UI copy and queues use combined wording such as **“RX and Photo”** (admin + staff web/mobile).
- Mobile can create photo orders; web mainly displays/classifies them via `isPhotoOrder()` / image + notes heuristics.

### Locked behaviour

1. **RX unchanged** — create, admin hold → assign → warehouse release → staff queues, permissions, and RX form UX keep current behaviour.
2. **Photo removed from RX surfaces** — no combined “RX and Photo” (or equivalent) labels, filters, nav, or queues.
3. **Unwire shared logic** — photo is no longer a sibling hold-candidate of RX in prescription-hold / list / report / classify paths that were wired for RW-05 photo parity.
4. **Photo product retired for this change** — remove or clearly disable create + staff/admin photo-on-RX wiring; do not leave half-working photo entry points that still look like RX.

### Scope (in)

- Unwire photo from RW-05 / `prescription-order-hold` (and callers) so hold/release/list/notify apply to **RX only**
- Remove UI labels/copy like **“RX and Photo”** across admin + staff website + mobile
- Remove or retire photo create/list/detail wiring bolted onto RX queues, filters, reports, nav
- Drop or gate `POST /api/orders/photo` (and mobile create entry) so photo is not a live path alongside RX
- Keep RX create/hold/assign/release/queues working

### Out of scope

- Redesigning the RX form itself
- Color-lens orders
- Building a replacement standalone photo-order product (unless asked later as a new RC)
- Rewriting RW-05 doc history (implementers follow this RC; RX hold rules stay)

### Acceptance

- [ ] No combined “RX and Photo” (or equivalent) labels in admin / staff UI
- [ ] Staff and admin RX surfaces show **RX only**
- [ ] Photo create / API / hold coupling removed or clearly retired (no live photo→RX pipeline)
- [ ] Classification helpers no longer treat photo as an RX-hold sibling for queues
- [ ] RX flow still works: hold → assign → release → staff see assigned RX

### Suggested first PR

Strip combined UI copy + RX-queue photo inclusion. Then unwire `isPhotoPrescriptionOrder` from hold/list/notify. Then retire photo create (API + mobile entry) and clean reports/filters that mixed photo into RX.

