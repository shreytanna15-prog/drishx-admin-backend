# Product catalog (SKU master)

Admin **Attributes** + **Product catalog** — parent attribute combinations with **power-range variants**, auto SKU + auto name, list/grid and **parent family-aware power matrix**.

**Status (Nov 2026):** Phases A–C shipped (Oct flat `LensProduct` baseline). **Target contract:**

- **[RC-03](../requested-changes.md#rc-03--product-catalog-optional-material--power-range-as-attribute)** — Material optional; power range as attribute  
- **[RC-04](../requested-changes.md#rc-04--product-catalog-parent--variants-new-skuname-builders)** — parent + variants; new SKU/name builders; flat + grouped list  

Track further catalog RCs in [`../requested-changes.md`](../requested-changes.md); keep CLIENT-PLAN in sync when locked.

Hierarchy: [`../product-catalog-hierarchy/`](../product-catalog-hierarchy/). Product identity = Material? · Base · Index · Family · Coating · Color (+ power range on the **variant**). Coating-specific parents can reuse the same power range without sharing stock.

| Document | Audience | Purpose |
|----------|----------|---------|
| [CLIENT-PLAN.md](./CLIENT-PLAN.md) | Client + product | Screens, flows, what admin does, acceptance |
| [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) | Engineers | Schema, APIs, UI routes, phases, checklists |

**Related:** [RW-09](../remaining-work.md#rw-09--products--catalog-admin-product-master--ranges--powers); deltas in [requested-changes.md](../requested-changes.md).  
**Next (stock + PO):** [`../stock-management/`](../stock-management/) — same parent matrix view; live qty on optical cell leaves.

**SKU / name (locked target):** both auto-built on the variant — compact SKU codes; human name with `-6.00/+2.00`. Admin does not type either.

**Out of slice:** live stock cells, PO/receive, shop/mobile rewrite, deleting legacy lens tables.
