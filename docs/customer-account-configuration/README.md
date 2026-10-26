# Customer account configuration

Development plan for **customer onboarding / account configuration** (from Oct 2026 client meeting notes).

| Document | Audience | Purpose |
|----------|----------|---------|
| [CLIENT-PLAN.md](./CLIENT-PLAN.md) | Client + product | UI, flows, data shapes, APIs (what/why), acceptance |
| [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) | Engineers | How to implement (schema, routes, phases, checklists) |

**Related:** remaining client cutover work is tracked as **[RW-12](../remaining-work.md#rw-12--customer-account-configuration-otp-clients--rejectresubmit--path-c-web--mobile)** in [`../remaining-work.md`](../remaining-work.md). This folder is the product/eng contract for the slice — not the full historical “CUSTOMER ONBOARDING” wishlist.

**Create paths:** A self-signup · B Admin panel · C Employee staff login.  
**Providers:** mobile OTP = **2factor**; email OTP = **TBD** (full optional verify → `emailVerifiedAt`); GST = **GSTIN.cloud** (Admin button only).  
**Deferred:** Live / Non-live stock order views → separate module.
