# Product catalog — Client plan

**Document type:** Product catalog / SKU master plan  
**Repos:** Admin panel (primary). Shared backend APIs.  
**Hierarchy reference:** [CLIENT-HIERARCHY-CONFIRMATION.md](../product-catalog-hierarchy/CLIENT-HIERARCHY-CONFIRMATION.md) (approved)  
**Status:** Oct baseline **shipped**. **[RC-03](../requested-changes.md#rc-03--product-catalog-optional-material--power-range-as-attribute)** + **[RC-04](../requested-changes.md#rc-04--product-catalog-parent--variants-new-skuname-builders)** **shipped** (power-range masters; Material optional; parent + variants; auto SKU/name; flat + expandable grouped list). Follow-up: **[RC-05](../requested-changes.md#rc-05--finish-photo-unwire-clients--null-material-parent-uniqueness)** (photo client cleanup + null-material parent uniqueness). More catalog RCs may follow in [`../requested-changes.md`](../requested-changes.md).

---

## 1. Goal

Give Admin a clear way to:

1. Maintain **attribute lists** (Family, Base, Material, Index, Color, **Power range**; Coating master may remain but is **not** product identity) — add, rename, active / inactive.  
2. **Create a product parent** once by selecting attributes (Material **optional**), then attach **one or more power-range attributes** as **variants** — without re-picking the same attrs for each range.  
3. Browse catalog in **flat** (per variant) and **grouped** (by parent / group-by) views, plus grid where useful.  
4. Open the **parent product** and see a **family-aware power matrix** composed from its variants (SV: SPH × CYL; KT/V2: Sphere / CYL+Axis / Compound / Cross with ADD or Eye×ADD columns).

**SKU** and **name** are both **auto-built** (Admin does not type them). SKU is a compact machine code; name is human-readable for procurement / stock (no supplier brand fluff).

Each variant is a fully separate sellable line (own SKU, name, price). The matrix is a **view** over sibling variants on the parent; future stock/PO leaves key off the same optical cell identity.

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
- Product parent detail + family-aware matrix (view-only cells `_ / _ / _` this phase)
- Variant detail (variant cards + product attributes + full family matrix + all variants on one page)
- Dev cutover: **delete ~2 test products and recreate** (no migration)

### Out of scope (this phase)

- Saving stock numbers into every matrix cell / bulk leaf rows  
  *(See [stock-management CLIENT-PLAN](../stock-management/CLIENT-PLAN.md) — same matrix view, live qty later.)*
- Brand / supplier fancy names (DECENTRX, Night Ryder, 75mm, …)
- Overlapping-range order allocation (which variant fills a shared power) — later orders/stock RC
- Customer website / mobile catalog rewrite
- Removing legacy `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` tables
- Editing Current / Threshold / Target on matrix cells

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
| **Variant** | Parent + one power range (+ axis/ADD/eye when family requires). **Sellable** catalog SKU: unique auto SKU, display name, price. |
| **SKU code** | Compact machine id on the **variant** (not typed). |
| **Name** | Human label on the **variant** (not typed; no brand). |
| **Matrix** | Parent-level family sheets over all variants; cells `_ / _ / _` (Current / Threshold / Target) until stock is live. |

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
│  price · active                 │
└─────────────────────────────────┘
```

Example: parent `PG · BR · 1.56 · KT · Green` with ranges `-6.00/+2.00` and `-6.00/+4.00` → **two** variants, two SKUs, two names, separate stock/price later.

---

## 5. Attributes admin

### 5.1 Page

**Path:** `/inventory/attributes` (sidebar: **Attributes**)

| Tab | Examples | On create product? |
|-----|----------|--------------------|
| Family | SV, KT, V2 (flags: Axis / ADD / Eye / Prog. type) | Yes (all families in SKU) |
| Base | HC, BRC, ARC, BR, … | Yes |
| Material | Plain, UC, Tintable, Poly, PG, PG Poly | Optional |
| Index | 1.49, 1.56, 1.61, 1.67, 1.74 | Yes |
| Color | Green, Blue, Grey, Brown, Violet, … | Yes (identity; not “tint only”) |
| Progressive type | Normal, Digital, Freeform, 9+4 design | V2 parent only; optional (no default); in SKU and parent identity, not name |
| Axis | 10…180 step 10 + 45 + 135 | Multi → variants (KT/V2); only if range CYL ≠ 0 |
| Addition | 0, 0.25…6.00 | Multi → variants (KT/V2); optional |
| Diameter | 55…120 step 5 mm | Optional single on parent |
| Eye | LEFT / RIGHT | Auto on V2 variants only (no create picker) |
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

1. **Family** → **Base** → **Material** (optional) → **Index** → **Color** → **Diameter** (optional) → **Progressive type** (V2 only; optional, no default)  
2. **Power ranges** — multi-select (≥1)  
3. If family supports Axis and a selected range has CYL ≠ 0 → optional **Axes** multi-select  
4. If family supports ADD → optional **Additions** multi-select  
5. Progressive (V2): system auto-creates **LEFT + RIGHT** for each combo (no eye picker)  
6. Optional **Purchase price** + **Selling price** (blank → `0` on each new variant; always numeric)  
7. **Preview** each variant’s auto SKU + auto name (read-only)  
8. **Save** → one parent + N variants (`ranges × axes × ADDs × eyes`; SPH-only ranges skip axes). Existing children are skipped; only missing rows are created.  

If the attribute combo already exists → do not duplicate parent; go to that parent and add the new ranges.

```
┌──────────────────────────────────────────┐
│  Create product                          │
├──────────────────────────────────────────┤
│  Family [▼]  Base [▼]  Material [▼ opt]  │
│  Index [▼]   Color [▼]  Diameter [▼ opt] │
│  Power ranges [ multi ▼ ]                │
│    ☑ -6.00/+2.00   ☑ +4.00/0.00          │
│  Axes [ multi ▼ ] (if CYL ≠ 0)           │
│  Additions [ multi ▼ ] (KT/V2)           │
│  (V2: LEFT+RIGHT auto — no eye picker)   │
│  Preview:                                │
│    …-ADD2P00-D70-LEFT-S…-C…-A90          │
│    PG 1.56 V2 BR Green +4.00/+2.00 90    │
│    …                                     │
│  [ Cancel ]                    [ Save ]  │
└──────────────────────────────────────────┘
```

### 6.3 SKU format (variant — locked)

Compact codes; omit Material when absent; **all families** (SV, KT, V2, …); **no coating**:

`[MATERIAL-]BASE-INDEX-FAMILY[-PROGTYPE][-COLOR][-ADD…][-D{mm}][-LEFT|RIGHT]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}[-A{axis}]`

| Rule | Detail |
|------|--------|
| Codes | Uppercase; `.` → `P` (`1.56` → `1P56`); strip non-alphanumeric |
| Powers | Negatives → `M` (`-6` → `M6`); decimals use `P` |
| Source | Bounds from selected **power-range attribute** |
| Uniqueness | Variant `skuCode` unique; `name` is display-only and may repeat. Existing `(range, axis, ADD, eye)` children are skipped; only missing children are inserted. |
| Parent uniqueness | `(family, base, material?, index?, color?, diameter?, progressiveType?)` — **absent optional attr = none** (omit from SKU/name; no “None” label required). Same combo without an optional attr must be **one** parent (Postgres `NULLS NOT DISTINCT`). |

Example: `PG-BR-1P56-KT-GREEN-SM6TP2-C0TM2`

Parent may keep an **internal** base code without the power segment (not shown in Admin UI).

### 6.4 Name format (variant — locked)

Fully auto; human-readable; power as **`-6.00/+2.00`**; no brand:

`[Material] [Index] [Family] [Base] [Color] -6.00/+2.00`

Example: `PG 1.56 KT BR Green -6.00/+2.00`  

Omit Material token when Material is absent.

### 6.5 Parent detail + family matrix

**Parent path:** `/inventory/products-catalog/[id]` (parent id)

- Attribute summary (Material? · Base · Index · Family · Color · Diameter? · Progressive type?)  
- **Power matrix** (family-aware sheets from sibling variants)  
- Variants table: range, axis, ADD, eye, SKU, name, purchase/selling price, active  
- **Add power range(s)** (+ axes / ADDs when family supports)  
- Lock attribute edit after any variant has stock/orders  

**Matrix (parent):** view-only `_ / _ / _` per covered optical cell. No DB change — composed from existing variants.

Sheets are **stacked Excel-like tables** (no tabs/buttons). Each table has explicit left stub columns and its own data columns.

| Family | Sheets (stacked, empty omitted) | Stub columns | Data columns |
|--------|---------------------------------|--------------|--------------|
| **SV** | SPH × CYL | `SPH` | one `CYL` column per step |
| **KT** | Sphere → CYL+Axis → Compound → Cross | `SPH`; `CYL`, `Axis`; `SPH`, `CYL`, `Axis` | one `ADD +x.xx` column per ADD |
| **V2** | Same sheet kinds as KT | same as KT | `RE` block then `LE` block, one column per ADD in each (`RE +1.00 … LE +3.00`) |

| Rule | Detail |
|------|--------|
| Steps | 0.25 from variant ranges |
| Stub columns | Only render a dimension that exists on the sheet (`Axis` omitted when no axis) |
| Axis blocks | One table per axis, largest first (`180` → `90`); rows `0.00` → max per axis |
| Compound vs cross | Compound sheet excludes cross-pattern combos; cross gets its own sheet |
| Presence | Cell shows triad only when a variant covers that power (+ ADD/axis/eye) |
| Behaviour | View only until stock phase; same layout later binds live qty |

**Variant path:** `/inventory/products-catalog/variants/[id]` — variant cards + product attributes + full family matrix + all variants, all on the same page. No separate matrix page or `#matrix` hop.

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
│  Family power matrix    │
│  Add more ranges        │
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
2. Live stock on parent matrix cells → stock-management (`LensProductPower` / leaf keyed by sph·cyl·add·axis·eye).  
4. Whether Brand becomes a real attribute later (ignored for now).  
5. Further catalog RCs → [`requested-changes.md`](../requested-changes.md).
