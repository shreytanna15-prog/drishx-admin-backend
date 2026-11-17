# DrishX — Requested changes

**Document type:** Client meeting change backlog (bugs, UX, behaviour)  
**Audience:** Developers picking up assigned work  
**Last updated:** 2026-11-04

## How to use

- Each item has a stable ID (`RC-01`, `RC-02`, …).
- Default sections: **Type**, **Goal**, **Current state**, **Scope (in)**, **Out of scope**.
- Discuss → lock behaviour → then write the task here. Add items one by one across any module.
- End-phase / older backlog stays in [`remaining-work.md`](./remaining-work.md) (`RW-*`). This file is for newer requested changes.
- **Doc sync:** When an RC is locked, update that module’s **CLIENT-PLAN** (and README) so the living contract matches. Update **DEVELOPER-GUIDE** when the RC ships. Do not leave plan docs describing the old behaviour.
- **Product catalog:** more RCs are expected after RC-03 — keep catalog CLIENT-PLAN as the target contract and append further `RC-*` here as they are locked.

---

## Index

| ID | Task | Repos |
|----|------|-------|
| RC-01 | Admin edit client + detail UX + verify rules + change history | backend (admin panel); APIs as needed |
| RC-02 | Unwire / remove photo prescription orders from RX | backend, website, mobile, admin panel |
| RC-03 | Product catalog: optional material + power range as attribute | backend (admin panel); APIs as needed |
| RC-04 | Product catalog: parent + variants, new SKU/name builders | backend (admin panel); APIs as needed |
| RC-05 | Finish photo unwire (clients) + null-material parent uniqueness | backend, website, mobile |
| RC-06 | Walk-in: skip OTP when staff-created+verified; history; staff-only | backend, website, mobile |
| RC-07 | Catalog ADD / Eye / Axis | backend (admin panel) |
| RC-08 | Coating-specific product identity; shared power-range template | backend (admin panel) |
| RC-07 | Catalog: multi ADD on variant; auto L/R eye (V2); CYL-gated axes | backend (admin panel) |

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

- [x] Client detail is a proper full-page layout (usable width, less wasted side space)
- [x] Edit client opens prefilled form; save persists; account stays Approved
- [x] Admin cannot save an update without Notes
- [x] Change history lists note, datetime, admin, human field names
- [x] Mobile/email change by anyone → unverified until OTP/verify again
- [x] Address verified on Admin approve at onboarding; any later address change → unverified until Admin verifies
- [x] Verified GST/PAN cannot be edited by client or Admin
- [x] `customer-account-configuration` CLIENT-PLAN (+ DEVELOPER-GUIDE on ship) matches this RC

### Suggested first PR

Detail layout + Edit prefilled form + required notes + stay Approved. Then verify flags (mobile/email/address) + GST/PAN lock. Then change-history button + list.

**Shipped** — Admin Clients edit / verify / history (RC-01).

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

- [x] Backend: `POST /api/orders/photo` retired (410); RX hold/list no longer treat photo as sibling
- [x] No combined “RX and Photo” (or equivalent) labels in admin / staff UI
- [x] Staff and admin RX surfaces show **RX only**
- [x] Mobile/web: no live photo create path (see **[RC-05](#rc-05--finish-photo-unwire-clients--null-material-parent-uniqueness)**)
- [x] Classification helpers no longer treat photo as an RX-hold sibling for queues
- [x] RX flow still works: hold → assign → release → staff see assigned RX

### Suggested first PR

Backend hold/list/API retire done. Remaining client UI/create cleanup → **RC-05**.

**Shipped** — Photo prescription retired from RX (`POST /api/orders/photo` → 410; `rxLabWhere` / classify = RX notes only; legacy image rows stay catalog with neutral “Image attached” UX).

---

## RC-03 — Product catalog: optional material + power range as attribute

### Type

Change — product catalog / attributes (critical)

### Goal

1. **Material is optional** on create product — if Admin skips it, that is fine (omit from cascade/SKU when absent).  
2. Stop asking Admin to **type** SPH/CYL range numbers on create product. Instead they maintain **power-range masters** once (new Attributes tab), then **select** an existing range when creating a product. That range is part of product identity and the (interim) SKU — same Family · Base · Material · Index with **different ranges** are **different products** (different pricing / full matrix), even when overlapping cell powers exist (e.g. −4.25 and +1.25).

### Current state

- Attributes tabs: Family, Base, Material, Index, Coating, Color — no power-range master.
- Create product (`/inventory/products-catalog/new`): cascade Family → Base → Material (required-ish) + number inputs for SPH/CYL min–max.
- SKU auto-built from attribute codes + inline range bounds; uniqueness = same attrs + same range.
- Only a couple of **test** catalog products exist in practice.

### Locked behaviour

1. **Material optional**  
   Create/edit product may omit Material. No Material → do not require it in cascade; omit from SKU/display when absent.

2. **Power range attribute (new tab)**  
   - New Attributes tab + **list page** for power ranges (same list/active/edit patterns as other tabs where they fit).  
   - **Add UX differs** from a normal name/code form: Admin picks bounds via **select fields** (customer/mobile-style power pickers), not free number typing.  
   - Option universe **−40 … +8**, stepped as:
     | Band | Step |
     |------|------|
     | −40 → −16 | **0.5** |
     | after −16 toward +4 (e.g. −15.75 …) | **0.25** |
     | after **+4** → +8 | **0.5** |
   - Show options in the select the same way mobile shows power options (ordering / labels).

3. **How Admin names a range**  
   Client language for one range is slash form, e.g. **`-6.00/+2.00`** (SPH min/max).  
   Store **SPH min + SPH max** (required) and **CYL min + CYL max** (same select options so create product does not fall back to number inputs).  
   Auto display label from SPH bounds as `-6.00/+2.00`; show CYL summary beside it in the list (e.g. `Cyl 0.00/-2.00`).

4. **Create product**  
   Replace SPH/CYL number inputs with a **dropdown of existing active power-range attributes** (CRUD/list APIs parallel to other attribute types).  
   Selecting a range attaches that master to the product; bounds drive matrix + identity.

5. **Identity / SKU (interim)**  
   Full SKU **string redesign is a later RC**. For this task: keep encoding range from the **selected attribute’s bounds** into the current-style SKU so  
   `SV · HC · PLAIN · 1.56` + range **−6…+2** ≠ same attrs + **−6…+4**.  
   Duplicate same attributes + same power-range attribute (or same bounds) remains rejected.

6. **Existing products — no migration**  
   Do **not** build a data migration. Only ~2 test products: developer should **delete existing catalog products and recreate** them under the new model after shipping. Call this out clearly in the PR / notes.

### Scope (in)

- Material optional on product create/edit + SKU/display when absent  
- Power-range attribute type: schema, APIs (list/create/update/active), Attributes tab + list + add-with-selects UI  
- Shared stepped option helper (−40…+8 rules above) for admin selects  
- Create product: select power-range attribute; remove SPH/CYL free number inputs for range  
- Interim SKU/uniqueness from selected range bounds  
- Dev note: delete test products and recreate (no migrate)

### Out of scope

- Full SKU format redesign (separate future RC)  
- Migrating or rewriting existing production catalog rows  
- Changing customer/mobile wholesale order UX beyond reusing the same *style* of power select in admin  
- Stock matrix / pricing rule redesign beyond “range is part of product identity”

### Acceptance

- [x] Product can be saved **without** Material  
- [x] Attributes has a **Power range** tab with list + add/edit via selects (−40…+8 step rules)  
- [x] Range label reads like `-6.00/+2.00` (SPH); CYL bounds stored and visible  
- [x] Create product picks an existing power range (no typed SPH/CYL range numbers)  
- [x] Same other attrs + different power range ⇒ different product / different interim SKU  
- [x] Power-range APIs work like other attribute masters (active-only in create dropdowns)  
- [x] Docs/task note followed: delete ~2 test products and recreate; no migration path required
- [x] `product-catalog` CLIENT-PLAN (+ DEVELOPER-GUIDE on ship) matches this RC

### Suggested first PR

Power-range option helper + attribute API/schema + Attributes tab UI. Then wire create product to select a range + make Material optional. Then interim SKU from selected bounds; delete/recreate test products locally.

**Shipped** (with RC-04 parent+variants) — optional material + power-range masters.

### Follow-up (not this RC)

- SKU/name redesign + parent/variant architecture → **[RC-04](#rc-04--product-catalog-parent--variants-new-skuname-builders)**
- Further product-catalog meeting changes — add as new `RC-*` and sync CLIENT-PLAN when locked

---

## RC-04 — Product catalog: parent + variants, new SKU/name builders

### Type

Change — product catalog architecture (critical)

### Goal

1. Split catalog into a **parent** (attribute combination, created once) and **variants** (one per power-range attribute). Admin does not re-select the same attributes just to add another range.  
2. Replace typed product **name** and the old SKU format with **auto builders**: compact SKU codes + human-readable names (supplier-style, no brand).  
3. Each variant is a fully separate sellable product (own SKU, name, price, stock, matrix).

### Current state

- **Shipped (admin):** parent `LensProduct` + `LensProductVariant`; power-range masters (RC-03); Material optional; coating out of identity; auto SKU/name; create multi-range + preview; parent detail Add range; flat + expandable grouped list.  
- No stock/PO/order FKs on variants yet (stock-management follow-on).

### Locked behaviour

#### A. Parent + variant

| Layer | Holds | Role |
|-------|--------|------|
| **LensProduct (parent)** | Material? · Base · Index · Family · Color | Attribute combination only. Internal base code (not shown in UI). No stock / no sellable SKU. |
| **LensProductVariant** | Parent + **power-range attribute** | Sellable unit: unique `skuCode`, auto `name`, price, `isActive`, matrix, future stock/PO/orders |

- Parent uniqueness: `(materialId?, baseId, indexId, familyId, colorId, diameterId?, progressiveTypeId?)` — **coating is not part of identity**.  
- Variant uniqueness: `(productId, powerRangeId, axisId, additionId, eye)` and unique `skuCode`; `name` is display-only and may repeat.  
- **Coating** may remain as an Attributes master tab for later use, but is **not** on create-product identity, SKU, or name. **Green / Blue / …** live under **Color**.

#### B. SKU (variant — machine code)

Order (omit Material when absent; all families including SV):

`[MATERIAL-]BASE-INDEX-FAMILY[-COLOR]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}`

- Compact codes (`.` → `P`, negatives → `M`, e.g. `PG-BR-1P56-KT-GREEN-SM6TP2-C0TM2`).  
- **No coating** in SKU.  
- Power bounds from the selected power-range attribute.  
- Parent may store an **internal** base code without the power segment (not shown to Admin).

#### C. Name (variant — human)

Fully auto (Admin does **not** type name). Spaces + display labels + power as **`-6.00/+2.00`**:

`[Material] [Index] [Family] [Base] [Color] -6.00/+2.00`

Example: `PG 1.56 KT BR Green -6.00/+2.00`  

Ignore supplier brand / fancy names (DECENTRX, Night Ryder, 75mm, etc.).

#### D. Create / edit UX

1. Pick attributes once (Material optional; Family, Base, Index, Color as required by form rules).  
2. **Multi-select** one or more active power-range attributes.  
3. Preview every variant SKU + name before save → one parent + N variants.  
4. If that attribute combo already exists → open existing parent and offer **Add power range(s)** (do not invent a duplicate parent).  
5. Parent detail: table of variants + **Add power range**; each variant opens its matrix.  
6. After any variant has stock/orders: lock parent attribute edits. Lock power-range master bounds once used by a variant (create a new range instead of editing). Removing a range → deactivate variant (do not hard-delete if history exists).

#### E. Catalog list views

- Toggle **flat** (one row per variant) vs **grouped** (parents with expand → variants; group-by family / base / …).  
- Server-paginated for both; expand loads variants on demand. Search/filters server-side (`Paginated` / `drishx-client-api`).

#### F. Cutover

No migration. Delete ~2 test products; recreate under parent + variants.

### Scope (in)

- Schema: parent `LensProduct` (attrs only) + `LensProductVariant` (range FK, sku, name, price, …)  
- New `buildLensProductSkuCode` + `buildLensProductName` helpers  
- Create: multi-range; detail: add ranges; list: flat + grouped  
- Coating out of product identity / SKU / name  
- Doc sync + delete/recreate test data note  

### Out of scope

- Brand attribute / supplier alias exact-match  
- Overlapping-range order allocation (which variant fills −4.25 when two ranges overlap) — later orders/stock RC  
- Live stock cells, PO wiring (stock-management plans still apply to **variant** id)  
- Customer/mobile catalog rewrite  

### Acceptance

- [x] Parent = attributes once; multiple power ranges = multiple variants without re-picking attrs  
- [x] Variant SKU matches locked format (no coating; all families; encoded power)  
- [x] Variant name fully auto with `-6.00/+2.00`; no typed name on create  
- [x] Same parent + two ranges ⇒ two unique SKUs; each own price/matrix path (names may repeat across ADD/eye children)  
- [x] Existing parent reuse when attrs match; Add power range works  
- [x] Catalog flat + grouped views (server pagination / expand)  
- [x] Coating not required for product identity  
- [x] Test products deleted/recreated under parent+variants (cutover; schema migrate for new tables)  
- [x] `product-catalog` CLIENT-PLAN (+ DEVELOPER-GUIDE on ship) matches this RC  

### Suggested first PR

Schema parent/variant + SKU/name builders + APIs. Then create (multi-range) + parent detail add-range. Then list flat/grouped. Delete/recreate test products.

### Related

- Depends on / ships with **[RC-03](#rc-03--product-catalog-optional-material--power-range-as-attribute)** power-range attribute masters  
- Living contract: [`product-catalog/CLIENT-PLAN.md`](./product-catalog/CLIENT-PLAN.md)

---

## RC-05 — Finish photo unwire (clients) + null-material parent uniqueness

### Type

Change / cleanup — photo clients leftover + catalog uniqueness edge case

### Goal

1. Finish **RC-02** on website and mobile: no broken create calls, no photo-order product UI.  
2. Harden catalog parent uniqueness when **Material is absent** (treat as none; never show a “None” token; omit from SKU/name).

### Current state

- Backend photo create is **410 Gone**; RX hold/list updated.  
- Mobile/web: no live photo create path; shop does not call `/api/orders/photo` (dead `uploadPhotoOrder` removed). Legacy rows stay readable as “Image attached”.  
- **Null-material parent uniqueness:** partial unique indexes (`20261104160000_lens_product_null_material_unique`) + `findParentByAttrs` / create reuse — one parent per `(family, base, index, color)` when material is absent.

### Locked behaviour / sub-tasks

1. **Mobile shop must not call the broken API**  
   Remove or gate photo upload / `uploadPhotoOrder` so nothing hits `POST /api/orders/photo`.

2. **Remove photo-order UI**  
   Drop create entry points and “RX and Photo” / photo-prescription product surfaces on mobile (and web where copy still implies a live photo path).  
   Legacy rows may stay readable if needed; **no new photo orders**. RX-only queues/labels.

3. **Flat + grouped-by-parent is enough**  
   No extra group-by (family/base/…) required — already shipped in RC-04.

4. **Name using attribute codes is acceptable**  
   No follow-up to expand codes into long display names for Material/Family/Base/Index.

5. **Null material = none (identity only)**  
   - Absent material means no material — do **not** require an explicit “None” label in UI.  
   - Omit from SKU and name (already).  
   - Enforce **one parent** per `(family, base, index, color)` when material is null (business + DB-safe uniqueness). Create/reuse must not create a second parent for the same combo without material.

### Scope (in)

- Mobile: remove/gate photo create + shop entry  
- Web (+ admin labels if any remain): strip photo create/copy from RX surfaces  
- Catalog: fix null-material parent uniqueness (service + migration/index as needed)  
- Tests covering “no material” duplicate parent rejection / reuse  

### Out of scope

- New photo-order product  
- Extra catalog group-by axes  
- Renaming SKU/name tokens to long marketing names  
- Live stock matrix  

### Acceptance

- [x] Mobile shop never calls `/api/orders/photo`  
- [x] No photo-order create UI; RX surfaces are RX-only (no “RX and Photo” product framing)  
- [x] Legacy photo rows (if any) do not block RX; no new photo creates possible  
- [x] Two creates with same attrs and **no** material reuse one parent (or hard-reject duplicate), never two parents  
- [x] SKU/name still omit material when absent; no “None” token required in UI  
- [x] CLIENT-PLAN uniqueness note matches  

### Suggested first PR

**Shipped** — client photo create removed; null-material parent uniqueness via partial indexes + create reuse + integration test.

### Related

- Completes leftover from **[RC-02](#rc-02--unwire--remove-photo-prescription-orders-from-rx)**  
- Catalog rule extends **[RC-03](#rc-03--product-catalog-optional-material--power-range-as-attribute)** / **[RC-04](#rc-04--product-catalog-parent--variants-new-skuname-builders)**  
- [`product-catalog/CLIENT-PLAN.md`](./product-catalog/CLIENT-PLAN.md)

---

## RC-06 — Walk-in: skip OTP (staff-created + verified), history, staff-only

### Type

Change — Path C Employee/Admin walk-in (counter)

### Goal

1. **Skip OTP** when the typed mobile already belongs to a **staff-created** customer whose mobile is **verified** — go straight into on-behalf order (catalog / order flow).  
2. Add a **walk-in history** list of staff-created customers so staff can re-select a prior counter customer without retyping mobile / redoing OTP.  
3. Walk-in is **staff-created only**. Self-signup (Path A, `createdByStaffId = null`) must **never** enter or complete via the walk-in create/history path. Remove any code that currently allows that.

### Current state

- Path C UI (web + mobile): enter mobile → always send/verify `WALK_IN` OTP → `POST /api/users/customers/walk-in` (requires `challengeId`) → select customer → on-behalf order.  
- On-behalf gate already allows: **Approved+active**, OR **PENDING_REVIEW + `createdByStaffId` set** (`assessStaffOnBehalfOrderEligibility`).  
- Admin Path B create also sets `createdByStaffId` (same staff-created family as walk-in).  
- **Leak today:** `POST /api/auth/otp/mobile/verify` with `purpose=WALK_IN` returns `user` for **any** CUSTOMER on that mobile (including Path A self-signup). Web/mobile walk-in panels call `onCreated(res.user)` when `res.user?.id` is set — so a self-signup shop can be pulled into the walk-in/on-behalf selection path after OTP. That must stop.  
- No walk-in “history” UI; no lookup that skips OTP for already-verified staff-created mobiles.  
- Create still always requires a fresh WALK_IN OTP claim (`assertWalkInMobileVerified`).

### Definitions

| Term | Meaning |
|------|---------|
| **Staff-created** | `User.role = CUSTOMER` and `createdByStaffId != null` (Path B Admin create **or** Path C walk-in create) |
| **Self-signup / Path A** | Customer with `createdByStaffId = null` — **out of walk-in** |
| **Mobile verified** | `mobileVerifiedAt` set (channel verified) |
| **Walk-in history** | List of staff-created customers for the walk-in / counter UI (pending + verified / approved as product allows) |

### Locked behaviour

#### A. Who walk-in is for

- Only **Employee or Admin** (existing staff session). Customers never use walk-in.  
- Walk-in create + history + skip-OTP apply **only** to **staff-created** customers.  
- **No** special UX for “verified Path A mobile typed into walk-in.” If that mobile is Path A: **reject for walk-in** with a clear message (e.g. use Order on behalf picker / that account already exists via self-signup). Do **not** invent an intermediate “select them anyway from walk-in” flow.

#### B. Skip OTP

When staff enters a mobile on the walk-in screen:

1. **Lookup** (staff-auth API): find CUSTOMER by mobile.  
2. If **no** customer → keep today’s create path: send OTP → verify → create walk-in (`createdByStaffId` = staff) → continue to order.  
3. If customer exists and **`createdByStaffId` is null** (Path A) → **do not** send walk-in OTP as a way to “claim” them; **do not** select them into walk-in; show clear error / redirect guidance.  
4. If customer is **staff-created** and **mobile verified** → **skip OTP**; select that customer and continue to on-behalf order (same as after successful create today).  
5. If customer is **staff-created** and **mobile not verified** → require OTP (verify marks `mobileVerifiedAt`), then continue (do not create a duplicate). Prefer selecting the existing row over 409 create.

#### C. Walk-in history

- Show a list (or searchable recent list) of **staff-created** customers (`createdByStaffId != null`).  
- Include pending and verified/approved staff-created rows that are still usable for counter order (respect CLOSED/BLOCKED; align with orderable rules).  
- **Pick from history:**  
  - **Verified mobile (or otherwise order-ready staff-created)** → go to catalog / on-behalf order.  
  - **Pending staff-created** → stay on walk-in / create-adjacent UX as today, then place on-behalf (existing pending exception).  
- History must **not** list Path A self-signup customers.

#### D. Remove non–staff-created from walk-in code paths

Audit and fix so walk-in cannot adopt Path A users:

| Area | Required behaviour |
|------|--------------------|
| `POST …/otp/mobile/verify` (`WALK_IN`) | Must **not** return a selectable `user` for Path A (`createdByStaffId` null). Prefer `user: null` + explicit error/code, or return user only when staff-created. |
| Web/mobile walk-in panels | Never call `onCreated` / select customer from verify/create unless staff-created. |
| `POST /api/users/customers/walk-in` | Keep create for new mobiles only; on 409 existing: if Path A → error without selecting; if staff-created → clients may select only when rules in B allow. |
| New lookup / history APIs | Filter `createdByStaffId: { not: null }` (or equivalent). |
| Docs / CLIENT-PLAN | Path C steps describe skip-OTP + history; state Path A is excluded from walk-in. |

Do **not** weaken the separate **Order on behalf** picker for approved customers (including Path A approved shops) — that remains the path for existing self-signup shops. This RC only hardens **walk-in**.

### Scope (in)

- Backend: mobile lookup for walk-in (staff-created + verification status); WALK_IN verify response hardened; walk-in create/409 handling clarified; history list endpoint or reuse filtered customers list  
- Web + mobile: walk-in panel UX — skip OTP when allowed; history list + pick; block Path A from walk-in selection  
- Tests for: skip OTP staff-created+verified; Path A rejected from walk-in; history excludes Path A; pending staff-created still orderable  
- Sync `customer-account-configuration` CLIENT-PLAN (+ DEVELOPER-GUIDE on ship)

### Out of scope

- Changing Path A self-signup  
- Changing Admin Path B create form (except that those customers appear in walk-in history as staff-created)  
- Merging Path A into staff-created / changing `createdByStaffId` after the fact  
- Redesigning full on-behalf catalog flows  
- RC-01 Admin edit/verify (already locked separately)

### Acceptance

- [x] Staff-created + mobile verified → walk-in skips OTP and continues to on-behalf order  
- [x] New mobile → OTP → create with `createdByStaffId` → order (unchanged happy path)  
- [x] Path A mobile typed into walk-in → cannot be selected / created via walk-in; clear error  
- [x] WALK_IN OTP verify no longer hands Path A users into walk-in `onCreated`  
- [x] Walk-in history lists only staff-created customers; pick works for pending and verified per locked rules  
- [x] Pending staff-created on-behalf still works; CLOSED/BLOCKED excluded  
- [x] `customer-account` CLIENT-PLAN Path C matches this RC

### Suggested first PR

Backend lookup + harden WALK_IN verify / walk-in create responses + tests. Then web walk-in panel (skip OTP + history). Then mobile parity. Doc sync.

### Related

- Builds on Path C in [`customer-account-configuration/CLIENT-PLAN.md`](./customer-account-configuration/CLIENT-PLAN.md)  
- On-behalf gate: `app/lib/customer-order-eligibility.ts`  
- Surfaces: web `EmployeeWalkInCreatePanel` / mobile `employee-walk-in-create-panel`; `POST /api/users/customers/walk-in`

---

## RC-07 — Catalog ADD / Eye / Axis (locked feedback)

### Type

Backend admin catalog (schema + services + Attributes/Create UI).

### Goal

- **ADD:** multi-select → variant `additionId` (cartesian), not parent
- **Eye:** auto `LEFT`/`RIGHT` on Progressive (V2) variants only; no create picker; never on parent
- **Axis:** never for SV; for KT/V2 only when range CYL ≠ 0 (`cylMin`/`cylMax` both 0 → `axisId` null); mixed ranges gate per range
- **Diameter:** optional single on parent (unchanged)

### Done when

- [x] Schema + migration: variant `additionId`/`eye`/`axisId`; parent `diameterId` only
- [x] Family flags + Axis/ADD/Diameter masters seeded; Attributes tabs
- [x] Product service cartesian + preview; SKU includes ADD/diameter/eye/axis when set
- [x] Create / parent detail UI: Diameter + Axis/ADD multi; no Eye control; Eye column on variants
- [x] Docs: CLIENT-PLAN / DEVELOPER-GUIDE / lens-industry-reference

### Related

- [`product-catalog/CLIENT-PLAN.md`](./product-catalog/CLIENT-PLAN.md)  
- [`product-catalog/DEVELOPER-GUIDE.md`](./product-catalog/DEVELOPER-GUIDE.md)  
- `app/lib/catalog/lens-product-service.ts`, `lens-product-sku.ts`

---

## RC-08 — Coating-specific product identity (14 Nov client call)

The client requires identical power-range/axis/ADD matrices under multiple distinct products (hard coat, blue cut, poly hard coat, etc.). Coating must separate parent products and variant SKUs so future per-cell stock and PO records cannot mix between coatings. `LensPowerRange` remains a reusable bounds master; it does not own stock.

- New `LensProduct` creation requires an active coating; one coating per parent. Same other attrs with different coating creates a distinct parent, not extra variants on the first product.
- Include the coating code in base/variant SKUs and its label in variant names; existing unclassified parents/SKUs remain unchanged. No inferred backfill from base/material/color.
- List/detail/search/filter/preview expose coating. Existing legacy rows may still add variants under their null-coating parent.
- Live quantities are still on the legacy lens leaves, while the new catalog matrix cells are view-only. Separate stock per new parent/variant needs the stock-management leaf cutover; this identity change does not manufacture stock balances.
- 45° and 135° may share a displayed oblique-axis matrix section, but the exact axis remains on every row and cell.

