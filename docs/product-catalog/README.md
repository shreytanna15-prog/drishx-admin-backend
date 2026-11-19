# Product catalog (SKU master)

Admin **Attributes** + **Product catalog** — parent attribute combinations with **power-range variants**, auto SKU + auto name, **Flat** + **Grid** list views, and **parent family-aware power matrix**.

**Status (Nov 2026):** Phases A–C + **RC-03** + **RC-04** + coating-as-optional-parent identity **shipped** in code baseline. This folder is the **locked product contract**. Remaining UI polish (Grid cards, coating on detail summaries, future attr lock) is tracked in [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) §11.

Hierarchy: [`../product-catalog-hierarchy/`](../product-catalog-hierarchy/).  
**Parent identity** = Family · Base · Material? · Index? · Coating? · Color? · Diameter? · Progressive type?  
**Variant** = parent × power range × axis? × ADD? × eye?  
Coating is an optional parent attribute like Color / Material / Index — included in uniqueness, SKU, and name when set.

| Document | Audience | Purpose |
|----------|----------|---------|
| [CLIENT-PLAN.md](./CLIENT-PLAN.md) | Client + product | Screens, flows, what admin does, acceptance |
| [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) | Engineers | Schema, APIs, UI routes/styles, gaps, handoff checklist |

**Related:** [RW-09](../remaining-work.md#rw-09--products--catalog-admin-product-master--ranges--powers); deltas in [requested-changes.md](../requested-changes.md) (RC-03, RC-04, RC-08 — coating **optional**, not mandatory).  
**Next (stock + PO):** [`../stock-management/`](../stock-management/) — same parent matrix view; live qty on leaves keyed by **variant + SPH + CYL**.

**SKU / name (locked):** both auto-built on the variant. Admin does not type either.

**Out of slice:** live stock cells, PO/receive, shop/mobile rewrite, deleting legacy lens tables.
