# Product catalog structure

How products will be organised in DrishX — plain language, no technical detail.

**Update (RC-03 + RC-04):** **Material is optional**. **Power range** is an Attributes master. Product = **parent** (Material? · Base · Index · Family · Color) with **many variants** (one per power range). **Coating is not product identity** — Green/Blue/… are **Color**. Auto SKU + auto name on each variant. Living detail: [`../product-catalog/CLIENT-PLAN.md`](../product-catalog/CLIENT-PLAN.md) and [`../requested-changes.md`](../requested-changes.md).

---

## Simple idea

Not every field sits in one deep parent–child tree.

Like an address map:

- **State → City → Area** — hierarchy (picking one narrows the next list)
- Some fields sit **beside** that path as their own lists

Lenses work the same way:

| Part | What it includes | How it works |
|------|------------------|--------------|
| **Core hierarchy** | Family → Base → Material (optional) | Choosing one filters the next dropdown when Material is used |
| **Aside fields** | Index, Color, **Power range** (Coating not identity) | Separate lists / Attributes tabs |
| **After the parent** | Each selected power range → a **variant** → matrix powers | Stock is per variant; SV, KT, and V2 each have their own power rules |

One **parent** = family + base + material (if any) + index + color.  
One **variant** = that parent + one power-range attribute (own SKU, name, price, stock later).  
Admin picks the parent attrs once and can attach many ranges.

---

## How we will add a product (in the admin)

1. Choose **lens family** — Single Vision (SV), Kryptok (KT), or Progressive (V2).  
2. Choose **base** — HC, BRC, or ARC.  
3. Choose **material** — what belongs under that base (Plain, UC, Tintable, Poly, PG, PG Poly, …).  
4. Fill **aside** fields — Index, Coating, and Color (Color for tinted / tintable lenses).  
5. Save the **product** (identity without power).  
6. Attach **power range(s)** — normal bands (e.g. −6…+2) and/or cross ranges where that family allows.  
7. The system creates **each power** for stock using that family’s power rules.

Master lists (families, bases, materials, indexes, coatings, colours) can be edited later without rebuilding everything by hand.

---

## Flowchart A — core hierarchy

```
                    ┌─────────────────┐
                    │  LENS FAMILY    │
                    │  SV · KT · V2   │
                    └────────┬────────┘
                             │ filters
                             ▼
                    ┌─────────────────┐
                    │  BASE           │
                    │  HC · BRC · ARC │
                    └────────┬────────┘
                             │ filters
                             ▼
                    ┌─────────────────┐
                    │  MATERIAL       │
                    │  Plain · UC     │
                    │  Tintable       │
                    │  Poly · PG      │
                    │  PG Poly        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  PRODUCT        │
                    │  + Index        │
                    │  + Coating      │
                    │  + Color        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  POWER RANGE(s) │
                    │  normal and/or  │
                    │  cross          │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  EACH POWER     │
                    │  (stock)        │
                    └─────────────────┘
```

**Materials under each base:**

```
HC ──┬── Plain
     ├── UC
     ├── Tintable
     └── PG

BRC ─┬── Plain
     ├── UC
     ├── Tintable
     ├── Poly
     ├── PG
     └── PG Poly

ARC ─┬── Plain
     ├── UC
     ├── Tintable
     └── (other materials used with ARC)
```

---

## Flowchart B — aside fields (Index, Coating, Color)

These sit beside the core path (own lists, not under material).

```
                         CORE PATH
                    Family → Base → Material
                              │
                              │  also attach
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ INDEX           │  │ COATING         │  │ COLOR           │
│                 │  │                 │  │ (tint)          │
│ 1.49 · 1.56     │  │ Green, Blue,    │  │ For tinted /    │
│ 1.59 · 1.61     │  │ Mari-Blue,      │  │ tintable lenses │
│ 1.67 · 1.74     │  │ Violet, …       │  │                 │
│                 │  │                 │  │                 │
│ Thickness       │  │ Coat / surface  │  │ Tint colour     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
                              ▼
                    PRODUCT → power ranges → each power
```

| Aside field | Plain meaning |
|-------------|----------------|
| **Index** | How thin the lens is (1.56, 1.67, …) |
| **Coating** | Surface / coat label (e.g. green, Mari-Blue, violet) |
| **Color** | Tint colour for tinted / tintable lenses |

---

## Power ranges and each power (by family)

| Family | Power ranges / stock |
|--------|----------------------|
| **SV** | SPH and CYL (0.25 steps). Cross is a type of power range. |
| **KT** | SPH/CYL plus ADD, AXIS, and cross ranges where used. |
| **V2** | SPH/CYL plus ADD, EYE (left/right), and AXIS where used. |

```
                    PRODUCT
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   Normal range   Normal range   Cross range
   e.g. −6…+2     e.g. −8…+2
         │             │             │
         ▼             ▼             ▼
   Each power     Each power     Each power
   (stock)        (stock)        (stock)
```

---

## Names — short and full

### Lens family

| Short | Full name |
|-------|-----------|
| SV | Single Vision |
| KT | Kryptok |
| V2 | Progressive |

### Base

| Short | Full name |
|-------|-----------|
| HC | Hard Coat |
| BRC | Blue Ray Cut / Blue Cut |
| ARC | Anti-Reflective Coating |

### Material / kind

| Short | Full name |
|-------|-----------|
| Plain | Standard (no special material) |
| UC | Uncoated |
| Tintable | Can be tinted / dyed |
| Poly | Polycarbonate |
| PG | Photochromic (darkens in sunlight) |
| PG Poly | Photochromic + Polycarbonate |

### Index

| Value | Meaning |
|-------|---------|
| 1.49 | Standard thickness |
| 1.56 | Common mid thickness |
| 1.59 / 1.60 | Thinner (often poly class) |
| 1.61 | High index — thinner |
| 1.67 | High index — thinner still |
| 1.74 | Ultra thin |

### Coating and Color

| Field | Examples | Used for |
|-------|----------|----------|
| **Coating** | Green, Blue, Mari-Blue, Violet, … | Coat / surface on the lens |
| **Color** | Tint colours | Tinted / tintable lenses |

---

## Examples

**Example 1 — SV hard coat + UC**  
SV → HC → UC → Index 1.56 → Coating as needed → Color if tinted → normal range −6…+2 → each power stock.

**Example 2 — SV blue-cut polycarbonate**  
SV → BRC → Poly → Index 1.59 → Coating Green → ranges → powers.

**Example 3 — SV with a cross power range**  
Same product identity → cross range → each cross power stock (SV rules).

**Example 4 — KT photochromic hard coat**  
KT → HC → PG → Coating as used → ranges with ADD / AXIS / cross per KT rules.

**Example 5 — V2 blue-cut PG Poly**  
V2 → BRC → PG Poly → Index 1.56 → Coating Green → ranges with eye / ADD per V2 rules.

---

## Summary

**Core:** Family → Base (HC · BRC · ARC) → Material → Product.  
**Aside:** Index · Coating · Color.  
**Powers:** Ranges (normal and/or cross) → each power stock, with rules per family (SV / KT / V2).
