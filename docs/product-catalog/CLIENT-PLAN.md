# Product catalog — Client plan

**Document type:** Product catalog / SKU master plan  
**Repos:** Admin panel (primary). Shared backend APIs.  
**Hierarchy reference:** [CLIENT-HIERARCHY-CONFIRMATION.md](../product-catalog-hierarchy/CLIENT-HIERARCHY-CONFIRMATION.md) (approved)  
**Status:** Oct baseline + **RC-03** + **RC-04** **shipped**. Parent + variants; auto SKU/name; Flat SKU tree + Grid parent browse. **Coating** is an optional parent attribute (same class as Material / Index / Color) — in uniqueness, SKU, and name when set (clarifies / supersedes the “coating required” wording in RC-08). Remaining: future attr lock — see [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) §11. More catalog RCs may follow in [`../requested-changes.md`](../requested-changes.md).

---

## 1. Goal

Give Admin a clear way to:

1. Maintain **attribute lists** (Family, Base, Material, Index, Coating, Color, Diameter, Progressive type, Axis, Addition, **Power range**) — add, rename, active / inactive.  
2. **Create a product parent** once by selecting parent attributes (only Family + Base required), then attach **one or more power-range attributes** as **variants** — without re-picking the same attrs for each range.  
3. Browse catalog in **Flat** (SKU drill-down) and **Grid** (parent browse cards → open matrix).  
4. Open the **parent product** and see a **family-aware power matrix** composed from its variants (SV: SPH × CYL; KT/V2: Sphere / CYL+Axis / Compound / Cross with ADD or Eye×ADD columns).

**SKU** and **name** are both **auto-built** (Admin does not type them). SKU is a compact machine code; name is human-readable for procurement / stock (no supplier brand fluff).

Each variant is a fully separate sellable line (own SKU, name, price). The matrix is a **view** over sibling variants on the parent; future stock/PO leaves key off **`variant` + exact SPH + CYL** (axis/ADD/eye already on the variant). See [stock-management CLIENT-PLAN](../stock-management/CLIENT-PLAN.md). Multiple products can reference the same power-range master without sharing stock.

---

## 2. In scope / out of scope

### In scope

- **Attributes** admin — tabs for all masters listed in §5  
- **Power range** add UX: select-based bounds (−40…+8 step rules), label like `-6.00/+2.00`  
- **Parent + variant** model (one parent attr combo → many power-range children)  
- **Create product** — parent attrs once + multi-select power ranges (+ axes / ADDs when allowed); preview SKUs/names; save  
- **Reuse parent** when attrs already exist → add missing children only  
- **Catalog list** — Flat (SKU tree) + Grid (parent cards)  
- Auto **SKU** + auto **name** builders (locked formats below)  
- Product parent detail + family-aware matrix (Current / Threshold / Target boxes; invalid **cross power** cells disabled; saving Threshold/Target is the stock phase)  
- Variant detail (variant card + product attributes + full family matrix + all siblings on one page)  

### Out of scope (this phase)

- Saving live stock numbers into every matrix cell  
  *(See [stock-management CLIENT-PLAN](../stock-management/CLIENT-PLAN.md) — the **same** matrix becomes live/editable later; this catalog is the source of truth.)*  
- Brand / supplier fancy names (DECENTRX, Night Ryder, 75mm, …)  
- Overlapping-range order allocation (which variant fills a shared power) — later orders/stock discussion  
- Customer website / mobile catalog rewrite  
- Removing older lens product lists from the system (still used by existing orders)  
- Redesigning older separate stock-grid screens — stock will use this parent matrix  
- Saving Threshold / Target until stock is wired  
- Free-edit of parent attributes after create (see §6.5 lock rule for when edit is added later)

---

## 3. How it works today vs after

| Before (Oct baseline) | Now |
|-------|--------|
| Flat product = attrs + typed range numbers + typed name | Parent = attrs; variants = power-range masters |
| Re-create whole product for a second range | Same parent → **Add power range** (multi-select on create) |
| SKU: `FAMILY-BASE-MATERIAL-…` | SKU: `[MATERIAL-]BASE[-INDEX]-FAMILY[-COATING][-PROGTYPE][-COLOR]…-S…-C…` |
| Name typed by Admin | Name **auto**: human words + power (+ axis when set) |
| Coating required / special-cased | Coating **optional** parent attr — same rules as Material / Index / Color |

---

## 4. Concepts (plain language)

| Concept | Meaning |
|---------|---------|
| **Attribute master** | Reusable reference value (HC, 1.56, Green, HC coating, power range `-6.00/+2.00`, …). Never hard-deleted — deactivate instead. |
| **Parent attributes** | One identity group: Family · Base · Material? · Index? · Coating? · Color? · Diameter? · Progressive type?. Treat as **one entity**. |
| **Power range** | Reusable SPH/CYL bounds master. Label e.g. **`-6.00/+2.00`**. Lives on the **variant**. |
| **Product (parent)** | One parent-attribute combination. Only Family + Base required. |
| **Variant (child)** | Parent × power range × optional axis × optional ADD × optional eye. **Sellable** catalog SKU. |
| **SKU code** | Compact machine id on the **variant** (not typed). |
| **Name** | Human label on the **variant** (not typed; no brand). |
| **Matrix** | Parent-level family sheets over all variants; each cell shows Current / Threshold / Target (stock save comes later). |

```
Attributes (masters)
  Family · Base · Material? · Index? · Coating? · Color? · Diameter? · Progressive type?
  + Axis · Addition · Power range masters
        │
        ▼
┌─────────────────────────────────┐
│  PARENT product                 │
│  Family · Base                  │
│  + optional Material / Index /  │
│    Coating / Color / Diameter / │
│    Progressive type             │
└────────────┬────────────────────┘
             │ 1 → many
             ▼
┌─────────────────────────────────┐
│  VARIANT (sellable child)       │
│  power range × axis? × ADD?     │
│  × eye?                         │
│  SKU · name · price · active    │
└─────────────────────────────────┘
```

---

## 5. Attributes admin

### 5.1 Page

**Where:** Admin sidebar → **Attributes**

| Tab | Role | On create product? |
|-----|------|--------------------|
| Family | SV, KT, V2 (flags: Axis / ADD / Eye / Prog. type) | **Required** parent |
| Base | HC, BRC, ARC, BR, … | **Required** parent |
| Material | Plain, UC, Tintable, Poly, PG, … | Optional parent |
| Index | 1.49, 1.56, 1.61, … | Optional parent |
| Coating | HC, HMC, Blue Coat, … | Optional parent (SKU + name + uniqueness when set) |
| Color | Green, Blue, Grey, … | Optional parent |
| Diameter | 55…120 step 5 mm | Optional parent (SKU when set; **not** in name) |
| Progressive type | Normal, Digital, Freeform, … | V2 only; optional; **SKU + identity, not name** |
| Axis | 10…180 step 10 + 45 + 135 | Multi → variants (when family + CYL allow) |
| Addition | 0, 0.25…6.00 | Multi → variants (when family supports ADD) |
| **Power range** | `-6.00/+2.00`, … | On **variant** (multi) |
| Eye | LEFT / RIGHT | Auto on V2 only (no create picker; no Attributes tab) |

### 5.2 What Admin can do on each tab

- **Add** / **Edit** display name / short code  
- **Active / inactive** — inactive values do not appear in Create dropdowns  
- Optional sort order  

### 5.2a Power range tab

- List + add/edit via **selects** (not free number typing).  
- Universe **−40 … +8**:
  | Band | Step |
  |------|------|
  | −40 → −16 | **0.5** |
  | after −16 toward +4 | **0.25** |
  | after **+4** → +8 | **0.5** |
- Store SPH min/max + CYL min/max. Label from extremes: **`-6.00/+2.00`**.  
- Once a range is used by a variant, **do not edit bounds** — create a new range instead.

### 5.3 Cascade

**Base** may narrow **Material** when Material is used. Skipping Material is allowed.

---

## 6. Products & catalog

### 6.1 Catalog page

**Where:** Admin sidebar → **Products & catalog**

| Feature | Detail |
|---------|--------|
| **Flat view** | Dense expandable SKU drill-down: top-level groups (parent attrs + power label) → axis subgroups → SKU rows. |
| **Grid view** | **Compact full-width parent card list** (not a multi-column tile grid, not Flat’s expand tree). One row-card per catalog **parent**: title + status + counts, attr chips, power ranges as wrapping chips (**compact label + span subtitle always visible**, no tooltip). Click → **parent detail** (matrix). Same filters as Flat. |
| **Search / filters** | Server-side by SKU, name, family, base, material, coating, active |
| **Create product** | Button → create form |

> **Jobs:** Flat = find/scan SKUs. Grid = browse parents and open the matrix. Do not nest axis→SKU inside Grid cards.

### 6.2 Create product

**Where:** Products & catalog → **New product**

1. **Family** + **Base** (required)  
2. Optionally **Material**, **Index**, **Coating**, **Color**, **Diameter**, **Progressive type** (V2 only; optional; no default)  
3. **Power ranges** — multi-select (≥1)  
4. If family supports Axis and a selected range has CYL ≠ 0 → optional **Axes** multi-select  
5. If family supports ADD → optional **Additions** multi-select  
6. Progressive (V2): system auto-creates **LEFT + RIGHT** for each combo (no eye picker)  
7. Optional **Purchase price** + **Selling price** (blank → `0` on each new variant)  
8. **Preview** each variant’s auto SKU + auto name (read-only)  
9. **Save** → one parent + N variants (`ranges × axes × ADDs × eyes`; SPH-only / CYL=0 ranges skip axes). Existing children are skipped; only missing rows are created.

If the parent attribute combo already exists → do not duplicate parent; attach only missing children.

```
┌──────────────────────────────────────────┐
│  Create product                          │
├──────────────────────────────────────────┤
│  Family* [▼]  Base* [▼]                  │
│  Material [▼ opt]  Index [▼ opt]         │
│  Coating [▼ opt]   Color [▼ opt]         │
│  Diameter [▼ opt]  Prog. type [▼ V2 opt] │
│  Power ranges [ multi ▼ ]                │
│  Axes [ multi ▼ ] (if CYL ≠ 0)           │
│  Additions [ multi ▼ ] (KT/V2)           │
│  (V2: LEFT+RIGHT auto — no eye picker)   │
│  Preview: SKU + name rows                │
│  [ Cancel ]                    [ Save ]  │
└──────────────────────────────────────────┘
```

### 6.3 Family rules

| Family | Axis | ADD | Eye |
|--------|------|-----|-----|
| **SV** | No | No | No |
| **KT** | Yes | Yes | No |
| **V2** | Yes | Yes | Yes |

- Axis children are generated only when the power range has **non-zero CYL**.  
- Pure SPH / CYL=0 ranges skip axis.  
- V2 automatically creates **LEFT + RIGHT** children.  
- V2 + ADDs → each ADD gets both eyes (`ADD count × 2`).

### 6.4 SKU format (variant — locked)

`[MATERIAL-]BASE[-INDEX]-FAMILY[-COATING][-PROGTYPE][-COLOR][-ADD…][-D{mm}][-LEFT|RIGHT]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}[-A{axis}]`

| Rule | Detail |
|------|--------|
| Codes | Uppercase; `.` → `P` (`1.56` → `1P56`); strip non-alphanumeric |
| Powers | Negatives → `M` (`-6` → `M6`); decimals use `P` |
| Optional parent segments | Material, Index, Coating, Color, Progressive type, Diameter — omit when absent |
| Progressive type | In SKU when set; **not** in name |
| Coating | Same as other optional parent attrs — in SKU when set |
| Uniqueness | Variant SKU is unique; display name may repeat |
| Parent uniqueness | Full parent combo including optional nulls with `NULLS NOT DISTINCT` (Family, Base, Material?, Index?, Coating?, Color?, Diameter?, Progressive type?) |

Example shape: `PG-BR-1P56-KT-HC-GREEN-SM6TP2-C0TM2`

Parent may keep an **internal** base code without the power segment (not shown in Admin UI).

### 6.5 Name format (variant — locked)

`[Material] [Index] [Family] [Base] [Coating] [Color] {power} [axis]`

| Rule | Detail |
|------|--------|
| Power | Compact extremes e.g. `-6.00/+2.00` |
| Span disambiguation | When the non-extreme bound is not plano, append `(spanSPH / spanCYL)` so two ranges that share the same extremes still get distinct names |
| Axis | Append integer degrees when the variant has an axis |
| **Not** in name | Progressive type, ADD, eye, diameter |
| Tokens | Material / Index / Family / Base use **codes**; Coating / Color use **display labels** when available |

Example: `PG 1.56 KT BR Hard Coat Green -6.00/+2.00`  
With axis: `… -6.00/+2.00 90`

### 6.6 Bulk create / reuse rules

- If the parent attribute combo already exists → **reuse** it.  
- Existing child combo `(range, axis, ADD, eye)` is **skipped** (not an error).  
- Only missing children are inserted.  
- Parent create + child inserts + audit are **transactional**.  
- If child insert fails, a newly created empty parent is cleaned up.  
- SKU collisions with another product are still real errors.  
- Re-running the same create request is safe / idempotent for existing children.

### 6.7 Parent detail + family matrix

**Where:** Products & catalog → open a **parent**

- Attribute summary must show the full parent group: Material? · Base · Index? · Family · **Coating?** · Color? · Diameter? · Progressive type?  
- **Power matrix** (family-aware sheets from sibling variants)  
- Variants table: range, axis, ADD, eye, SKU, name, purchase/selling price, active  
- **Add power range(s)** (+ axes / ADDs when family supports)  

**Attribute lock (keep — future edit rule):**  
If Admin later gets “edit parent attributes”, those fields become **read-only** once **any variant** of that parent has **stock** or **orders**. Changing identity under live stock/orders is not allowed — create a new parent combo instead. (No free parent-attr edit in this phase.)

**Matrix (parent):** Current / Threshold / Target boxes on covered valid cells (Threshold / Target save comes with stock). Layout is built from the parent’s variants.

Sheets are **stacked Excel-like tables** (no tabs/buttons). Each table has explicit left stub columns and its own data columns.

| Family | Sheets (stacked, empty omitted) | Stub columns | Data columns |
|--------|---------------------------------|--------------|--------------|
| **SV** | SPH × CYL | `SPH` | one `CYL` column per step |
| **KT** | Sphere → CYL+Axis → Compound → Cross | `SPH`; `CYL`, `Axis`; `SPH`, `CYL`, `Axis` | one `ADD +x.xx` column per ADD |
| **V2** | Same sheet kinds as KT | same as KT | `RE` block then `LE` block, one column per ADD in each |

| Rule | Detail |
|------|--------|
| Steps | 0.25 from variant ranges |
| Stub columns | Only render a dimension that exists on the sheet |
| Axis blocks | **One sheet per axis** (never share); stack largest first (`180` → `90` → `135` → `45`) |
| SPH / CYL order | By **absolute size** ascending (0.25 before 1.00; sign is display only). Compound / Cross rows are **CYL first**, then SPH |
| Compound vs cross | Compound excludes the whole **+SPH / −CYL** quadrant; Cross owns that grid (SV applies the same rule on its single SPH×CYL sheet) |
| Cross power | Full +SPH / −CYL grid; cells that break the cross rule (cylinder at least **0.25** stronger than sphere) are **disabled** (×, no boxes) — SV, KT, and V2 |
| Presence | Cell shows Current / Threshold / Target only when the combo is valid and a variant covers that power (+ ADD / axis / eye) |
| Behaviour | Boxes always for valid covered cells; Threshold / Target save when stock is live; same layout shows live qty |

**Variant screen:** open a variant → variant card + **full parent attributes (incl. Coating)** + full family matrix + all siblings on the same page. No separate matrix-only page.

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
│  Parent attrs once      │
│  Multi-select ranges    │
│  Preview SKU + name     │
│  Save → parent+variants │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  3. Catalog             │
│  Flat or Grid           │
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

**Parent attrs:** Material PG · Base BR · Index 1.56 · Family KT · Coating HC · Color Green  

**Ranges selected:** `-6.00/+2.00` and `-6.00/+4.00`

| Variant | SKU (shape) | Name |
|---------|-------------|------|
| 1 | `PG-BR-1P56-KT-HC-GREEN-SM6TP2-…` | `PG 1.56 KT BR Hard Coat Green -6.00/+2.00` |
| 2 | `PG-BR-1P56-KT-HC-GREEN-SM6TP4-…` | `PG 1.56 KT BR Hard Coat Green -6.00/+4.00` |

Two separate sellable products; Admin did not re-enter parent attrs for the second range.

---

## 10. Acceptance (client)

### Shipped

- [x] Attributes page: Family, Base, Material, Index, Coating, Color (+ Axis, Addition, Diameter, Progressive type, Power range)  
- [x] Inactive attributes hidden on Create  
- [x] Power range tab (selects; −40…+8 steps; lock bounds when in use)  
- [x] Only Family + Base required; other parent attrs optional (incl. Coating)  
- [x] Parent + multi power-range variants; Add range without re-picking attrs  
- [x] Auto SKU + auto name (locked formats); no typed name  
- [x] Flat catalog view (nested groups → axis → SKUs)  
- [x] **Grid** parent browse cards (open parent detail; Flat keeps SKU tree)  
- [x] Coating on parent + variant attribute summaries  
- [x] Family matrix Current / Threshold / Target boxes (cross power cells disabled where required)  
- [x] Existing stock / orders flows unaffected  


### Remaining (not blocking)

- [ ] Attribute lock when parent-attr edit is introduced and stock/orders exist  

---

## 11. Open points (non-blocking)

1. Overlapping power ranges across variants — stock piles stay separate per variant (this variant + SPH + CYL); order UX that picks “which variant” when both cover a cell may still need a later change.  
2. Live stock on parent matrix cells → see [stock-management CLIENT-PLAN](../stock-management/CLIENT-PLAN.md).  
3. Whether Brand becomes a real attribute later (ignored for now).  
4. Further catalog change requests may follow.
