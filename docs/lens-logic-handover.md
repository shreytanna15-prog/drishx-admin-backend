# DrishX — Lens Core Logic (Handover Notes)

**Document type:** Business logic guide from original developer, validated against codebase  
**Audience:** Engineers onboarding to lens/catalog features  
**Scope:** Single Vision (SV), Kryptok (KT), Progressive (PG V2) — power rules, shapes, cross, axis, ADD  
**Last updated:** August 2026

For technical implementation details (API files, search, wholesale matrices), see [`lens-domain-logic.md`](./lens-domain-logic.md). For platform overview, see [`intro.md`](./intro.md).

---

## 1. The three main product families

| Shorthand | Full name | DB table | Enum |
|-----------|-----------|----------|------|
| **SV** | Single Vision | `SingleVisionLens` | `SINGLE_VISION` |
| **KT** | Kryptok | `KryptokLens` | `KRYPTOK` |
| **PG V2** | Progressive | `ProgressiveLens` | `PROGRESSIVE` |

All three use **SPH** and **CYL** as the main prescription axes. KT and PG V2 add **ADD** and **AXIS**. SV does **not** use ADD or AXIS on catalog rows.

The database also has `ORI_VISION`, `MAGNUS`, and `BIFOCAL` tables — these are secondary and not part of the main shop trio above.

---

## 2. How to read power notation: `-6 / -2`

Industry shorthand on wholesale price sheets:

| Notation | Meaning |
|----------|---------|
| `-6 / -2` | SPH = **−6.00**, CYL = **−2.00** |
| `+2 / +1` | SPH = **+2.00**, CYL = **+1.00** |
| SPH only | CYL is null or zero — an “only SPH” lens |
| CYL only | SPH is null or zero — an “only CYL” lens |

**Step size everywhere:** **0.25 diopters** (one “step” in wholesale terminology).

---

## 3. Database fields for power

Each catalog row stores **range endpoints**, not every individual power value.

| DB column | Role | Example for `-6/-2` band |
|-----------|------|---------------------------|
| `sph` | **End** of SPH range (the number printed on the price sheet) | `-6.00` |
| `sphStartRange` | **Start** of SPH range | `0.00` (or an explicit value in DB) |
| `cyl` | **End** of CYL range | `-2.00` |
| `cylStartRange` | **Start** of CYL range | `0.00` if CYL is a range; or fixed equal to `cyl` |

**How selectable powers are built in code** (`app/lib/lens-power-range.ts`):

- If `sphStartRange` is missing → start defaults to **0**
- Values are generated from start → end in **0.25** steps  
  Example: start `0`, end `-6` → `0, -0.25, -0.50, …, -6.00`

When admin creates Single Vision rows via the panel, **`sphStartRange` is required** whenever `sph` is set (`app/lib/admin-create-lens.ts`).

**The starting value of the power range is always stored in the database** — either in `sphStartRange` / `cylStartRange`, or implied as 0 when null.

---

## 4. Multiple ranges for the same product

### Example: ASH GREEN (Single Vision)

Real product from seeds: **ASH · GREEN · 1.60**.

Same product line can have multiple **compound bands** as separate DB rows:

| Row label | `sph` (end) | `cyl` | Intended SPH selectable range |
|-----------|-------------|-------|------------------------------|
| `-6/-2` | -6.00 | -2.00 | **0 → -6.00** (step 0.25) |
| `-8/-2` | -8.00 | -2.00 | **-6.25 → -8.00** (step 0.25) |
| `-6/-4` | -6.00 | -4.00 | Separate CYL band |
| `-8/-4` | -8.00 | -4.00 | Deeper SPH band for -4 CYL |

### Chained bands rule

When the same lens product has a deeper range (already have `-6/-2`, add `-8/-2`):

1. **First band:** SPH **0 → -6**
2. **Second band:** SPH **-6.25 → -8** (starts one step below the previous band’s end)

The second band is stored as:

```
sph           = -8.00
sphStartRange = -6.25
cyl           = -2.00
cylStartRange = (as needed)
```

Each band is a **separate DB row** with its own price. The UI selects the row whose range contains the customer’s chosen power.

**Note:** Some older seed scripts only set `sph` and `cyl` without `sphStartRange`. Code then assumes start = 0. Production catalog data should set `sphStartRange` explicitly for chained bands.

Seed reference: `prisma/seed-single-vision-blue-cut-ash.ts`, `prisma/seed.ts` (ASH NORMAL BLUE CUT rows).

---

## 5. Plano, SPH-only, CYL-only, Compound

| Type | Description | In DB / code |
|------|-------------|--------------|
| **Plano** | No prescription power | `sph` and `cyl` are null (or effectively zero) |
| **SPH only** | Sphere power only | Non-zero `sph`, no meaningful `cyl` |
| **CYL only** | Cylinder power only | Non-zero `cyl`, no meaningful `sph` |
| **Compound** | Both SPH and CYL | Both axes have non-zero power |

Code uses filter labels: `sph` | `cyl` | `compound` (`app/lib/lens-power-shape-filter.ts`).

### Compound extra rules

1. **No plano on compound rows:** If the catalog row is compound, **0.00 cannot be selected** on either SPH or CYL when ordering (`applyCompoundNoPlano` in `lens-power-range.ts`).

2. **Wholesale compound sign rule** — this combination is **not allowed**:

| SPH | CYL | Allowed? |
|-----|-----|----------|
| + | + | Yes |
| − | − | Yes |
| + | − | Yes |
| **−** | **+** | **No** |

(`isAllowedCompoundCombo` in `app/lib/wholesale-powers.ts`)

---

## 6. AXIS (KT and PG V2 only — not SV)

Original developer note: axis values include **35, 45, 90, 180**.

**Canonical values in codebase and seeds:**

| Axis | Industry name (schema comments) |
|------|----------------------------------|
| **90** | ST.AXIS (Straight Axis) |
| **180** | REV AXIS (Reverse Axis) |
| **45 / 135** | SPL AXIS (Special / Oblique) |
| **−45 / −135** | SPL AXIS for negative-CYL compound rows (Kryptok seeds) |

Axis is part of the **SKU identity** for Kryptok — stock matching includes `axis`. It identifies which **stock variant** of the bifocal line is being ordered, not a free 1–180° Rx axis like custom lab orders.

**35** appears in handover notes but is not in schema comments or main seed files. Treat **45, 90, 135, 180** as canonical unless live DB data shows otherwise.

Single Vision catalog rows **do not** have an `axis` field.

---

## 7. ADD — KT and PG V2 only

Original developer note: **ADD power from +1 to +3**, in 0.25 steps.

**Optical meaning:** Reading/near addition for bifocal (KT) or progressive (PG V2) lenses.

| Lens type | ADD on catalog row? |
|-----------|---------------------|
| Single Vision | **No** |
| Kryptok | **Yes — required** |
| Progressive | **Yes — required** |

**Values in seeds (not strictly limited to +1…+3):**

| ADD value | Typical use |
|-----------|-------------|
| `+1.00` | Very common for Kryptok (`DEFAULT_ADD` in several seed files) |
| `+4.00` | Some bifocal / PLANO-style lines |
| `0.00` | Some progressive seed rows |

ADD is part of the **SKU** — same SPH/CYL with different ADD values are different product rows.

Single Vision does **not** have ADD or AXIS on catalog rows.

---

## 8. Cross power (special lens type)

Original developer rule:

- SPH is **always positive**
- SPH is **always at least 0.25 less than CYL** — with CYL negative, this means: **|CYL| − SPH ≥ 0.25**

### Example

If max CYL is **−2.00**:

- **CYL choices:** −0.25, −0.50, …, −2.00
- If user picks CYL **−2.00**, **SPH choices:** +0.25, +0.50, …, **+1.75**  
  (because +1.75 + 0.25 = 2.00 = |CYL|)

### In the database

| Pattern | Meaning |
|---------|---------|
| `crossPower = -2.00` | Cross −2 product line |
| `sph: null, cyl: null` | Cross row with power defined only via `crossPower` |

**Examples in seeds:**

- ASH GREEN SV: `crossRow("-2.00")` in `prisma/seed-single-vision-blue-cut-ash.ts`
- Kryptok wholesale item often labeled **"CROSS"**

**Cross is not the same as compound:** cross always uses **+SPH** and **−CYL** with the minimum 0.25D gap rule.

Code: `app/lib/cross-product.ts`, `app/lib/cross-power.ts`.

---

## 9. Progressive V2 — eye selection

Original developer note: user can select **left eye, right eye, or both**.

| Level | Behavior |
|-------|----------|
| **Catalog** | Each row has `eye`: `LEFT` or `RIGHT` — separate SKUs per eye |
| **Ordering** | Customer chooses one eye or both; “both” may create two order lines or duplicate power on both eyes |

Kryptok and Single Vision catalog rows **do not** have an `eye` field.

Progressive rows also include `index`, `type` (HC / HMC / SHMC), and `coating` as product attributes.

### Auto AXIS on progressive

If `axis` is not stored, code derives it from SPH/CYL signs (`app/lib/progressive-axis.ts`):

| SPH | CYL | Auto axis |
|-----|-----|-----------|
| (none) | +CYL | 180 |
| (none) | −CYL | 90 |
| both + | | 180 |
| both − | | 90 |

---

## 10. Master comparison table

| Feature | Single Vision (SV) | Kryptok (KT) | Progressive (PG V2) |
|---------|-------------------|--------------|---------------------|
| SPH / CYL | Yes | Yes | Yes |
| Range fields (`*StartRange`) | Yes | Yes | Yes |
| Plano / SPH-only / CYL-only / Compound | Yes | Yes | Yes |
| Cross power products | Yes | Yes | Not a dedicated wholesale profile |
| **AXIS** | No | **Yes** | **Yes** |
| **ADD** | No | **Yes** | **Yes** |
| **Eye (L/R)** | No | No | **Yes** (per catalog row) |
| Product attrs | index + coating | category + coating | index + type + coating |

---

## 11. Product identity — what groups rows as “same product”

Multiple power rows belong to one product for range and sibling lookup:

| Type | Same product = same values of |
|------|------------------------------|
| SV | `category` + `brand` + `item` + `index` + `coating` |
| KT | `category` + `brand` + `coating` |
| PG V2 | `category` + `brand` + `item` + `index` + `type` + `coating` |

Different power bands (e.g. `-6/-2` vs `-8/-2`) = **different DB rows**, same product group.

Code: `app/lib/related-lenses.ts` (`findSingleVisionSiblings`, `findKryptokSiblings`, `findProgressiveSiblings`).

---

## 12. Retail shop logic flow

```
1. User picks product          (e.g. ASH GREEN SV)
2. System resolves power band  (row whose range matches search/selection)
3. API returns selectableRange { sph: [...], cyl: [...] }
4. User picks exact SPH/CYL from those lists
5. KT/PG: user also selects ADD + AXIS from available SKUs
6. PG: user picks eye; may require LEFT and RIGHT rows for both eyes
7. Cart stores chosen prescription fields
8. Order links to one catalog row via lensId
```

---

## 13. Handover notes vs codebase — clarifications

| Handover note | Code / data reality |
|---------------|---------------------|
| Three types: SV, KT, PG V2 | Matches main shop; 3 additional types exist in DB |
| SPH 0 → -6 for `-6/-2` | Correct when `sphStartRange = 0` or null (defaults to 0) |
| `-8/-2` starts at -6.25 | Correct when `sphStartRange = -6.25` is stored on that row |
| Plano = null SPH and CYL | Also represented as zero; “only sph/cyl” = one axis set |
| Axis: 35, 45, 90, 180 | Code/seeds use **45, 90, 135, 180** (+ −45/−135 for SPL) |
| ADD: +1 to +3 | Common range; seeds also use **+4.00** and **0.00** |
| Cross: SPH positive, 0.25 less than CYL | Means **\|CYL\| − SPH ≥ 0.25** with CYL negative |
| PG: left / right / both eye | Catalog = LEFT/RIGHT per row; “both” handled at order time |

---

## 14. Key source files

| Topic | Path |
|-------|------|
| Range generation (0.25 steps) | `app/lib/lens-power-range.ts` |
| Cross power rules | `app/lib/cross-product.ts`, `app/lib/cross-power.ts` |
| Compound sign validation | `app/lib/wholesale-powers.ts` |
| Power shape filters | `app/lib/lens-power-shape-filter.ts` |
| Progressive axis auto-fill | `app/lib/progressive-axis.ts` |
| Admin create validation | `app/lib/admin-create-lens.ts` |
| Schema | `prisma/schema.prisma` |
| ASH GREEN seed example | `prisma/seed-single-vision-blue-cut-ash.ts` |
| KT ADD / axis seed examples | `prisma/seed-kryptok-pg-products.ts`, `prisma/seed-kryptok-compound-spl-products.ts` |

---

## 15. One-page summary

1. **Price sheet row** → one DB record with power **start** and **end**, not every 0.25 step.  
2. **`-6/-2` notation** → end points; **start** lives in `sphStartRange` / `cylStartRange`.  
3. **Chained bands** (`-6/-2` then `-8/-2`) → second row starts SPH at **-6.25**.  
4. **Plano / SPH-only / CYL-only / Compound** → how many axes carry power.  
5. **Cross** → special +SPH / −CYL with minimum **0.25D** gap (`|CYL| − SPH ≥ 0.25`).  
6. **KT and PG** → require **ADD + AXIS**; **PG only** → **LEFT/RIGHT eye** per catalog row.  
7. **SV** → SPH/CYL only; no ADD or AXIS on catalog.

---

## Related docs

- [`lens-domain-logic.md`](./lens-domain-logic.md) — full technical domain guide (API, wholesale, RX, returns)
- [`intro.md`](./intro.md) — three-repo platform overview
- [`DrishX_Operations_Role_Capability_Specification.md`](./DrishX_Operations_Role_Capability_Specification.md) — complete ops spec
