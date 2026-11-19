# Product catalog (SKU master)

Admin **Attributes** + **Product catalog** — parent attribute combinations with **power-range variants**, auto SKU + auto name, **Flat** + **Grid** list views, and **parent family-aware power matrix**.

**Status (Nov 2026):** Catalog create / list / matrix **shipped**. Flat SKU tree + Grid parent browse cards shipped. Remaining: future attribute lock when parent-attribute edit exists — [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) §11.

Hierarchy: [`../product-catalog-hierarchy/`](../product-catalog-hierarchy/).  
**Parent identity** = Family · Base · Material? · Index? · Coating? · Color? · Diameter? · Progressive type?  
**Variant** = parent × power range × axis? × ADD? × eye?  
Coating is an optional parent attribute like Color / Material / Index — included in uniqueness, SKU, and name when set.

| Document | Audience | Purpose |
|----------|----------|---------|
| [CLIENT-PLAN.md](./CLIENT-PLAN.md) | Client + product | Screens, flows, what admin does, acceptance |
| [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) | Engineers | Schema, APIs, UI routes/styles, gaps, handoff checklist |

**Next (stock + PO):** [`../stock-management/`](../stock-management/) — **this catalog is the source of truth**; stock reuses the same parent matrix (live Current / Threshold / Target; invalid cross power cells disabled); quantity lives on **variant + SPH + CYL**.

**SKU / name (locked):** both auto-built on the variant. Admin does not type either.

**Out of slice:** saving live stock on cells, PO / receive, shop / mobile rewrite, removing older lens lists, redesigning older separate stock grids.
