# Product catalog hierarchy

Target model for the **new power-wise product catalog** (core module). Derived from:

- Live legacy lens tables (audit **24 Oct 2026**)
- Wholesale cards + matcher code (`*-wholesale-catalog.ts`)
- Existing docs (`lens-domain-logic.md`, `lens-catalog-from-production.md`, `remaining-work.md` RW-09)
- Industry / India wholesale naming (HC, UC, HMC, BRC, ARC, PG, Poly, indexes)

| Document | Purpose |
|----------|---------|
| [CLIENT-HIERARCHY-CONFIRMATION.md](./CLIENT-HIERARCHY-CONFIRMATION.md) | **Client-facing** — hierarchy + how products are added (plain language) |
| [ATTRIBUTE-TABLES-AND-HIERARCHY.md](./ATTRIBUTE-TABLES-AND-HIERARCHY.md) | Full technical tables, live audit notes, legacy mapping |
| [../product-catalog/](../product-catalog/) | **Implementation plan** — Attributes + catalog create/list/grid + matrix UI (client + developer) |

**Re-run analysis**

```bash
npm run analyze:catalog-hierarchy   # hierarchy JSON
npm run audit:catalog               # full catalog audit JSON
```

Output (gitignored): `scripts/catalog-audit-output/hierarchy-*.json`

**Related:** legacy lens module = `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` + `/api/lenses*`. New catalog must keep leaves mapped to those rows (or a successor SKU id) so orders/stock keep working.
