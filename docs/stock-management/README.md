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

**What we build on (locked):** the **new** Products & catalog — parent → variants → same family matrix → stock cell (this variant + this SPH + this CYL). Stock does **not** invent a second matrix; it makes the **same** catalog matrix show live **Current / Threshold / Target**, with invalid **cross power** cells disabled.

**How stock moves:** receipt, adjustment / stock check, reserve / release, pack deduct, return / reversal — always audited. No free-edit quantity.

**Out of scope for this phase:** redesigning older separate stock-grid screens; new work stays on the catalog parent matrix.
