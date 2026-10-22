# Customer account configuration — Developer guide

**Companion:** [CLIENT-PLAN.md](./CLIENT-PLAN.md) (product contract — do not contradict without updating both)  
**Repos:** `Drishx-admin-and-backend`, `drishx-website`, `drishx-mobile-app`

---

## 0. How to use this doc

1. Read **CLIENT-PLAN.md** for agreed behavior.  
2. Implement in **phases A→G** below.  
3. Prefer extending existing modules (`User`, approve API, ledger, payments, audit, on-behalf orders) over parallel systems.  
4. Follow `drishx-api-auth-audit` for routes/audit; follow `drishx-client-api` for new admin/web/mobile fetch hooks when touching UI.  
5. **Providers:** mobile OTP → **2factor** (locked); email OTP → **provider TBD** (full optional verify flow — see §4); GST active check → **GSTIN.cloud** (Admin button only — never on auth/signup auto).  
6. **Three create paths** (must stay distinct): Path A self-signup · Path B Admin `/clients/new` · Path C Employee walk-in (staff login).  
7. Do **not** build Live/Non-live stock order views in this slice (separate module).

---

## 1. Current code map (start here)

| Area | Path |
|------|------|
| User model | `prisma/schema.prisma` → `User`, `AccountApprovalStatus` |
| Signup | `app/api/auth/signup/route.ts` (email+password required today) |
| Approve / suspend | `app/api/users/[id]/approve/route.ts` |
| Customers list | `app/api/users/customers/route.ts`, `app/(admin)/clients/page.tsx` |
| Client detail | `app/(admin)/clients/[id]/page.tsx` |
| Credit warn-only | `app/lib/finance/credit-limit.ts` |
| Ledger posts | `app/lib/finance/customer-ledger.ts` |
| Payments | `app/lib/finance/payments.ts`, `Payment` model |
| Credit notes (returns) | returns decision + `CreditNote` |
| Web registration | `drishx-website` `app/signup`, `business-info`, `gst-details`, `registration-addresses`, `pending-approval` |
| Mobile registration | `drishx-mobile-app` `app/signup.tsx`, `business-info.tsx`, … |
| Audit | `app/lib/audit/*`, `docs/audit-and-logs-spec.md` |

---

## 2. Target architecture

```
Identity:
  mobile (required, unique) → OTP via 2factor → mobileVerifiedAt
  email (optional) → OTP via provider TBD → emailVerifiedAt
    ↓
Create path (one of three):
  A. Self-signup (web/mobile)     — customer fills form
  B. Admin panel /clients/new     — Admin fills + optional commercial
  C. Employee staff login         — phone+OTP + optional live order
    ↓
User.approvalStatus     → PENDING_REVIEW | APPROVED | REJECTED
User.accountAction      → NONE | BLOCKED | CREDIT_SUSPENDED | CLOSED
User.pricingTierId      → PricingTier (A–F, discountPercent)
User.creditLimit + creditAllowed
Admin: Verify GST button → GSTIN.cloud (on demand only)
    ↓
Self-serve checkout: Approved + tier discount + credit/blocked gates
Path C walk-in: on-behalf order allowed while PENDING_REVIEW
    ↓
Cancel order → OrderRefund Due → payouts → ledger + audit
```

**Repos ownership**

| Concern | Backend | Admin | Web | Mobile |
|---------|---------|-------|-----|--------|
| Mobile OTP (2factor) | ✓ | invite / walk-in | ✓ | ✓ |
| Email OTP (provider TBD) | ✓ | optional on create | ✓ | ✓ |
| Path A self-signup | ✓ | — | ✓ | ✓ |
| Path B Admin create `/clients/new` | ✓ | ✓ | — | — |
| Path C Employee walk-in + live order | ✓ | also allowed | employee | employee |
| GSTIN.cloud verify (button) | ✓ | ✓ | — | — |
| Pricing tiers CRUD | ✓ | ✓ | — | — |
| Assign tier / actions | ✓ | ✓ | — | — |
| Profile update → pending | ✓ | admin bypass | ✓ | ✓ |
| Checkout discount + credit block | ✓ | on-behalf | ✓ | ✓ |
| Refund payout | ✓ | ✓ | status view optional | optional |

---

## 3. Schema changes (Phase A/B/C)

### 3.1 Enums / models to add

```prisma
enum AccountAction {
  NONE
  BLOCKED
  CREDIT_SUSPENDED
  CLOSED
}

model PricingTier {
  id              String   @id @default(cuid())
  code            String   @unique  // A..F
  name            String?
  discountPercent Decimal  @default(0)
  isBase          Boolean  @default(false)
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
  users           User[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum OrderRefundStatus {
  DUE
  PARTIAL
  PAID
  CANCELLED
}

model OrderRefund {
  id           String            @id @default(cuid())
  orderId      String            @unique
  order        Order             @relation(...)
  customerId   String
  customer     User              @relation(...)
  amountDue    Decimal
  amountPaid   Decimal           @default(0)
  status       OrderRefundStatus @default(DUE)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  payouts      OrderRefundPayout[]
}

model OrderRefundPayout {
  id            String   @id @default(cuid())
  refundId      String
  refund        OrderRefund @relation(...)
  amount        Decimal
  mode          PaymentMode
  paidAt        DateTime
  reference     String?   // UTR / cheque / payment id
  notes         String?
  recordedById  String?
  createdAt     DateTime @default(now())
}
```

### 3.2 `User` field changes

| Field | Change |
|-------|--------|
| `mobileNumber` | **Required** for CUSTOMER; add `@@unique` (handle migration for nulls first) |
| `mobileVerifiedAt` | `DateTime?` — set only after successful mobile OTP |
| `email` | Keep unique; allow placeholder strategy for mobile-only users **or** make email optional nullable — pick one migration strategy and document in PR |
| `emailVerifiedAt` | `DateTime?` — set only after successful email OTP; stays null if email skipped or not yet verified |
| `accountAction` | `AccountAction @default(NONE)` |
| `pricingTierId` | FK nullable → default seed tier **D** on approve/create |
| `creditAllowed` | `Boolean @default(true)` |
| `createdByStaffId` | `String?` — set on Path B (Admin create) and Path C (Employee walk-in) |
| `gstinVerifyStatus` | optional enum/string: `UNKNOWN` \| `ACTIVE` \| `INACTIVE` \| `INVALID` \| `ERROR` |
| `gstinVerifiedAt` | `DateTime?` |
| `gstinVerifyRaw` | `Json?` — last provider payload (redact secrets); for Admin display |
| `gstinVerifiedById` | `String?` — Admin who clicked Verify |

**Migration caution:** Existing users have email as login. Plan:

1. Backfill `mobileNumber` where missing (manual/admin) before enforcing unique+required.  
2. Dual-login period: accept OTP mobile **or** existing email/password until cutover flag.  
3. Do not break admin/employee login (email/password stays for staff).

### 3.3 Seed pricing tiers

Seed A–F with `D.isBase = true`, `D.discountPercent = 0`. Other letters start at 0% until admin edits (or set example values in seed comments only).

---

## 4. OTP implementation (Phase A)

### 4.1 Providers

| Channel | Provider | Status |
|---------|----------|--------|
| Mobile SMS | [2factor](https://2factor.in/) | **Locked** |
| Email | Resend / SES / SendGrid / Postmark (pick one) | **TBD** — implement behind `OtpSender` so swap is one file |

```ts
// app/lib/otp/twofactor-sms.ts
export async function twoFactorSendOtp(mobile: string, purpose: string): Promise<{ sessionId?: string }>
export async function twoFactorVerifyOtp(mobile: string, code: string, sessionId?: string): Promise<boolean>

// app/lib/otp/email-otp.ts  (provider TBD — same interface)
export async function emailSendOtp(email: string, purpose: string): Promise<{ sessionId?: string }>
export async function emailVerifyOtp(email: string, code: string, sessionId?: string): Promise<boolean>
```

| Env | Purpose |
|-----|---------|
| `TWOFACTOR_API_KEY` | 2factor API key |
| `TWOFACTOR_TEMPLATE` / sender id | If required by account |
| `EMAIL_OTP_*` | Keys for chosen email provider (add when selected) |
| `OTP_DEV_MODE=1` | Skip live SMS/email; accept fixed code / log OTP in server logs only |

Keep a small `OtpSender` interface so tests can mock. Production mobile = 2factor only. Production email = whatever is chosen later.

### 4.2 Verified flags (all three create paths)

| Flag | Set when | Cleared when |
|------|----------|--------------|
| `mobileVerifiedAt` | Mobile OTP verify succeeds | Mobile number change (require re-verify) |
| `emailVerifiedAt` | Email OTP verify succeeds | Email change or email removed |

**Rules**

1. **Mobile required** — cannot finish Path A/B/C create without `mobileVerifiedAt`.  
2. **Email optional** — if skipped, leave `email` null and `emailVerifiedAt` null.  
3. **Email entered** — run full email OTP send → verify → set `emailVerifiedAt`.  
4. **v1 if email entered but not verified yet:** allow continue registration; user can verify later from profile (`purpose=VERIFY_EMAIL`). Do not treat unverified email as hard block for create.  
5. Same OTP + flag rules apply to Path A, B (customer first login / invite), and C.

### 4.3 OTP storage / session

Even if the provider holds the OTP, persist a local row for rate limits + audit:

- Table `OtpChallenge`: `id`, `channel` (MOBILE\|EMAIL), `destination`, `provider` (`TWOFACTOR` \| `EMAIL_<VENDOR>`), `providerSessionId`, `expiresAt`, `attempts`, `consumedAt`, `purpose` (`SIGNUP` \| `LOGIN` \| `VERIFY_EMAIL` \| `WALK_IN` \| `ADMIN_INVITE`), `createdByStaffId?`.  
- Never store raw OTP in DB/logs. Security events: `OTP_SENT`, `OTP_VERIFIED`, `OTP_FAILED`.  
- Rate limit send per destination (e.g. 1/min, 5/hour) **before** calling the provider.

### 4.4 API routes

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| POST | `/api/auth/otp/mobile/send` | `{ mobileNumber, purpose }` | Normalize IN mobile; rate-limit; 2factor send |
| POST | `/api/auth/otp/mobile/verify` | `{ mobileNumber, code, purpose, sessionId? }` | 2factor verify; set `mobileVerifiedAt`; SIGNUP/LOGIN/WALK_IN side effects |
| POST | `/api/auth/otp/email/send` | `{ email, purpose }` | Rate-limit; email provider send (TBD) |
| POST | `/api/auth/otp/email/verify` | `{ email, code, purpose, sessionId? }` | Provider verify; set `emailVerifiedAt` |

### 4.5 Path A — Self-signup rewrite

1. Mobile send/verify via 2factor → create `User` CUSTOMER `PENDING_REVIEW` + `mobileVerifiedAt`.  
2. Optional email → email OTP send/verify → `emailVerifiedAt` (or defer to profile).  
3. Wizard: business → GST (optional) → addresses → submit stays `PENDING_REVIEW`.  

**Staff login:** email+password unchanged (no mobile OTP for ADMIN/EMPLOYEE login).

### 4.6 Session

Reuse existing JWT + refresh. After OTP verify, same session issue helpers as password login.

---

## 5. Admin clients UI + APIs (Phase B)

### 5.1 Pages

| Route | File | Notes |
|-------|------|-------|
| `/clients` | `app/(admin)/clients/page.tsx` | Rebuild as data table: search, filters, badges |
| `/clients/new` | `app/(admin)/clients/new/page.tsx` | **New** form |
| `/clients/[id]` | `app/(admin)/clients/[id]/page.tsx` | Expand: edit form + commercial + actions |

Sidebar: already under Client & CRM → Clients. Add nav only if tiers live under Finance.

### 5.2 APIs

| Method | Path | Authz | Notes |
|--------|------|-------|-------|
| GET | `/api/users/customers` | Admin (or staff list permission) | Add `page`, `limit`, `q`, `approvalStatus`, `accountAction`, `tierCode`; stop load-all + memory filter when possible |
| POST | `/api/users/customers` | **Admin only** | **Path B** — full create form; require mobile; optional email; optional tier D + credit; default `PENDING_REVIEW`; set `createdByStaffId`; customer completes mobile OTP on invite / first login |
| POST | `/api/users/customers/walk-in` | **Employee or Admin** | **Path C** — after mobile OTP (`purpose=WALK_IN`); create minimal CUSTOMER `PENDING_REVIEW`; set `createdByStaffId`; **do not** set tier/credit (Admin setup later) |
| GET | `/api/users/customers/[id]` | Admin (employee: limited fields OK for picker) | Include tier, ledger summary, accountAction, GST verify fields |
| PATCH | `/api/users/customers/[id]` | Admin | Direct apply; **do not** flip to pending |
| POST | `/api/users/[id]/account-action` | Admin | `{ action: BLOCKED \| CREDIT_SUSPENDED \| CLOSED \| NONE }` |
| POST | `/api/users/[id]/verify-gst` | **Admin only** | On-demand GSTIN.cloud check — see §5.4 |
| Extend | `/api/users/[id]/approve` | Admin | Keep approve/reject/reopen; align suspend with `accountAction` |

**Recommendation:**  

- `CLOSED` → `isActive = false` + `accountAction = CLOSED`  
- `BLOCKED` / `CREDIT_SUSPENDED` → `isActive = true`, gate ordering in place-order  

### 5.3 Permissions

| Action | Admin | Employee |
|--------|-------|----------|
| List customers | ✓ | ✓ (picker / walk-in) |
| Full create `/clients/new` | ✓ | ✗ |
| Walk-in create (phone + OTP) | ✓ | ✓ |
| Place on-behalf order for pending walk-in | ✓ | ✓ |
| Change tier / credit / accountAction | ✓ | ✗ |
| Approve / reject | ✓ | ✗ |
| **Verify GST** button | ✓ | ✗ |

### 5.4 On-demand GST verify — **GSTIN.cloud** (Admin button only)

**Why on-demand:** Provider charges per check. Do **not** call GSTIN.cloud from signup, OTP, or automatic approve. Only when Admin clicks **Verify GST** on `/clients/[id]`.

```ts
// app/lib/gst/gstin-cloud.ts
export type GstinCloudResult = {
  gstin: string;
  status: 'ACTIVE' | 'INACTIVE' | 'INVALID' | 'ERROR';
  legalName?: string;
  tradeName?: string;
  state?: string;
  raw: unknown;
};

export async function verifyGstinCloud(gstin: string): Promise<GstinCloudResult>
```

| Env | Purpose |
|-----|---------|
| `GSTIN_CLOUD_API_KEY` | GSTIN.cloud API key |
| `GSTIN_CLOUD_BASE_URL` | If not default |

**API:** `POST /api/users/[id]/verify-gst`

1. Auth: Admin only.  
2. Read customer `gstNumber`; 400 if missing/invalid format.  
3. Call GSTIN.cloud once.  
4. Persist `gstinVerifyStatus`, `gstinVerifiedAt`, `gstinVerifiedById`, `gstinVerifyRaw` (sanitized).  
5. Optionally suggest fill `legalBusinessName` / `tradeName` from response (do not overwrite without Admin confirm — show as “Apply from GST?” in UI).  
6. Audit: `GSTIN_VERIFIED` with status + actor (no API keys).  
7. UI shows last check time + status badge; Approve still manual (verify is advisory unless product later requires ACTIVE).

**Cost guards:** no retries in a loop; debounce button; optional cooldown (e.g. 1 check / GSTIN / 24h unless Admin force).

### 5.5 Path B — Admin create (`/clients/new`)

1. Admin fills form (mobile required, email optional, business/GST/addresses, optional tier/credit).  
2. `POST /api/users/customers` → `PENDING_REVIEW` + `createdByStaffId`.  
3. Customer verifies mobile via OTP on invite / first login (`purpose=ADMIN_INVITE` or `LOGIN`); optional email OTP if email set.  
4. Admin finishes Approve + commercial + optional **Verify GST**.  

Do **not** treat Path B as Path C: Admin may set commercial fields on create; Employee Path C must not.

### 5.6 Path C — Employee walk-in create + live order

Flow:

1. Employee UI (staff login, **not** Admin panel): enter mobile → `otp/mobile/send` (`WALK_IN`) → verify → `mobileVerifiedAt`.  
2. Optional email + email OTP (same rules as §4.2).  
3. `POST /api/users/customers/walk-in` with verified mobile (+ optional shop/name).  
4. Immediately allow on-behalf place-order with `userId` = new customer.  
5. **Ordering gate exception:** if `createdByStaffId != null` AND order is placed by staff session, allow order while `PENDING_REVIEW`.  
6. Self-serve place-order for that user still requires `APPROVED` (normal gate).  
7. Customer later logs in via OTP → completes registration wizard → stays/returns `PENDING_REVIEW` until Admin commercial setup + approve.  
8. Remove / never use plaintext `defaultPassword123!` on staff-created users (known security debt in on-behalf path).

Reuse existing on-behalf cart/order APIs; only change the approval gate helper.

---

## 6. Pricing tiers (Phase D)

### 6.1 Admin page

- Path: `/finance/pricing-tiers`  
- Nav: Finance group → Pricing tiers  
- UI: 6 rows A–F; number input discount %; badge Base on D; save all  

### 6.2 APIs

```
GET  /api/admin/pricing-tiers
PUT  /api/admin/pricing-tiers   // body: [{ code, discountPercent }]
```

Admin only. Validate percent `0..100`. Prevent deleting D; allow editing D’s % (usually 0).

### 6.3 Apply at checkout

Centralize in pricing helper used by place-order / wholesale-checkout / cart totals:

```ts
function applyTierDiscount(subtotal: number, discountPercent: number): number {
  // round with existing roundMoney
  return subtotal * (1 - discountPercent / 100);
}
```

Call **before** GST calculation. Persist on order: `tierCode`, `tierDiscountPercent`, `tierDiscountAmount` (new order columns or metadata) for invoice reprint fidelity.

### 6.4 Credit limit enforcement

Replace warn-only path for **checkout**:

```ts
// before committing order
if (user.accountAction === 'BLOCKED' || user.accountAction === 'CLOSED') throw …
if (user.approvalStatus !== 'APPROVED') throw …
if (user.accountAction === 'CREDIT_SUSPENDED' || !user.creditAllowed) {
  // treat as limit 0 / require no receivable increase — product default: block any order that would create receivable without advance
}
if (creditLimit != null && outstanding + orderTotal > creditLimit) {
  throw friendly error — do not place order
}
```

Keep `checkCreditLimitWarning` for invoice edge cases if needed, but checkout must **hard fail**.

---

## 7. Profile edit → re-approval (Phase E)

### 7.1 Customer PATCH `/api/auth/me` or `/api/users/me/profile`

On successful customer self-update of profile fields:

1. Set `approvalStatus = PENDING_REVIEW`  
2. Clear `isApproved` / set false consistently with existing helpers  
3. Store `rejectionReason = null` on resubmit  
4. Audit: `CUSTOMER_PROFILE_RESUBMITTED`  
5. Ordering gates already check approval → frozen  

**Admin PATCH:** skip step 1–2.

### 7.2 Reject loop

On reject: set `REJECTED` + `rejectionReason`.  

Customer UI (web `pending-approval` + mobile equivalent): show reason + **Edit profile** CTA → profile screens → save → back to `PENDING_REVIEW`.  

Ensure rejected users **can authenticate** (OTP) enough to edit; do not treat REJECTED like CLOSED.

### 7.3 Which fields trigger re-approval?

v1 simple rule: **any** customer-initiated profile PATCH triggers pending.  
(Optional later: only GST/address/legal fields.)

---

## 8. Cancel → refund (Phase F)

### 8.1 When refund becomes DUE

On order cancel path (existing cancel APIs): if order had payment / receivable impact, create `OrderRefund` with `amountDue` = amount to return (define: full paid amount or outstanding credit — **default: amount customer overpaid / should receive back per cancel policy**).  

If cancel only releases unpaid order, `amountDue = 0` and skip refund entity.

### 8.2 Admin UI

- Order detail: Refund panel (due, paid, remaining, add payout form)  
- Optional: `/finance/refunds` table later  

### 8.3 Payout API

`POST /api/orders/[id]/refund/payouts`  

- Admin only  
- Body: amount, mode, paidAt, reference  
- Updates `amountPaid`, status PARTIAL/PAID  
- Posts ledger entry (`ADJUSTMENT` or `PAYMENT` credit — match `PartyLedgerEntryType`; prefer dedicated handling in `customer-ledger.ts`)  
- `recordAuditEvent`  

### 8.4 Interaction with returns credit notes

Do not double-refund. If return already issued credit note for same money, cancel-refund must no-op or link. Document guard in code.

---

## 9. Audit events to add

| Code / message | When |
|----------------|------|
| OTP send / verify / fail | Security log |
| Customer created (admin / employee walk-in) | Audit |
| Customer updated (admin vs self) | Audit |
| Approval decision | Existing — ensure reason |
| GSTIN verify (on-demand) | Audit — status + gstin + actor |
| Account action changed | Audit |
| Pricing tier % changed | Audit |
| Customer tier assigned | Audit |
| Credit limit changed | Audit |
| Walk-in order for pending customer | Audit / order activity |
| Refund payout | Audit |

Follow `docs/audit-and-logs-spec.md` and `event-codes.ts`.

---

## 10. Frontend implementation notes

### Admin

- Prefer shared form components for add/edit.  
- Use `adminFetch` only inside `app/lib/admin-*.ts` + hooks per `drishx-client-api`.  
- Tables: search + filter + status badges (Blocked / Suspended / Closed / Pending).

### Website / mobile

- Path A: mobile OTP (2factor) → optional email OTP (provider TBD) → existing wizard.  
- Path C (employee surfaces): Create walk-in customer + continue to on-behalf live order.  
- Pending/rejected: edit CTA.  
- Profile: “Verify email” when email set but `emailVerifiedAt` null.  
- Checkout: display discount line item; handle credit/blocked error codes from API.  
- Follow Expo v54 docs for mobile; Next docs for web.

### Admin client detail

- **Verify GST** button next to GSTIN; show last status/timestamp; disable while in-flight; show provider errors cleanly.

---

## 11. API error codes (stable for clients)

| Code | Meaning |
|------|---------|
| `OTP_INVALID` | Bad/expired code |
| `OTP_RATE_LIMITED` | Too many sends |
| `MOBILE_IN_USE` | Unique conflict |
| `ACCOUNT_PENDING` | Cannot order |
| `ACCOUNT_REJECTED` | Cannot order; can edit |
| `ACCOUNT_BLOCKED` | Cannot order |
| `ACCOUNT_CLOSED` | Cannot login |
| `CREDIT_LIMIT_EXCEEDED` | Checkout blocked |
| `CREDIT_SUSPENDED` | No credit path |
| `GSTIN_MISSING` | Verify clicked but no GSTIN |
| `GSTIN_PROVIDER_ERROR` | GSTIN.cloud failure |

Wire these into existing auth error parsing on web/mobile where applicable.

**Note:** `ACCOUNT_PENDING` applies to **self-serve** checkout. Staff on-behalf for Path C pending customers must **not** return this when the exception in §5.6 applies.

---

## 12. Test plan (minimum)

| Case | Expect |
|------|--------|
| Path A: mobile OTP signup via 2factor | User pending, `mobileVerifiedAt` set |
| Path A: email skipped | Allowed; `emailVerifiedAt` null |
| Path A: email + email OTP | `emailVerifiedAt` set |
| Path B: Admin create + approve | Self-serve can order after approve |
| Path C: Employee walk-in + OTP | Customer pending; `createdByStaffId` set |
| Path C: staff on-behalf order for that pending user | Succeeds (live walk-in) |
| Same pending user self-serve checkout | 403 ACCOUNT_PENDING |
| Reject → edit → resubmit | Pending again |
| Approved edit profile | Pending; self-serve order 403 |
| Admin edit profile | Stays approved |
| Verify GST button | Calls GSTIN.cloud once; stores status; audit |
| Signup/OTP does **not** call GSTIN.cloud | No provider hit |
| Tier 10% | Checkout subtotal discounted before tax |
| Credit limit breach | Place order fails |
| BLOCKED | Place order fails; login OK |
| CLOSED | Login fails / me fails |
| Cancel + payout | Ledger balance + audit row |
| Staff email login | Unaffected |
| No defaultPassword123 | Walk-in users cannot login with known plaintext |

Add unit tests next to existing `customer-registration.test.ts`, credit-limit tests, and API route tests where the repo already patterns them. Mock 2factor + email OTP sender + GSTIN.cloud in unit tests.

---

## 13. Implementation phases (PR breakdown)

| Phase | PR focus | Done when |
|-------|----------|-----------|
| **A** | 2factor mobile OTP + email OTP interface (provider TBD) + verified flags + Path A signup pivot + dual-login safety | Mobile OTP + optional email verify works staging |
| **B** | accountAction + Path B admin list/new/detail + **Verify GST** (GSTIN.cloud) | Admin CRUD + GST button |
| **C** | Path C walk-in create API + employee UI + on-behalf gate exception | Counter sale works pending Admin |
| **D** | PricingTier seed + page + checkout discount + hard credit check | Tier D default; discount visible |
| **E** | Profile PATCH → pending; reject resubmit UX web+mobile | Loop works |
| **F** | OrderRefund + payout UI + ledger | Cancel refund recorded |
| **G** | Table polish, payment history presentation, audit QA | Checklist green |

---

## 14. Explicit non-goals (do not build here)

- Live / Non-live stock view for orders (separate module)  
- Automatic GSTIN check on signup / OTP / every page load  
- Credit period / ageing terms per customer  
- LegalEntity / Branch tables  
- KYC file uploads for GST/PAN  
- TanStack Query migration (use existing fetch + `drishx-client-api` pattern)

---

## 15. Checklist before merge to main

- [ ] CLIENT-PLAN behavior unchanged or both docs updated  
- [ ] Migrations reversible / data backfill notes in PR  
- [ ] Staff auth not broken  
- [ ] Audit events present (including GST verify + walk-in create)  
- [ ] Path A web + mobile: mobile OTP (2factor) + optional email OTP smoke-tested (or DEV mode)  
- [ ] Path B Admin create + Path C Employee walk-in both set `createdByStaffId` correctly  
- [ ] `mobileVerifiedAt` / `emailVerifiedAt` only set after successful OTP  
- [ ] GSTIN.cloud only fires from Admin Verify button  
- [ ] Path C pending + staff order works; self-serve still gated  
- [ ] Checkout discount + credit block smoke-tested  
- [ ] No plaintext OTP in logs; no defaultPassword123 for new customers  
- [ ] Permissions: only Admin for tier/credit/account-action/approve/verify-gst  
