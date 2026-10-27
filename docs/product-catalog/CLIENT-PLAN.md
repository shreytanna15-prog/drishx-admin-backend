# Product catalog — Client plan

**Document type:** Product catalog / SKU master plan  
**Repos:** Admin panel (primary). Shared backend APIs.  
**Hierarchy reference:** Product Attribute docs (approved)

---

## 1. Goal

Give Admin a clear way to:

1. Maintain **attribute lists** (Family, Base, Material, Index, Coating, Color) — add, rename, active / inactive.  
2. **Create products** by selecting those attributes plus a **power range**.  
3. Browse products in **list** and **grid** views.  
4. Open each product and see an **Excel-style power matrix** (SPH × CYL) built from that product’s range, with placeholder values in each cell.

Existing stock and order systems keep working. This slice builds the **new product master and UI**; live stock editing on the matrix and shop cutover come later.

---

## 2. In scope / out of scope

### In scope

- **Attributes** admin page — one place to manage all attribute types (tabs or equivalent sections)
- Separate lists per type (Family, Base, Material, Index, Coating, Color) with add / edit / active switch
- **Products & catalog** page — list + grid toggle, search / filters, Create product
- **Create product** form — pick active attributes + define power range + product name / SKU code
- **Product detail** — summary of attributes + range + **matrix view**
- Matrix: headers from range at **0.25** steps; each cell shows `_ / _ / _` (placeholder for Current / Threshold / Target later)
- Backend tables and APIs for attributes and products (new schema; legacy lens tables stay)

### Out of scope (this phase)

- Saving stock numbers into every matrix cell / auto-creating thousands of empty stock rows
- Procurement (PO → receive), reorder rules, power-wise stock APIs beyond display placeholders
- Customer website / mobile catalog rewrite
- Removing or replacing `SingleVisionLens` / `KryptokLens` / `ProgressiveLens` tables
- Hold / Archive shop visibility (can follow once master is stable)
- Full KT / V2 multi-dimension matrices (ADD / AXIS / EYE) — SV-style SPH×CYL matrix first; other families use the same product form with their range fields, matrix layout may be simplified until a follow-on

---

## 3. How it works today vs after

| Today | After |
|-------|--------|
| Attribute names scattered in lens row text / old filter chips | Dedicated **Attributes** page; each type is its own editable list |
| Products & catalog incomplete / ad-hoc | Full **list + grid**, Create product, product detail |
| Powers managed mainly as individual lens rows | Product stores **attributes + power range**; matrix **shows** the grid in UI |
| No clear product SKU for “HC SV + this range” | Each catalog product has a **SKU / code** and display name |

---

## 4. Concepts (plain language)

| Concept | Meaning |
|---------|---------|
| **Attribute** | A master value such as HC, BRC, UC, 1.56, Green. Managed on the Attributes page. |
| **Product (catalog SKU)** | One sellable **line**: chosen attributes **plus** one power range (e.g. SPH 0…+10, CYL 0…+4). |
| **Matrix** | Spreadsheet view for that product: rows = SPH, columns = CYL (0.25 steps inside the range). Cells show `_ / _ / _` for now. |

```
Attributes (masters)
        │
        ▼
┌─────────────────────────────────┐
│  PRODUCT (catalog SKU)          │
│  Family · Base · Material · …   │
│  + power RANGE                  │
│  + name / SKU code              │
└────────────────┬────────────────┘
                 │
                 ▼
        Matrix view (UI)
        SPH × CYL · _ / _ / _
```

Two products with the same coatings but different ranges (e.g. −6×2 vs −8×2) are **two catalog products**.

---

## 5. Attributes admin

### 5.1 Page

**Path (proposed):** `/inventory/attributes` (or under Products & catalog → Attributes tab — exact nav label in build)

One page with **tabs** (or side sections), one per attribute type:

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
| **Search / filters** | By SKU, name, family, base, material, index, coating, active |
| **Create product** | Button → Create product form |

### 6.2 Create product

**Path (proposed):** `/inventory/products-catalog/new`

Admin fills:

1. **Name** and **SKU / code** (unique)  
2. **Family** → **Base** → **Material** (cascade; active values only)  
3. **Index**, **Coating**, **Color** (aside; Color when tinted / tintable)  
4. **Power range** — SPH start/end, CYL start/end (and family extras later: ADD / AXIS / EYE for KT / V2)  
5. Optional **default price** for this product/range  
6. **Save** → product appears in list / grid  

```
┌──────────────────────────────────────┐
│  Create product                      │
├──────────────────────────────────────┤
│  Name ________   SKU ________        │
│  Family [▼]  Base [▼]  Material [▼]  │
│  Index [▼]   Coating [▼]  Color [▼]  │
│  SPH from __ to __                   │
│  CYL from __ to __                   │
│  [ Cancel ]              [ Save ]    │
└──────────────────────────────────────┘
```

### 6.3 Product detail + matrix

**Path (proposed):** `/inventory/products-catalog/[id]`

**Header**

- Product name, SKU  
- Attribute chips / summary (Family · Base · Material · Index · Coating · Color)  
- Range summary (e.g. SPH 0 … +10.00 · CYL 0 … +4.00)

**Matrix (Excel-style)**

```
┌─────────────────────────────────────────────────────────┐
│  HARD COAT SINGLE VISION +     SKU: HC-SV-PLUS-001      │
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

Opening a product always shows this sheet for its range so the catalog feels like the stock books you already use.

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

**Create:** Name `Hard Coat Single Vision +`, SKU `HC-SV-PLUS-001`  
Family SV → Base HC → Material Plain → Index 1.56 → Coating as needed → SPH 0…+10 → CYL 0…+4  

**Result:** Row/card on catalog → open detail → matrix titled with name/SKU, cells `_ / _ / _` for every 0.25 step in that range.

---

## 10. Acceptance (client)

- [ ] Attributes page: manage Family, Base, Material, Index, Coating, Color (add / edit / active)
- [ ] Inactive attributes do not appear on Create product
- [ ] Create product by selecting attributes + power range; unique SKU
- [ ] Catalog shows **list** and **grid**
- [ ] Each product opens a **matrix** from its range (0.25 steps) with `_ / _ / _` cells
- [ ] Matrix header shows product name, SKU, and attribute summary
- [ ] Legacy stock / orders unchanged by this slice

---

## 11. Open points (non-blocking)

1. Exact nav label for Attributes (own menu item vs under Products).  
2. Whether **brand / line** is a required field on create in v1.  
3. Default SKU format (manual only vs suggested from attributes).  
4. KT / V2 matrix layout after SV matrix ships.
