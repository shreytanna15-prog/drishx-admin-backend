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

**What we build on (locked):**
1. **Products & Catalog Parent as the Stock Hub**: The **Stock Overview** presents catalog product cards with live stock indicators. Clicking any card opens that product's full **2D Excel power matrix** with live **Current / Threshold / Target** on every cell (missing stock displays `0`).
2. **Admin Procurement Cart**: Collects power shortages across multiple products simultaneously into an internal purchase cart, grouped by supplier to generate combined, multi-product Purchase Orders.
3. **How stock moves:** receipt, adjustment / stock check, reserve / release, pack deduct, return / reversal — always audited. No free-edit quantity.
