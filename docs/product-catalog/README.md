# Product catalog (SKU master)

Admin **Attributes** + **Product catalog** — define lens products from master attributes, list/grid them, and show a per-product power matrix (UI).

**Status (Oct 2026):** Phases A–C implemented in admin (`LensProduct` + attribute masters). See [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) §6.

Approved hierarchy (Family → Base → Material + Index / Coating / Color; range on the product): see [`../product-catalog-hierarchy/`](../product-catalog-hierarchy/).

| Document | Audience | Purpose |
|----------|----------|---------|
| [CLIENT-PLAN.md](./CLIENT-PLAN.md) | Client + product | Screens, flows, what admin does, acceptance |
| [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) | Engineers | Schema, APIs, UI routes, phases, checklists |

**Related:** tracked as **[RW-09](../remaining-work.md#rw-09--products--catalog-admin-product-master--ranges--powers)** in [`../remaining-work.md`](../remaining-work.md). Stock notes for later: [`../stock-management-notes.md`](../stock-management-notes.md).

**SKU rule (locked):** product `skuCode` is **auto-built** from attribute codes + power range — Admin does **not** type a free-text SKU.

**Out of this slice:** live stock on matrix cells, bulk insert of every 0.25 power into the DB, procurement PO/receive, shop/mobile checkout rewrite, deleting legacy lens tables.
