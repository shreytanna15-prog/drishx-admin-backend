# Product catalog — Client plan

**Document type:** Product catalog / SKU master plan  
**Repos:** Admin panel (primary). Shared backend APIs.  
**Hierarchy reference:** [CLIENT-HIERARCHY-CONFIRMATION.md](../product-catalog-hierarchy/CLIENT-HIERARCHY-CONFIRMATION.md) (approved)  
**Status:** Attributes, create product, list/grid, and matrix UI are **implemented** in admin (aligns with this plan).

---

## 1. Goal

Give Admin a clear way to:

1. Maintain **attribute lists** (Family, Base, Material, Index, Coating, Color) — add, rename, active / inactive.  
2. **Create products** by selecting those attributes plus a **power range** (and a display name).  
3. Browse products in **list** and **grid** views.  
4. Open each product and see an **Excel-style power matrix** (SPH × CYL) built from that product’s range, with placeholder values in each cell.

The **SKU code is generated automatically** from the selected attributes and range (one fixed format). Admin does not invent SKU text by hand.

Existing stock and order systems keep working. This slice builds the **new product master and UI**; live stock editing on the matrix and shop cutover come later.

---

## 2. In scope / out of scope

### In scope

- **Attributes** admin page — one place to manage all attribute types (tabs)
- Separate lists per type (Family, Base, Material, Index, Coating, Color) with add / edit / active switch
- **Products & catalog** page — list + grid toggle, search / filters, Create product
- **Create product** form — pick active attributes + define power range + product **name**; **SKU auto-generated**
- **Product detail** — summary of attributes + range + **matrix view**
- Matrix: headers from range at **0.25** steps; each cell shows `_ / _ / _` (placeholder for Current / Threshold / Target later)
- Backend tables and APIs for attributes and products (new schema; legacy lens tables stay)

### Out of scope (this phase)

- Saving stock numbers into every matrix cell / auto-creating thousands of empty stock rows
- Procurement (PO → receive), reorder rules, power-wise stock APIs beyond display placeholders  
  *(Future stock rules: see [stock-management-notes.md](../stock-management-notes.md).)*
- Customer website / mobile catalog rewrite
- Removing or replacing `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` tables
- Hold / Archive shop visibility (can follow once master is stable)
- Full KT / V2 multi-dimension matrices (ADD / AXIS / EYE) — SV-style SPH×CYL matrix first; other families use the same product form with their range fields, matrix stays SPH×CYL for now

---

## 3. How it works today vs after

| Today | After |
|-------|--------|
| Attribute names scattered in lens row text / old filter chips | Dedicated **Attributes** page; each type is its own editable list |
| Products & catalog incomplete / ad-hoc | Full **list + grid**, Create product, product detail |
| Powers managed mainly as individual lens rows | Product stores **attributes + power range**; matrix **shows** the grid in UI |
| No clear product SKU for “HC SV + this range” | Each catalog product gets an **auto SKU** from attributes + range, plus a display name |

---

## 4. Concepts (plain language)

| Concept | Meaning |
|---------|---------|
| **Attribute** | A master value such as HC, BRC, UC, 1.56, Green. Managed on the Attributes page. |
| **Product (catalog SKU)** | One sellable **line**: chosen attributes **plus** one power range (e.g. SPH 0…+10, CYL 0…+4). |
| **SKU code** | System-built code from those choices (not typed freely by Admin). |
| **Matrix** | Spreadsheet view for that product: rows = SPH, columns = CYL (0.25 steps inside the range). Cells show `_ / _ / _` for now. |

```
Attributes (masters)
        │
        ▼
┌─────────────────────────────────┐
│  PRODUCT (catalog SKU)          │
│  Family · Base · Material · …   │
│  + power RANGE                  │
│  + name                         │
│  + SKU (auto from attrs+range)  │
└────────────────┬────────────────┘
                 │
                 ▼
        Matrix view (UI)
        SPH × CYL · _ / _ / _
```

Two products with the same coatings but different ranges (e.g. −6×2 vs −8×2) are **two catalog products** (different auto SKUs).

---

## 5. Attributes admin

### 5.1 Page

**Path:** `/inventory/attributes` (sidebar: **Attributes**)

One page with **tabs**, one per attribute type:

| Tab | Examples |
|-----|----------|
| Family | SV, KT, V2 |
| Base | HC, BRC, ARC |
| Material | Plain, UC, Tintable, Poly, PG, PG Poly |
| Index | 1.49, 1.56, 1.59, 1.61, 1.67, 1.74 |
| Coating | Green, Blue, Mari-Blue, Violet, … |
| Color | Tint colours (for tinted / tintable) |

### 5.2 What Admin can do on each tab

- **Add** a value (e.g. new material “Tintable”)  
- **Edit** display name / short code  
- **Active / inactive** switch — inactive values do **not** appear in Create product dropdowns  
- Optional sort order so lists stay tidy  

Coating and Color stay **separate** lists (coat / surface vs tint).

### 5.3 Cascade (when creating a product)

Choosing **Base** narrows **Material** (e.g. UC / Tintable under HC / BRC). Full parent rules match the approved hierarchy doc.

---

## 6. Products & catalog

### 6.1 Catalog page

**Path:** `/inventory/products-catalog`

| Feature | Detail |
|---------|--------|
| **List view** | Table: SKU, name, family, base, material, index, coating, color, range summary, status |
| **Grid view** | Card tiles with the same summary (toggle next to search) |
| **Search / filters** | By SKU, name, family, base, material, active |
| **Create product** | Button → Create product form |

### 6.2 Create product

**Path:** `/inventory/products-catalog/new`

Admin fills:

1. **Name** (display)  
2. **Family** → **Base** → **Material** (cascade; active values only)  
3. **Index**, **Coating**, **Color** (aside; Color when tinted / tintable)  
4. **Power range** — SPH start/end, CYL start/end (optional ADD / AXIS / EYE for KT / V2)  
5. Optional **default price** for this product/range  
6. **SKU preview** — shown as the system builds it from the selections above (read-only)  
7. **Save** → product appears in list / grid  

```
┌──────────────────────────────────────┐
│  Create product                      │
├──────────────────────────────────────┤
│  Name ________                       │
│  SKU  [ auto: SV-HC-PLAIN-… ]  (ro)  │
│  Family [▼]  Base [▼]  Material [▼]  │
│  Index [▼]   Coating [▼]  Color [▼]  │
│  SPH from __ to __                   │
│  CYL from __ to __                   │
│  [ Cancel ]              [ Save ]    │
└──────────────────────────────────────┘
```

### 6.3 How SKU is built (locked)

One format from attribute **codes** + range bounds (powers encoded for the string; e.g. `1.56` → `1P56`, negative → `M…`):

`FAMILY-BASE-MATERIAL[-INDEX][-COATING][-COLOR]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}[-CROSS]`

Example shape: `SV-HC-PLAIN-1P56-S0T10-C0T4`

Admin never types this string; changing attributes or range changes the SKU. Duplicate same attributes + same range is rejected (same SKU would collide).

### 6.4 Product detail + matrix

**Path:** `/inventory/products-catalog/[id]`

**Header**

- Product name, auto SKU  
- Attribute chips / summary (Family · Base · Material · Index · Coating · Color)  
- Range summary (e.g. SPH 0 … +10.00 · CYL 0 … +4.00)

**Matrix (Excel-style)**

```
┌─────────────────────────────────────────────────────────┐
│  Hard Coat Single Vision +     SKU: SV-HC-PLAIN-…       │
│  HC · Plain · 1.56 · …                                  │
├─────────┬──────┬──────┬──────┬──────┬─────              │
│ SPH\CYL │  0   │+0.25 │+0.50 │+0.75 │ …                 │
├─────────┼──────┼──────┼──────┼──────┼─────              │
│  0      │_/_/_ │_/_/_ │_/_/_ │_/_/_ │                   │
│ +0.25   │_/_/_ │_/_/_ │ …                               │
│ +0.50   │ …                                             │
│  …      │                                               │
└─────────┴───────────────────────────────────────────────┘
```

| Rule | Detail |
|------|--------|
| Axes | SPH down the side, CYL across the top (labels `SPH\CYL`) |
| Steps | **0.25** between range min and max (built in the browser from saved range) |
| Cell | `_ / _ / _` placeholders (Current / Threshold / Target later) |
| Behaviour this phase | **View only** — no stock save from the matrix |
| Scroll | Sticky header row/column so large sheets stay usable |

---

## 7. End-to-end Admin flow

```
┌─────────────────────────┐
│  1. Attributes page     │
│  Add / edit masters     │
│  Set active             │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  2. Products & catalog  │
│  List or Grid           │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  3. Create product      │
│  Select attributes      │
│  Set power range        │
│  SKU auto-built         │
│  Save                   │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  4. Product appears     │
│  in list / grid         │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  5. Open product        │
│  See matrix (_/_/_)     │
└─────────────────────────┘
```

---

## 8. Names — short and full

Same vocabulary as the hierarchy confirmation:

| Short | Full |
|-------|------|
| SV | Single Vision |
| KT | Kryptok |
| V2 | Progressive |
| HC | Hard Coat |
| BRC | Blue Ray Cut / Blue Cut |
| ARC | Anti-Reflective Coating |
| UC | Uncoated |
| PG | Photochromic |
| Poly | Polycarbonate |

---

## 9. Example

**Create:** Name `Hard Coat Single Vision +`  
Family SV → Base HC → Material Plain → Index 1.56 → SPH 0…+10 → CYL 0…+4  

**SKU (auto):** e.g. `SV-HC-PLAIN-1P56-S0T10-C0T4`  

**Result:** Row/card on catalog → open detail → matrix with name/SKU, cells `_ / _ / _` for every 0.25 step in that range.

---

## 10. Acceptance (client)

- [x] Attributes page: manage Family, Base, Material, Index, Coating, Color (add / edit / active)
- [x] Inactive attributes do not appear on Create product
- [x] Create product by selecting attributes + power range; **SKU auto-generated** (unique)
- [x] Catalog shows **list** and **grid**
- [x] Each product opens a **matrix** from its range (0.25 steps) with `_ / _ / _` cells
- [x] Matrix header shows product name, SKU, and attribute summary
- [x] Legacy stock / orders unchanged by this slice

---

## 11. Open points (non-blocking)

1. Whether **brand / line** is a required field on create later.  
2. KT / V2 multi-axis matrix layout after SPH×CYL matrix (form already allows ADD / AXIS / EYE extras).  
3. Live stock on matrix cells → inventory / procurement phase ([stock-management-notes.md](../stock-management-notes.md)).
