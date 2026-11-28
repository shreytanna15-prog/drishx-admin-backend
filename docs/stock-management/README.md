# Stock management & procurement

Admin **stock** + **purchase order** plan — **Products & catalog parent** at the center, live family matrix, quantity on the **deepest cell** (variant + exact SPH + CYL).

Product master (attributes + parents + variants + matrix): see [`../product-catalog/`](../product-catalog/).  
Raw client feedback notes: [`../stock-management-notes.md`](../stock-management-notes.md).  
Earlier PO task tracker: [`../remaining-work.md`](../remaining-work.md) → RW-08 (keep PO *rules*; identity follows this plan).

| Document | Audience | Purpose |
|----------|----------|---------|
| [CLIENT-PLAN.md](./CLIENT-PLAN.md) | Client + product | Stock + PO experience: modules, UI, flows, rules, acceptance (**handoff for approval**) |
| [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md) | Client + product | Agreed points for **Orders / Returns / Finance** — after stock |
| [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) | Engineers | What exists today, what to build/change, schema, APIs, phases |
| [STOREFRONT-CATALOG-AND-NAV-SPLIT.md](./STOREFRONT-CATALOG-AND-NAV-SPLIT.md) | Engineers (handoff) | **Next build (admin + web + mobile):** sidebar split; **Storefront Catalog** (attribute filters + pin/exclude); Stock by Product rename; shop browse cutover |

**Doc process:** CLIENT-PLAN / DEVELOPER-GUIDE / FOLLOW-ONS stay the long-lived contracts but will be **revised slice-by-slice** as Storefront and later Stocks work land. **Implementers and AI: do not rewrite those originals in feature PRs** — follow the slice handoff doc; syncing the originals is the doc owner’s job.

**Nav / Storefront (locked Nov 2026 — see Storefront doc):**
- Admin nav splits into **Stocks** · **Procurement** · **Inventory**.
- **Storefront Catalog** (under Inventory): customer-facing cards = **hybrid attribute filters + pin/exclude**; no product create on Storefront; no legacy coating-tab CRUD. Products & catalog + Attributes remain SoT.
- Today’s matrix hub is labeled **Stock by Product** (ops stock — not merchandising).

**What we build on (locked — stock qty):**
1. **Stock by Product**: Catalog parent cards with live stock indicators → full **2D Excel power matrix** with **Current / Threshold / Target** (missing stock displays `0`).
2. **Admin Procurement Cart**: Collects power shortages across multiple products into an internal purchase cart, grouped by supplier into multi-product POs.
3. **How stock moves:** receipt, adjustment / stock check, reserve / release, pack deduct, return / reversal — always audited. No free-edit quantity.
