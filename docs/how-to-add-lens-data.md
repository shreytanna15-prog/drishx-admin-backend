# How to Add Lens Data

**Who this is for:** You � new developer or admin entering catalog rows  
**Where data lives:** PostgreSQL tables (`SingleVisionLens`, `KryptokLens`, `ProgressiveLens`)  
**How you add rows:** Admin panel UI **or** POST API (admin only)

Read this together with:

- [`lens-logic-handover.md`](./lens-logic-handover.md) � why powers work the way they do  
- [`lens-catalog-from-production.md`](./lens-catalog-from-production.md) � what is already in production  

---

## 1. The big idea (read this first)

Think of the catalog in **two levels**:

```
+---------------------------------------------------------+
�  PRODUCT  = one lens line customers recognize            �
�  e.g. ASH � BLUE CUT � 1.60 � GREEN                     �
+---------------------------------------------------------+
         �
         �  made of many rows
         ?
+---------------------------------------------------------+
�  POWER BAND  = one price row for a slice of powers      �
�  e.g. -6/-2, -8/-2, cross -2, +4/+2, +6                �
+---------------------------------------------------------+
```

**One product = many database rows.**  
Each row is **one power band** with its own price and stock.

When a customer orders `-7.00 / -1.50`, the app finds which band covers that power and charges that row�s price.

---

## 2. Field names that confuse everyone

On the price sheet you see something like **`-8/-2`**. In the database:

| What you read on sheet | DB field | Meaning |
|------------------------|----------|---------|
| **-8** (the �/-2� part�s SPH) | `sph` | **End** of sphere range |
| Start of that SPH band | `sphStartRange` | **Start** of sphere range |
| **-2** | `cyl` | **End** of cylinder range |
| Start of that CYL band | `cylStartRange` | **Start** of cylinder range |

**Simple rule:**  
`sph` and `cyl` are the **ends**.  
`sphStartRange` and `cylStartRange` are the **starts**.

Customer picks any value between start and end in **0.25 steps**.

Example **-6/-2**:

```
sphStartRange = 0      sph = -6     ?  customer can pick 0, -0.25, -0.50 � -6.00
cylStartRange = 0      cyl = -2     ?  customer can pick 0, -0.25, -0.50 � -2.00
```

Example **-8/-2** (next deeper band):

```
sphStartRange = -6.25   sph = -8    ?  customer picks -6.25 � -8.00
cylStartRange = 0       cyl = -2    ?  same CYL as -6/-2 band
```

**Chaining rule:** When you add the next deeper negative SPH band, set:

```
new sphStartRange = previous band's sph - 0.25
```

So after **-6/-2**, the next band **-8/-2** starts at **-6.25**. This matches production (ASH, Hardcoat, BLUE CUT SV, etc.).

---

## 3. Where to add data

### Option A � Admin panel (recommended)

1. Log in as **ADMIN** on `drishx-admin-backend`
2. Open **Lenses** ? Single Vision / Kryptok / Progressive
3. Click **Add lens** (opens the `/inventory/stock-overview/new` page)
4. Fill product fields once, then add **one row per power band**

### Option B � API

Admin session required. Endpoints:

| Type | POST endpoint |
|------|---------------|
| Single Vision | `POST /api/lenses/single-vision` |
| Kryptok | `POST /api/lenses/kryptok` |
| Progressive | `POST /api/lenses/progressive` |

Creation logic: `app/lib/admin-create-lens.ts`

---

## 4. Adding a Single Vision product (step by step)

### Step 1 � Decide product identity

These fields must **match across all bands** of the same product:

| Field | Example (ASH GREEN) | Notes |
|-------|---------------------|-------|
| `category` | `BLUE CUT` | Optional but used for grouping |
| `brand` | `ASH` | Required |
| `item` | `BLUE CUT` | Optional |
| `index` | `1.6` | Refractive index |
| `coating` | `GREEN` | From coating filter list |

### Step 2 � Add each power band as its own row

Production **ASH � GREEN � 1.60** has **5 rows**. Here is exactly what to enter.

#### Row 1: -6/-2 (first negative compound band)

| Field | Value |
|-------|-------|
| sph | `-6` |
| sphStartRange | `0` |
| cyl | `-2` |
| cylStartRange | `0` |
| price | `86` |
| costPrice | `72` |
| quantity | `0` |

**What customer sees:** SPH from 0 down to -6, CYL from 0 down to -2.

#### Row 2: -8/-2 (chained from row 1)

| Field | Value |
|-------|-------|
| sph | `-8` |
| sphStartRange | `-6.25` ? previous end - 0.25 |
| cyl | `-2` |
| cylStartRange | `0` |
| price | `86` |

#### Row 3: Cross -2

Turn on **Cross power mode** in the admin form.

| Field | Value |
|-------|-------|
| crossPower | `-2` |
| sph / cyl | leave empty (API sets null) |
| price | `113` |

Cross rows are for prescriptions with **+SPH and -CYL** (mixed sign). See [`lens-logic-handover.md`](./lens-logic-handover.md).

#### Row 4: +4/+2 (positive compound)

| Field | Value |
|-------|-------|
| sph | `4` |
| sphStartRange | `0` |
| cyl | `2` |
| cylStartRange | `0` |
| price | `98` |

#### Row 5: +6 (SPH only, chained from +4/+2)

| Field | Value |
|-------|-------|
| sph | `6` |
| sphStartRange | `4.25` ? after +4 compound ends at +4 |
| cyl | `0` |
| cylStartRange | `0` |
| price | `98` |

### Step 3 � API example (one band)

```json
POST /api/lenses/single-vision
{
  "category": "BLUE CUT",
  "brand": "ASH",
  "item": "BLUE CUT",
  "index": 1.6,
  "coating": "GREEN",
  "sph": -8,
  "sphStartRange": -6.25,
  "cyl": -2,
  "cylStartRange": 0,
  "price": 86,
  "costPrice": 72,
  "quantity": 0
}
```

### Step 4 � Verify in shop

Open the lens detail API:

```
GET /api/lenses/single-vision/{id}
```

Check `selectableRange.sph` includes `-6.25`, `-6.50`, � `-8.00`.

---

## 5. Building a full negative ladder (like Hardcoat)

Large products have many chained bands. Pattern for **-2 CYL** lines:

| Band | sph (end) | sphStartRange |
|------|-----------|---------------|
| -6/-2 | -6 | **0** |
| -8/-2 | -8 | **-6.25** |
| -10/-2 | -10 | **-8.25** |
| -12/-2 | -12 | **-10.25** |
| -14/-2 | -14 | **-12.25** |
| -16/-2 | -16 | **-15.25** * |
| -18/-2 | -18 | **-16.25** |
| -20/-2 | -20 | **-18.25** |

\* Some bands are **narrow** (only 1 diopter wide). Production uses **-15.25** for -16/-2, not -15.25 from strict -14.25-0.25 in all cases � copy an existing similar product when unsure.

For **-4 CYL** bands at the same SPH depth:

| Band | cyl (end) | cylStartRange |
|------|-----------|---------------|
| -6/-4 | -4 | **-2.25** (after -2 band) |
| -8/-4 | -4 | **-2.25** |

Add **cross -2, -4, -6** rows if the product supports cross (most full-range SV lines do).

---

## 6. Adding Kryptok (KT)

Kryptok rows need **ADD** and often **AXIS**.

### Product grouping

Same `category` + `brand` + `coating` = one KT product.  
Many rows differ by **SPH band**, **AXIS**, and sometimes **item = CROSS**.

### Example: HC KT line (from production)

Typical row:

| Field | Example value |
|-------|---------------|
| category | `HC KT` |
| coating | `HC` |
| item | `CROSS` (for cross variants) |
| sph | `-6` |
| sphStartRange | `0` |
| cyl | `-2` or empty |
| cylStartRange | `0` if cyl set |
| add | `3` (production mostly uses +3; some rows use +1) |
| axis | `90`, `180`, `45`, `135`, `-45`, `-135` |
| price | from price sheet |

**Important:** KT often needs **separate rows per axis value** � not one row with �any axis�.

### API example

```json
POST /api/lenses/kryptok
{
  "category": "HC KT",
  "coating": "HC",
  "item": "CROSS",
  "sph": -6,
  "sphStartRange": 0,
  "cyl": -2,
  "cylStartRange": 0,
  "axis": 90,
  "add": 3,
  "price": 120,
  "quantity": 0
}
```

Repeat for each axis (90, 180, 45, �) and each power band.

---

## 7. Adding Progressive (PG V2)

Progressive rows need **ADD**, **AXIS**, **type**, and **eye**.

### Product grouping

`category` + `brand` + `item` + `index` + `type` + `coating`

### Example: BRC V2 (production)

| Field | Example |
|-------|---------|
| category | `BRC V2` |
| item | `BRC V2` |
| brand | *(empty string ok in prod)* |
| index | `1.56` |
| type | `SHMC` |
| coating | `Green` |
| add | `3` |
| eye | `LEFT` |
| axis | `-180`, `-90`, `90`, `180` |
| sph / sphStartRange | same chaining rules as SV |

### API example

```json
POST /api/lenses/progressive
{
  "category": "BRC V2",
  "item": "BRC V2",
  "brand": "BRC V2",
  "index": 1.56,
  "type": "SHMC",
  "coating": "Green",
  "sph": -8,
  "sphStartRange": -6.25,
  "cyl": -2,
  "cylStartRange": 0,
  "axis": 90,
  "add": 3,
  "eye": "LEFT",
  "price": 450,
  "quantity": 0
}
```

**Production note:** All 91 progressive rows today use `eye = LEFT` only. If you need separate RIGHT pricing, add duplicate rows with `eye: "RIGHT"`.

---

## 8. Cross power � when and how

Use a **cross row** when the price sheet has �cross -2�, �cross -4�, etc.

| Do | Don�t |
|----|-------|
| Set `crossPower = -2` | Set sph/cyl as the main power |
| Leave sph/cyl null in API | Use cross for normal compound bands |
| One row per cross level | Mix cross and compound in one row |

Production cross -2 (Hardcoat):

```
crossPower: -2
price: 78
costPrice: 65
```

Customer with +2.00 SPH / -2.00 CYL may match this row instead of a normal compound row.

---

## 9. Pricing and stock

| Field | Rule |
|-------|------|
| `price` | Customer-facing wholesale price (required) |
| `costPrice` | Optional; seed data often uses **price = cost � 1.2** |
| `quantity` | Stock count; default **0** if not set |

Most production rows have **quantity = 0**. Orders may wait for procurement unless you update stock.

---

## 10. Wholesale shop cards (optional extra step)

Rows appear in admin catalog immediately. For them to show under the right **shop card** (e.g. �BRC�, �HC KT�), the product must match rules in:

- `app/lib/single-vision-wholesale-catalog.ts`
- `app/lib/kryptok-wholesale-catalog.ts`
- `app/lib/progressive-wholesale-catalog.ts`

`CatalogProductLine` table holds card names (23 lines in production). If a new product does not appear in the expected shop section, check these matchers � not just the DB row.

---

## 11. Checklist before you finish

- [ ] All bands of one product share the same brand/index/coating (and KT/PG grouping fields)
- [ ] Every compound row has **both** start and end for SPH (and CYL if used)
- [ ] Chained bands: `sphStartRange = previous sph - 0.25` (same CYL family)
- [ ] Cross rows use `crossPower` only
- [ ] KT/PG: ADD set; axis rows duplicated per angle if needed
- [ ] Progressive: `eye` is LEFT or RIGHT
- [ ] Price matches price sheet
- [ ] Test one power in shop/API detail view

---

## 12. Common mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Only set `sph`, forget `sphStartRange` | API error or empty range | Always pair end + start |
| Set `sphStartRange = -8` for -8/-2 band | Customer can�t pick -7.25 | Start should be -6.25 |
| One row for all KT axes | Missing powers in shop | One row per axis |
| Wrong brand spelling across bands | Product splits into two shop items | Copy-paste identity fields |
| Expect RIGHT eye PG from existing data | Only LEFT works | Add RIGHT rows |

---

## 13. Copy an existing product (fastest method)

1. Run audit: `npm run audit:catalog`
2. Open `scripts/catalog-audit-output/sample-products.json` or `sv-product-groups.json`
3. Find a product similar to yours (e.g. ASH GREEN)
4. In admin, add rows using the same `sphStartRange` pattern
5. Change brand/coating/price to your new line

This is how the previous developer worked � **manual rows**, not bulk import.

---

## 14. Quick reference � required fields

### Single Vision

| Required | Optional |
|----------|----------|
| brand, index, coating, price | category, item |
| sph + sphStartRange (unless cross) | cyl, cylStartRange, costPrice, quantity |
| crossPower (cross mode only) | |

### Kryptok

| Required | Optional |
|----------|----------|
| sph, sphStartRange, add, price | category, brand, item, coating, cyl, cylStartRange, axis, crossPower |

### Progressive

| Required | Optional |
|----------|----------|
| item, brand, index, type, coating, sph, sphStartRange, add, eye, price | category, cyl, cylStartRange, axis |

---

## Related docs

- [`lens-catalog-from-production.md`](./lens-catalog-from-production.md) � live inventory snapshot  
- [`lens-logic-handover.md`](./lens-logic-handover.md) � business rules  
- [`lens-domain-logic.md`](./lens-domain-logic.md) � code & validation  
- [`intro.md`](./intro.md) � platform overview  
