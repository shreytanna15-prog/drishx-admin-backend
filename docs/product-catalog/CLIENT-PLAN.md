# Product catalog — Client plan

**Document type:** Product catalog / SKU master plan  
**Repos:** Admin panel (primary). Shared backend APIs.  
**Hierarchy reference:** [CLIENT-HIERARCHY-CONFIRMATION.md](../product-catalog-hierarchy/CLIENT-HIERARCHY-CONFIRMATION.md) (approved)  
**Status:** Oct baseline **shipped**. **[RC-03](../requested-changes.md#rc-03--product-catalog-optional-material--power-range-as-attribute)** + **[RC-04](../requested-changes.md#rc-04--product-catalog-parent--variants-new-skuname-builders)** **shipped** (power-range masters; Material optional; parent + variants; auto SKU/name; flat + expandable grouped list). More catalog RCs may follow in [`../requested-changes.md`](../requested-changes.md).

---

## 1. Goal

Give Admin a clear way to:

1. Maintain **attribute lists** (Family, Base, Material, Index, Color, **Power range**; Coating master may remain but is **not** product identity) — add, rename, active / inactive.  
2. **Create a product parent** once by selecting attributes (Material **optional**), then attach **one or more power-range attributes** as **variants** — without re-picking the same attrs for each range.  
3. Browse catalog in **flat** (per variant) and **grouped** (by parent / group-by) views, plus grid where useful.  
4. Open each **variant** and see an **Excel-style power matrix** (SPH × CYL) from that variant’s range.

**SKU** and **name** are both **auto-built** (Admin does not type them). SKU is a compact machine code; name is human-readable for procurement / stock (no supplier brand fluff).

Each variant is a fully separate sellable line (own SKU, name, price, matrix; future stock/PO/orders hang on the variant).

---

## 2. In scope / out of scope

### In scope

- **Attributes** admin — tabs for Family, Base, Material, Index, Color, Power range (+ Coating tab optional / not used on create identity)
- **Power range** add UX: select-based bounds (−40…+8 step rules), label like `-6.00/+2.00`
- **Parent + variant** model (one attribute combo → many power ranges)
- **Create product** — attrs once + **multi-select** power ranges; preview SKUs/names; save parent + N variants
- **Reuse parent** when attrs already exist → Add power range(s)
- **Catalog list** — flat + grouped views (server pagination / expand)
- Auto **SKU** + auto **name** builders (locked formats below)
- Product / variant detail + matrix (view-only cells `_ / _ / _` this phase)
- Dev cutover: **delete ~2 test products and recreate** (no migration)

### Out of scope (this phase)

- Saving stock numbers into every matrix cell / bulk leaf rows  
  *(See [stock-management CLIENT-PLAN](../stock-management/CLIENT-PLAN.md) — attach to **variant**.)*
- Brand / supplier fancy names (DECENTRX, Night Ryder, 75mm, …)
- Overlapping-range order allocation (which variant fills a shared power) — later orders/stock RC
- Customer website / mobile catalog rewrite
- Removing legacy `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` tables
- Full KT / V2 multi-dimension matrices beyond SPH×CYL first

---

## 3. How it works today vs after

| Before (Oct baseline) | Now (RC-03 + RC-04 shipped) |
|-------|--------|
| Flat product = attrs + typed range numbers + typed name | Parent = attrs; variants = power-range masters |
| Re-create whole product for a second range | Same parent → **Add power range** (multi-select on create) |
| SKU: `FAMILY-BASE-MATERIAL-…` | SKU: `[MATERIAL-]BASE-INDEX-FAMILY[-COLOR]-S…-C…` (no coating) |
| Name typed by Admin | Name **auto**: human words + `-6.00/+2.00` |
| Coating in SKU path | Coating **not** product identity; **Color** holds Green / Blue / … |

---

## 4. Concepts (plain language)

| Concept | Meaning |
|---------|---------|
| **Attribute** | Master value (HC, 1.56, Green, power range `-6.00/+2.00`, …). |
| **Power range (attribute)** | Reusable SPH/CYL bounds master. Label e.g. **`-6.00/+2.00`**. |
| **Product (parent)** | One attribute combination: Material? · Base · Index · Family · Color. Created once. Internal base code only (not shown). |
| **Variant** | Parent + one power range. **Sellable** catalog SKU: unique auto SKU + auto name + price + matrix. |
| **SKU code** | Compact machine id on the **variant** (not typed). |
| **Name** | Human label on the **variant** (not typed; no brand). |
| **Matrix** | SPH × CYL grid for that variant’s range; cells `_ / _ / _` for now. |

```
Attributes (masters)
  Family · Base · Material? · Index · Color
  + Power range masters (−6.00/+2.00, −6.00/+4.00, …)
        │
        ▼
┌─────────────────────────────────┐
│  PARENT (LensProduct)           │
│  Material? · Base · Index ·     │
│  Family · Color                 │
│  (internal base code only)      │
└────────────┬────────────────────┘
             │ 1 → many
             ▼
┌─────────────────────────────────┐
│  VARIANT (per power range)      │
│  skuCode  PG-BR-1P56-KT-GREEN-… │
│  name     PG 1.56 KT BR Green   │
│           -6.00/+2.00           │
│  price · active · matrix        │
└─────────────────────────────────┘
```

Example: parent `PG · BR · 1.56 · KT · Green` with ranges `-6.00/+2.00` and `-6.00/+4.00` → **two** variants, two SKUs, two names, separate stock/price later.

---

## 5. Attributes admin

### 5.1 Page

**Path:** `/inventory/attributes` (sidebar: **Attributes**)

| Tab | Examples | On create product? |
|-----|----------|--------------------|
| Family | SV, KT, V2 | Yes (all families in SKU) |
| Base | HC, BRC, ARC, BR, … | Yes |
| Material | Plain, UC, Tintable, Poly, PG, PG Poly | Optional |
| Index | 1.49, 1.56, 1.61, 1.67, 1.74 | Yes |
| Color | Green, Blue, Grey, Brown, Violet, … | Yes (identity; not “tint only”) |
| **Power range** | `-6.00/+2.00`, … | On **variant** (multi) |
| Coating | (optional master) | **Not** identity / SKU / name |

### 5.2 What Admin can do on each tab

- **Add** / **Edit** display name / short code  
- **Active / inactive** — inactive values do not appear in Create dropdowns  
- Optional sort order  

### 5.2a Power range tab

- List + add/edit via **selects** (not free number typing), mobile-style options.  
- Universe **−40 … +8**:
  | Band | Step |
  |------|------|
  | −40 → −16 | **0.5** |
  | after −16 toward +4 | **0.25** |
  | after **+4** → +8 | **0.5** |
- Store SPH min/max + CYL min/max. Label from SPH: **`-6.00/+2.00`**.  
- Once a range is used by a variant, **do not edit bounds** — create a new range instead.

### 5.3 Cascade

**Base** may narrow **Material** when Material is used. Material skip is allowed.

---

## 6. Products & catalog

### 6.1 Catalog page

**Path:** `/inventory/products-catalog`

| Feature | Detail |
|---------|--------|
| **Flat view** | One row per **variant** (SKU, name, attrs, range label, status) — server-paginated |
| **Grouped view** | Parents (or group-by family/base/…); expand loads variants |
| **Grid** | Optional card tiles (variant summary) |
| **Search / filters** | Server-side by SKU, name, family, base, material, active |
| **Create product** | Button → create form |

### 6.2 Create product

**Path:** `/inventory/products-catalog/new`

1. **Family** → **Base** → **Material** (optional) → **Index** → **Color**  
2. **Power ranges** — multi-select active power-range attributes (≥1)  
3. Optional default price (copied to new variants as starting price)  
4. **Preview** each variant’s auto SKU + auto name (read-only)  
5. **Save** → one parent + N variants  

If the attribute combo already exists → do not duplicate parent; go to that parent and add the new ranges.

```
┌──────────────────────────────────────────┐
│  Create product                          │
├──────────────────────────────────────────┤
│  Family [▼]  Base [▼]  Material [▼ opt]  │
│  Index [▼]   Color [▼]                   │
│  Power ranges [ multi ▼ ]                │
│    ☑ -6.00/+2.00   ☑ -6.00/+4.00         │
│  Preview:                                │
│    PG-BR-1P56-KT-GREEN-SM6TP2-…          │
│    PG 1.56 KT BR Green -6.00/+2.00       │
│    …                                     │
│  [ Cancel ]                    [ Save ]  │
└──────────────────────────────────────────┘
```

### 6.3 SKU format (variant — locked)

Compact codes; omit Material when absent; **all families** (SV, KT, V2, …); **no coating**:

`[MATERIAL-]BASE-INDEX-FAMILY[-COLOR]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}`

| Rule | Detail |
|------|--------|
| Codes | Uppercase; `.` → `P` (`1.56` → `1P56`); strip non-alphanumeric |
| Powers | Negatives → `M` (`-6` → `M6`); decimals use `P` |
| Source | Bounds from selected **power-range attribute** |
| Uniqueness | Variant `skuCode` unique; reject duplicate parent+range |

Example: `PG-BR-1P56-KT-GREEN-SM6TP2-C0TM2`

Parent may keep an **internal** base code without the power segment (not shown in Admin UI).

### 6.4 Name format (variant — locked)

Fully auto; human-readable; power as **`-6.00/+2.00`**; no brand:

`[Material] [Index] [Family] [Base] [Color] -6.00/+2.00`

Example: `PG 1.56 KT BR Green -6.00/+2.00`  

Omit Material token when Material is absent.

### 6.5 Parent detail + variant matrix

**Parent path:** `/inventory/products-catalog/[id]` (parent id)

- Attribute summary (Material? · Base · Index · Family · Color)  
- Variants table: range label, SKU, name, price, active  
- **Add power range(s)**  
- Lock attribute edit after any variant has stock/orders  

**Variant matrix:** open from a variant row → SPH × CYL from that range; `_ / _ / _` cells; view-only this phase.

| Rule | Detail |
|------|--------|
| Axes | SPH side, CYL top |
| Steps | From saved range (typically 0.25 inside mid band) |
| Behaviour | View only until stock phase |

---

## 7. End-to-end Admin flow

```
┌─────────────────────────┐
│  1. Attributes          │
│  Masters + power ranges │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  2. Create product      │
│  Attrs once             │
│  Multi-select ranges    │
│  Preview SKU + name     │
│  Save → parent + variants│
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  3. Catalog             │
│  Flat or Grouped        │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  4. Parent detail       │
│  Add more ranges        │
│  Open variant matrix    │
└─────────────────────────┘
```

---

## 8. Names — short and full

| Short | Full |
|-------|------|
| SV | Single Vision |
| KT | Kryptok |
| V2 | Progressive |
| HC | Hard Coat |
| BRC / BR | Blue Ray Cut / Blue Cut |
| ARC | Anti-Reflective Coating |
| UC | Uncoated |
| PG | Photochromic |
| Poly | Polycarbonate |

---

## 9. Example

**Parent attrs:** Material PG · Base BR · Index 1.56 · Family KT · Color Green  

**Ranges selected:** `-6.00/+2.00` and `-6.00/+4.00`

| Variant | SKU (shape) | Name |
|---------|-------------|------|
| 1 | `PG-BR-1P56-KT-GREEN-SM6TP2-…` | `PG 1.56 KT BR Green -6.00/+2.00` |
| 2 | `PG-BR-1P56-KT-GREEN-SM6TP4-…` | `PG 1.56 KT BR Green -6.00/+4.00` |

Two separate sellable products; Admin did not re-enter PG/BR/1.56/KT/Green for the second range.

---

## 10. Acceptance (client)

### Shipped (Oct baseline)

- [x] Attributes page: Family, Base, Material, Index, Coating, Color (add / edit / active)
- [x] Inactive attributes hidden on Create
- [x] Catalog list / grid + matrix `_ / _ / _`
- [x] Legacy stock / orders unchanged by Oct slice

### Shipped (RC-03 + RC-04)

- [x] Power range Attributes tab (selects; `-6.00/+2.00` label; −40…+8 steps)
- [x] Material optional; coating not product identity
- [x] Parent + multi power-range variants; Add range without re-picking attrs
- [x] Auto SKU + auto name (locked formats); no typed name
- [x] Flat + grouped catalog views (server pagination; expand parent → variants)
- [x] Test cutover: delete old flat products / recreate under parent + variants (schema migrate for parent/variant tables; no data-preservation migration of old SKU rows)

---

## 11. Open points (non-blocking)

1. Overlapping power ranges across variants — order/stock allocation later.  
2. KT / V2 multi-axis matrix after SPH×CYL.  
3. Live stock on matrix cells → stock-management (on **variant**).  
4. Whether Brand becomes a real attribute later (ignored for now).  
5. Further catalog RCs → [`requested-changes.md`](../requested-changes.md).
