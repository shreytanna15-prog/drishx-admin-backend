# Stock management & procurement

Admin **stock** + **purchase order** plan — catalog product at the center, power-wise stock, controlled quantity changes.

Product master (attributes + `LensProduct` + matrix shell): see [`../product-catalog/`](../product-catalog/).  
Raw client feedback notes: [`../stock-management-notes.md`](../stock-management-notes.md).  
Earlier PO task tracker: [`../remaining-work.md`](../remaining-work.md) → RW-08 (superseded for *identity* by this plan; keep PO *rules*).

| Document | Audience | Purpose |
|----------|----------|---------|
| [CLIENT-PLAN.md](./CLIENT-PLAN.md) | Client + product | Stock + PO experience: modules, UI, flows, rules, acceptance |
| [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md) | Client + product | Agreed points for **Orders / Returns / Finance** — after stock |
| [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) | Engineers | What exists today, what to build/change, schema, APIs, phases |

**Spine:** `LensProduct` (catalog) → power stock (SPH×CYL cell) → qty only via **audited events** (receipt, adjustment/stock check, reserve/release, pack deduct, return/reversal). No free-edit quantity.
