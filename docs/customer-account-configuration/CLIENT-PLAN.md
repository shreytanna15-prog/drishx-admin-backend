# Customer account configuration — Client plan

**Document type:** Customer onboarding plan  
**Repos:** Admin panel, web app, mobile, shared backend  
**Follow-ups:** Admin edit / verify / history locked in **[RC-01](../requested-changes.md#rc-01--admin-edit-client-detail-ux-verify-rules-notes-history)** (`requested-changes.md`) — this plan matches that target.

---

## 1. Goal

Upgrade how optical-shop customers are identified, approved, commercially configured, and managed — so that:

1. A customer account can be created in **three ways**: self-signup, **Admin** from admin panel, or **Employee** from their staff login.
2. **Mobile OTP** is required; after success the mobile is marked **verified**.
3. **Email is optional**; if provided, run **email OTP** and mark email **verified** (email provider TBD).
4. **Admin** can list, add, and edit clients (full-width detail, prefilled edit form, required update notes, change history + commercial setup).
5. **Employee** can create a customer (phone + OTP) and place a **live / walk-in order** while Admin finishes commercial setup.
6. Each client gets a **pricing tier (A–F)** that applies a **% discount** at checkout.
7. **Credit** is controlled by a **limit** (no credit period in this phase).
8. **Ledger** and **payments** stay visible and audited.
9. **Order cancel → refund** has a clear money-back path.
10. Customers can **fix wrong details after reject** and resubmit; **customer** material profile edits need **admin re-approval**. **Admin** edits stay **Approved**.
11. Clear account actions: **Blocked**, **Suspended (credit)**, **Closed**.
12. Admin can **check GST status on demand** (button on client review) — not automatic on every signup.
13. Address is **verified on Admin approve** at onboarding; later address changes (anyone) make address **unverified** until Admin verifies again. Mobile/email change → re-verify. Verified **GST/PAN** are locked.

This plan is written so UI, data, APIs, and flows are agreed **before** build — to avoid rework.

---

## 2. In scope / out of scope

### In scope

- **Three create paths:** Customer self-signup · Admin panel create · Employee create (staff login)
- Mobile OTP (**required**) → `mobileVerified`
- Email OTP (**optional**, when email is entered) → `emailVerified` (email SMS/email provider **not chosen yet**)
- Admin: Clients list, Add client, full-width Client detail, Edit (prefilled form), required Admin update **Notes**, **Change history**, actions + commercial setup
- Address verified flag: set on onboarding **Approve**; clear when address changes; Admin **Verify address**
- Mobile/email re-verify after change by anyone; GST/PAN locked once verified
- Employee: create-customer flow + walk-in **live order** (including customers without GSTIN)
- Staff-created accounts stay **pending Admin** for commercial configuration
- Pricing tiers admin page (A–F, editable discount %; **D = base / 0%**)
- Assign tier + credit limit on the client page
- Apply tier discount at checkout / payment total
- Customer ledger (v1: system posts + admin view)
- Payment history with audit trail
- Cancelled-order refund flow (record + verify + ledger)
- **Customer** profile edit → pending again; reject → customer can edit and resubmit
- Account actions: Blocked / Suspended (credit) / Closed
- Better table UI on admin client list
- **On-demand GSTIN active check** on Admin client review (button; not in signup/auth flow)

### Out of scope (this phase)

- Live / Non-live stock view for orders (separate module later)
- Credit **period** (15/30 days per customer) — only **credit limit**
- Legal entity vs multi-shop/branch data model rewrite
- Full KYC document vault (GST certificate upload, etc.) — fields stay; uploads later
- Automatic GST verification on every signup / OTP (too costly; Admin button only)
- Replacing the entire finance module

---

## 3. How it works today vs after

### Identity & signup

| Today | After |
|-------|--------|
| Email + password required; mobile is a field | **Mobile required** + OTP → **mobile verified** |
| No OTP services | Mobile OTP via **2factor**; Email OTP via **provider TBD** (not implemented yet) |
| No verified flags | `mobileVerifiedAt` required path; `emailVerifiedAt` when email OTP succeeds |
| Email always required | Email **optional**; if entered → send/verify email OTP |

### Who can create a customer

| Today | After |
|-------|--------|
| Mostly self-signup (+ weak staff bootstrap) | **1)** Self-signup **2)** Admin panel Add client **3)** Employee create-customer flow |
| Staff on-behalf order; insecure staff-created password | Employee create with phone + OTP; walk-in live order; Admin commercial setup |

### Admin clients

| Today | After |
|-------|--------|
| Clients list + basic detail + approve/reject/suspend | Proper **table list**, **Add client**, full-width **detail**, **Edit** (prefilled), required **Notes**, **Change history**, commercial fields and actions |
| No pricing tier | **Tier A–F** assigned per client |
| No GST active check | Admin **Verify GST** button on client review (on demand) |
| No address verified flag | **Address verified** on Approve; any later address change → unverified until Admin verifies |
| GST/PAN editable after verify | **Locked** once verified (client and Admin) |

### Money

| Today | After |
|-------|--------|
| Credit limit exists but mostly **warn-only** | Credit **limit** enforced at checkout (see rules below) |
| Ledger posts for invoice/payment/credit note | Same + **refund** on cancelled order clearly posted |
| Cancel order ≠ clear refund payout UI | Dedicated refund path with payment id / audit |

### Status & edits

| Today | After |
|-------|--------|
| Reject can feel like a dead end | Reject + reason → customer **edits and resubmits** |
| Customer profile edit does not force re-review | Material profile change → **pending again**; orders frozen until approve |
| Suspend ≈ deactivate | Separate **Blocked / Suspended (credit) / Closed** |

---

## 4. End-to-end flows

> Flow diagrams use plain boxes so they stay clear when exported to **PDF**.

### 4.0 Three ways to create a customer

```
                    ┌─────────────────────────┐
                    │  New customer account   │
                    └───────────┬─────────────┘
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ A. SELF-SIGNUP    │ │ B. ADMIN PANEL    │ │ C. EMPLOYEE       │
│ Web / mobile app  │ │ /clients/new      │ │ Staff login       │
│ Customer fills    │ │ Admin fills form  │ │ Create-customer   │
│ everything        │ │ + commercial      │ │ flow + optional   │
│                   │ │ setup             │ │ live walk-in order│
└─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘
          │                     │                     │
          └─────────────────────┴─────────────────────┘
                                ▼
              Status PENDING_REVIEW (until Admin approves)
              Mobile must be OTP-verified on all paths
```

| Path | Who starts it | Where | Commercial setup |
|------|---------------|--------|------------------|
| **A. Self-signup** | Customer | Web / mobile signup | Admin after review |
| **B. Admin create** | Admin | Admin panel → Add client | Admin can set tier/credit on create or detail |
| **C. Employee create** | Employee | Employee web / mobile (own login) | Always Admin later; employee may place live order now |

### 4.1 Identity: mobile OTP (required) + email OTP (optional)

**Providers**

| Channel | Provider | Status |
|---------|----------|--------|
| Mobile SMS OTP | **2factor** | Decided |
| Email OTP | **TBD** (e.g. Resend / SES / SendGrid / Postmark) | Not chosen; **not implemented today** |

**Verified flags**

| Flag | When set |
|------|----------|
| Mobile verified | After successful mobile OTP |
| Email verified | After successful email OTP (only if email was entered) |

**Mobile (always)**

```
┌─────────────────────────────────────┐
│  Enter mobile number (required)     │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  Send mobile OTP (2factor)           │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  Enter code → Verify                │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  Mark mobile VERIFIED               │
│  Continue registration / create     │
└─────────────────────────────────────┘
```

**Email (optional)**

```
┌─────────────────────────────────────┐
│  Enter email?                       │
└─────────────────┬───────────────────┘
           no /   │   \ yes
                ▼       ▼
   ┌──────────────┐   ┌──────────────────────────────┐
   │ Skip email   │   │ Send email OTP (provider TBD)│
   │ emailVerified│   └──────────────┬───────────────┘
   │ stays empty  │                  ▼
   └──────┬───────┘   ┌──────────────────────────────┐
          │           │ Enter code → Verify          │
          │           └──────────────┬───────────────┘
          │                          ▼
          │           ┌──────────────────────────────┐
          │           │ Mark email VERIFIED          │
          │           └──────────────┬───────────────┘
          └──────────────┬───────────┘
                         ▼
              Continue (business / GST / …)
```

| Rule | Detail |
|------|--------|
| Mobile | Required; cannot proceed without mobile verified |
| Email | Optional; if skipped, no email OTP |
| Email entered but not verified yet | **v1 default:** allow continue; verify later from profile |
| All three create paths | Same OTP + verified-flag rules |

### 4.2 Path A — Customer self-signup

```
┌─────────────────────────────────────┐
│  1. Open signup (web / mobile)      │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  2. Mobile OTP → mobile verified    │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  3. Optional email + email OTP      │
│     → email verified (if done)      │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  4. Business + GST + addresses      │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  5. Submit → PENDING_REVIEW         │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  6. Admin reviews                   │
└─────────────────┬───────────────────┘
           ┌──────┴──────┐
           ▼             ▼
┌──────────────────┐   ┌──────────────────────────┐
│ APPROVE          │   │ REJECT (+ reason)        │
│ → APPROVED       │   │ → REJECTED               │
│ Can order*       │   │ Customer edits &         │
└──────────────────┘   │ resubmits                │
                       └──────────────────────────┘

* Only if account is not Blocked / Closed.
```

### 4.3 Path B — Admin creates client (admin panel)

```
┌──────────────────────────────────────────┐
│  1. Admin → Clients → Add client         │
│     Path: /clients/new                   │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  2. Enter mobile + business / GST /      │
│     address fields                       │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  3. Optional commercial setup            │
│     • Pricing tier (default D)           │
│     • Credit limit                       │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  4. Save client                          │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  5. Customer verifies mobile (OTP)       │
│     on invite / first login              │
│     Optional: email OTP if email set     │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  6. Admin approves / activates as needed │
│     (Verify GST button available here)   │
└──────────────────────────────────────────┘
```

### 4.4 Path C — Employee creates customer + live order

**Use case:** Walk-in purchase, or customer without GSTIN. Employee uses **their own staff login** (not the Admin panel). Admin later finishes commercial setup.

```
┌──────────────────────────────────────────┐
│  1. Employee (staff login)               │
│     → Create customer                    │
│     Enter phone number                   │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  2. Mobile OTP → mobile verified         │
│     (customer phone)                     │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  3. Customer account created             │
│     Status → PENDING_REVIEW              │
│     Queued for Admin commercial setup    │
│     (tier, credit, approve)              │
└────────────────────┬─────────────────────┘
          ┌──────────┴──────────┐
          ▼                     ▼
┌─────────────────────┐  ┌─────────────────────────────┐
│ A. LIVE ORDER (now) │  │ B. Customer later logs in   │
│                     │  │    with same mobile         │
│ Employee places     │  │    → finishes registration  │
│ order on behalf     │  │      (business / GST        │
│ (GSTIN not required │  │       optional / addresses) │
│  for this purchase) │  │                             │
│                     │  │ Admin still reviews &       │
│                     │  │ sets up commercial account  │
└─────────────────────┘  └─────────────────────────────┘
```

| Rule | Detail |
|------|--------|
| Who creates | **Employee** (staff login) — separate from Admin panel create |
| Identity | Phone + OTP; optional email + email OTP same as other paths |
| Commercial setup | **Admin only** — tier, credit limit, final approve |
| Live order | Employee may place on-behalf order while still pending Admin setup |
| Self-serve later | Customer logs in with mobile OTP and completes the form |
| GSTIN | Optional for walk-in; Admin may Verify GST later |

### 4.5 Customer edits profile (any status)

Works for **pending**, **rejected**, and **approved** (not for **Closed**).

```
┌──────────────────────────────────────────┐
│  1. Customer opens My Business / profile │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  2. Edit details  →  Save                │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  3. Status → PENDING_REVIEW              │
│     Orders frozen until admin approves   │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  4. Admin reviews                        │
└────────────────────┬─────────────────────┘
              ┌──────┴──────┐
              ▼             ▼
┌───────────────────┐  ┌─────────────────────────┐
│ APPROVE           │  │ REJECT (+ reason)       │
│ → APPROVED        │  │ → REJECTED              │
│ Orders unlocked   │  │ Customer can edit again │
└───────────────────┘  │ (back to step 1)        │
                       └─────────────────────────┘
```

**Important rule:** When **Admin** edits a client, changes apply **immediately**. That does **not** send the account back to pending.

### 4.5a Admin edits client (RC-01)

| Rule | Detail |
|------|--------|
| Detail UX | `/clients/[id]` is a **full-width** admin page (not a skinny one-column card stack) |
| Edit | Button → same create form **prefilled** → save; account stays **Approved** |
| Notes | Every Admin update requires a **Notes** reason string |
| Change history | Button beside Edit → list: datetime, admin, note, human-readable field names changed |
| Mobile / email | Change by **client or Admin** → that channel **unverified** until OTP / verify again |
| Address (Option A) | Onboarding **Approve** sets address **verified**. Later address change by anyone → **unverified**; Admin **Verify address** on detail (no OTP). Banner while pending. Account stays Approved |
| GST / PAN | Once verified, **neither** client nor Admin can change them |

### 4.6 Pricing tier at checkout

```
  Product subtotal
         │
         ▼
  ┌─────────────────────────────┐
  │ Apply customer tier %       │
  │ (A–F; D = base = 0%)        │
  └─────────────┬───────────────┘
                ▼
  ┌─────────────────────────────┐
  │ Calculate GST / tax on      │
  │ the discounted amount       │
  └─────────────┬───────────────┘
                ▼
         Payable total
```

| Rule | Detail |
|------|--------|
| Tiers | A–F on admin **Pricing tiers** page; each has an editable discount % |
| Base | **D = 0%** by default |
| Assignment | Set on the individual **Client detail** page |
| When applied | On product subtotal **before GST** |

### 4.7 Cancelled order → refund

```
┌──────────────────────────────────────────┐
│  1. Order is cancelled                   │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  2. System marks refund DUE              │
│     (amount customer should receive)     │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  3. Finance / Admin records payout       │
│     • Date                               │
│     • Mode (UPI / bank / cash / …)       │
│     • Amount                             │
│     • Refund / payment reference id      │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  4. Customer ledger updated              │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  5. Audit log written                    │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│  6. Visible on order detail +            │
│     client finance section               │
└──────────────────────────────────────────┘
```

---

## 5. Admin UI changes

### 5.1 Clients list (improved table)

| Item | Detail |
|------|--------|
| **Path** | `/clients` |
| **Navigate** | Admin sidebar → **Client & CRM** → **Clients** |
| **Purpose** | Search and manage all optical-shop accounts |

**Table columns (suggested):** Shop / business name, Mobile, Email, Approval status, Account action (Blocked / Suspended / Closed), Pricing tier, Credit limit, Outstanding (if cheap), Updated, Actions.

**Filters:** Search (name / mobile / GSTIN), approval status, account action, tier.

**Actions from list:** Open detail, quick status badges. Primary CTA: **Add client**.

### 5.2 Add client

| Item | Detail |
|------|--------|
| **Path** | `/clients/new` |
| **Navigate** | `/clients` → button **Add client** |
| **Purpose** | Admin onboards a shop without waiting for self-signup |

**Form groups:** Mobile (required), optional email, business, GST (optional fields), addresses, commercial (tier default **D**, credit limit optional), notes.

**After save:** Land on `/clients/[id]` or list with success message. Customer still verifies mobile via OTP before full self-serve login if not already verified.

### 5.3 Client detail / edit + actions

| Item | Detail |
|------|--------|
| **Path** | `/clients/[id]` |
| **Navigate** | Clients table → row click / **Edit** |
| **Purpose** | Single place to view, edit, commercially configure, and take account actions |

**Sections:**

1. **Business & contact** — editable by admin  
2. **GST & tax** — editable + **Verify GST** button (on-demand active check; result shown + cached on profile)  
3. **Addresses** — billing / shipping  
4. **Commercial** — pricing tier, credit limit, credit allowed yes/no  
5. **Finance summary** — outstanding, available credit, link to ledger / payments  
6. **Orders summary** — counts / recent (link to orders)  
7. **Activity** — approvals, rejects, GST checks, tier changes, refunds (from audit)

**Approval actions:** Approve | Reject (with reason) | Reopen to pending  

**GST check (cost control):** Admin clicks **Verify GST** only when reviewing. Not run on signup, OTP, or automatically. Each click may incur a provider charge.

**Account actions:** Block | Suspend credit | Close | Clear action / reactivate as allowed  

### 5.3b Path C — Employee create walk-in customer

| Item | Detail |
|------|--------|
| **Where** | Staff web / mobile (near existing **Order on behalf**) — **not** the Admin panel |
| **Navigate** | Employee orders → Create customer / Walk-in |
| **Purpose** | Start account with phone + OTP, then place live order |

**Steps:** Enter mobile → OTP verify (→ mobile verified) → optional email + email OTP → account created (pending Admin) → optional minimal name/shop → **Place order** (on behalf). GSTIN not required for the walk-in purchase.

### 5.4 Pricing tiers (new page)

| Item | Detail |
|------|--------|
| **Path** | `/finance/pricing-tiers` *(or `/settings/pricing-tiers` if you prefer settings)* |
| **Navigate** | Admin sidebar → **Finance** → **Pricing tiers** |
| **Purpose** | Define discount % for tiers A–F |

**UI:** Table of tiers A…F; each row editable **discount %**; **D** marked as **Base**; Save.

Changing a tier’s % affects **all customers on that tier** at next checkout (document this for the client).

---

## 6. Customer / app UI changes

| Surface | Change |
|---------|--------|
| Signup (web + mobile) | Start with **mobile** → OTP → optional email (+ optional email OTP) → business/GST/addresses |
| Employee create customer | Phone + OTP → pending account; then on-behalf **live order**; customer can later finish registration |
| Pending / rejected screens | Show status + reject reason; **Edit profile & resubmit** always available when pending or rejected |
| Profile / My Business | Editable in pending, rejected, approved, etc. (not when **Closed**) |
| Checkout (self-serve) | Show tier discount line if % &gt; 0; block if over credit limit or **Blocked**; self-serve still needs **Approved** |
| Walk-in order (staff) | Allowed for employee-created pending customer (exception for counter sales) |
| Order detail | If cancelled and refund due / paid — show refund status |

---

## 7. Data shape — before → after

### 7.1 Customer identity

**Before (simplified):**

```
User
  email (required, unique)
  password
  mobileNumber (optional field)
  approvalStatus: PENDING_REVIEW | APPROVED | REJECTED
  isActive (used as “suspend”)
  creditLimit (optional, warn-only)
```

**After (simplified):**

```
User
  mobileNumber (required, unique)     ← primary identity
  mobileVerifiedAt
  email (optional, unique when set)
  emailVerifiedAt (optional)
  password / session via OTP (as implemented)
  approvalStatus: PENDING_REVIEW | APPROVED | REJECTED
  accountAction: NONE | BLOCKED | CREDIT_SUSPENDED | CLOSED   ← new
  pricingTierId → PricingTier (A–F)
  creditLimit
  creditAllowed (boolean)
  … existing business / GST / address fields …
```

### 7.2 Pricing tier (new)

```
PricingTier
  code: A | B | C | D | E | F
  name (optional label)
  discountPercent (e.g. 2.00)
  isBase (true for D)
  isActive
```

### 7.3 Refund (cancelled order)

```
OrderRefund (or equivalent)
  orderId
  customerId
  amountDue
  amountPaid
  status: DUE | PARTIAL | PAID | CANCELLED
  payouts[] → date, mode, amount, reference / paymentId, recordedBy
```

Ledger gets a matching credit/adjustment entry when payout is recorded.

---

## 8. Account actions (meaning)

| Action | Customer can log in? | Customer can order? | Credit |
|--------|----------------------|---------------------|--------|
| **None** (normal) | Yes (if approved) | Yes (if approved) | Per limit |
| **Blocked** | Yes | **No** | N/A |
| **Suspended (credit)** | Yes | Yes, but **no credit** — must not exceed policy as if limit = 0 / advance only | Credit off |
| **Closed** | **No** | **No** | Closed; history kept |

Approval (`PENDING` / `APPROVED` / `REJECTED`) stays separate from these actions.

**While `PENDING_REVIEW` after a profile edit:** treat like not fully approved for ordering → **orders frozen** until Approve.

---

## 9. Commercial rules (locked for this plan)

1. **Tiers A–F**; default assignment **D (0%)**.  
2. Admin edits % on the tiers page; assigns tier on client page.  
3. Discount = tier % off **product subtotal before GST**.  
4. **Credit limit** only — no per-customer credit period in this phase.  
5. At checkout: if `outstanding + this order > creditLimit` (and credit allowed / not credit-suspended) → **block checkout** with a clear message (not silent warn-only).  
6. **Blocked** always blocks ordering.  
7. **Closed** accounts cannot log in.

---

## 10. APIs by function (what they do / where used)

Paths are indicative; exact URLs can match existing `/api/...` style.

### Auth / OTP

| Function | Who calls | Purpose |
|----------|-----------|---------|
| `POST /api/auth/otp/mobile/send` | Web, mobile, Admin invite, Employee walk-in | Send SMS OTP (2factor) |
| `POST /api/auth/otp/mobile/verify` | Same | Verify → set `mobileVerifiedAt`; continue create / login |
| `POST /api/auth/otp/email/send` | Web, mobile, profile | Send email OTP when email entered (**provider TBD**) |
| `POST /api/auth/otp/email/verify` | Same | Verify → set `emailVerifiedAt` |

**Providers**

| Channel | Decision |
|---------|----------|
| Mobile SMS | **2factor** (locked) |
| Email | **TBD** — shortlist: Resend, Amazon SES, SendGrid, Postmark |

### Admin / employee clients

| Function | Who calls | Purpose |
|----------|-----------|---------|
| `GET /api/users/customers` | Admin / employee list | Paginated/filtered client table |
| `POST /api/users/customers` | Admin add page | Create client (full form) |
| `POST /api/users/customers/walk-in` | Employee / Admin | Create by mobile after OTP; pending Admin setup |
| `GET /api/users/customers/:id` | Admin detail | Full client profile |
| `PATCH /api/users/customers/:id` | Admin edit | Update fields (no re-approval) |
| `POST /api/users/:id/approve` | Admin detail | approve / reject / reopen (existing pattern, extended) |
| `POST /api/users/:id/account-action` | Admin detail | block / credit-suspend / close / clear |
| `POST /api/users/:id/verify-gst` | Admin detail only | On-demand GSTIN active check (button); store last result |

### Place order (walk-in exception)

| Function | Who calls | Purpose |
|----------|-----------|---------|
| Existing on-behalf place-order APIs | Employee / Admin | Allow order for walk-in **pending** customer created by staff; self-serve customers still need Approved |

### Pricing tiers

| Function | Who calls | Purpose |
|----------|-----------|---------|
| `GET /api/admin/pricing-tiers` | Tiers page + client form | List A–F |
| `PUT /api/admin/pricing-tiers` | Tiers page | Update discount % |

### Checkout / pricing

| Function | Who calls | Purpose |
|----------|-----------|---------|
| Existing cart / place-order APIs | Web, mobile, admin on-behalf | Apply tier discount; enforce credit + blocked |

### Refunds

| Function | Who calls | Purpose |
|----------|-----------|---------|
| `GET /api/orders/:id/refund` | Admin order / client finance | Refund status |
| `POST /api/orders/:id/refund/payouts` | Admin finance | Record payout (date, mode, amount, id) |

### Ledger / payments

| Function | Who calls | Purpose |
|----------|-----------|---------|
| Existing ledger / payments / receivables | Admin | View history; ensure create/update writes **audit** |

### Customer profile

| Function | Who calls | Purpose |
|----------|-----------|---------|
| `GET/PATCH /api/me/profile` (or existing me + update) | Web, mobile | Customer edits → set `PENDING_REVIEW` + freeze orders |

---

## 11. Audit (must log)

Every one of these creates an audit / activity trail entry:

- OTP verify success/fail (security log; no OTP codes stored in plain audit text)
- Admin / employee create client  
- Approve / reject (with reason)  
- On-demand GST verify (who clicked, GSTIN, result, timestamp)  
- Tier change / credit limit change  
- Account action change  
- Payment recorded  
- Refund payout recorded  
- Customer profile resubmit  
- Walk-in order placed for pending customer  

---

## 12. Phased delivery (suggested)

| Phase | Delivers |
|-------|----------|
| **A** | OTP auth (mobile + optional email); identity rules |
| **B** | Admin clients list / add / detail edit + approval + account actions + **Verify GST** button |
| **C** | Employee walk-in create (phone + OTP) + live on-behalf order while pending Admin setup |
| **D** | Pricing tiers page + assign on client + checkout discount + credit limit block |
| **E** | Profile edit → pending / reject → resubmit loop |
| **F** | Cancel → refund payout UI + ledger + audit |
| **G** | Table UX polish + payment history presentation |

---

## 13. Acceptance checklist (client sign-off)

- [ ] Customer can be created three ways: **self-signup**, **Admin panel**, **Employee staff login**  
- [ ] **Mobile OTP** required; success marks mobile **verified**  
- [ ] **Email optional**; if entered, **email OTP** runs and marks email **verified** (provider TBD)  
- [ ] Admin can **Add**, **Edit** (prefilled), and **list** clients; detail is full-width  
- [ ] Admin update requires **Notes**; **Change history** shows note, admin, time, field labels  
- [ ] Admin can Approve / Reject; rejected customer can **edit and resubmit**  
- [ ] Address verified on Approve; later address change → unverified until Admin verifies  
- [ ] Mobile/email change → re-verify; verified GST/PAN locked  
- [ ] Admin can click **Verify GST** on client review (on demand; result stored; not auto on signup)  
- [ ] Employee can create customer with **phone + OTP**; account goes to Admin for setup  
- [ ] Employee can place a **walk-in live order** for that customer (GSTIN optional)  
- [ ] After OTP, customer can log in and complete registration form  
- [ ] Customer profile edit returns account to **pending**; **self-serve cannot order** until approved again  
- [ ] Admin edit does **not** force re-approval  
- [ ] Tiers A–F editable; **D** is base; assigned tier applies **% discount** at checkout  
- [ ] Credit **limit** blocks over-limit checkout; no credit period required  
- [ ] Blocked / credit-suspended / closed behave as in the table above  
- [ ] Cancelled order can record a **refund payout** with id; ledger + audit updated  
- [ ] Live / Non-live stock order view is **not** part of this plan  

---

## 14. Open choices (defaults we will use unless you object)

| Topic | Default in this plan |
|-------|----------------------|
| Discount base | % off product subtotal **before GST** |
| Over credit limit | **Block** checkout |
| After customer profile edit | Self-serve orders **frozen** until approve |
| Walk-in pending customer | Staff **can** place on-behalf live order |
| Suspended | **Credit suspended** (can log in; ordering without credit) |
| Closed | Soft-close (keep history; no hard delete) |
| OTP after verify | Issue normal app session (password optional later) |
| Email entered but not OTP-verified yet | **v1:** allow continue; verify later from profile |
| Email OTP provider | Choose before Phase A email work ships |
| GST verify | Admin button only (not signup / not automatic) |

---

## 15. Sign-off

| Role | Name | Date | Agreed |
|------|------|------|--------|
| Client | | | ☐ |
| DrishX product / tech lead | | | ☐ |

Comments:
