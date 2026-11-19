# Stock management & procurement

Admin **stock** + **purchase order** plan — catalog **parent** at the center, live family matrix, stock on the **deepest leaf** (`variant` + exact SPH + CYL).

Product master (attributes + `LensProduct` + `LensProductVariant` + matrix shell): see [`../product-catalog/`](../product-catalog/).  
Raw client feedback notes: [`../stock-management-notes.md`](../stock-management-notes.md).  
Earlier PO task tracker: [`../remaining-work.md`](../remaining-work.md) → RW-08 (superseded for *identity* by this plan; keep PO *rules*).

| Document | Audience | Purpose |
|----------|----------|---------|
| [CLIENT-PLAN.md](./CLIENT-PLAN.md) | Client + product | Stock + PO experience: modules, UI, flows, rules, acceptance (**handoff for approval**) |
| [CLIENT-FOLLOW-ONS.md](./CLIENT-FOLLOW-ONS.md) | Client + product | Agreed points for **Orders / Returns / Finance** — after stock |
| [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) | Engineers | What exists today, what to build/change, schema, APIs, phases |

**Spine:** `LensProduct` (parent) → `LensProductVariant` (SKU / range / axis? / ADD? / eye?) → stock leaf `(variantId, sph, cyl)` → qty only via **audited events** (receipt, adjustment/stock check, reserve/release, pack deduct, return/reversal). No free-edit quantity.
