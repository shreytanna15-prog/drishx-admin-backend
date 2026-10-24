# Product catalog — attribute tables & hierarchy

**Status:** Analysis + target model (not implemented yet)  
**Audience:** Product + engineering  
**Generated:** 24 Oct 2026  
**Data snapshot:** Live Postgres via `npm run analyze:catalog-hierarchy` + `npm run audit:catalog`

| Legacy table | Rows (live) | Product groups | In shop |
|--------------|-------------|----------------|---------|
| `SingleVisionLens` | 274 | 37 | Yes |
| `KryptokLens` | 278 | 13 | Yes |
| `ProgressiveLens` | 91 | 16 | Yes |
| `OriVisionLens` / `MagnusLens` / `BifocalLens` | 0 | — | Empty |
| `CatalogProductLine` (wholesale cards) | 23 | — | Shop cards |
| `CoatingFilterLabel` | 25 | — | Filter chips |

---

## 0. What we are looking for

The new catalog must make **attributes first-class** (admin-editable tables), then compose them into:

1. **Product identity** (no power) — e.g. SV + HC + UC + Blue + 1.56  
2. **Power ranges** attached to that identity — e.g. −6.00…+2.00 / CYL band  
3. **Power-wise SKUs** (stock units) — each 0.25 SPH×CYL cell is its own sellable row  

Everything else (live stock, procurement, cart, orders) hangs off the **power-wise SKU**.

Admin create UX = **partial** cascade (like state → city → area), **plus** aside fields (like Union Territory on a map — available, not forced as a normal city child):

```
Core:   Family → Base (HC · BRC · ARC) → Material (PLAIN · UC · TINTABLE · POLY · PG · PG_POLY)
Aside:  Index · Coating · Color (tint)   (parallel picks; Color ≠ Coating)
Then:   attach range(s) including cross-as-range-type → generate power-wise SKUs
        (power fields/rules differ by family SV | KT | V2)
```

Locked structure: ARC = base with HC/BRC; UC/Tintable = materials; Coating ≠ Color (tint); Cross = range type; power rules differ by family.

See **§2.0 Final flowcharts** (core vs aside).

---

## 1. Attribute tables (short name + full form)

These are the **master data categories**. Prefer DB rows (rename / deactivate) over hard enums.

### 1.1 Lens family

| Short | Full form | Shop / DB today | Notes |
|-------|-----------|-----------------|-------|
| **SV** | Single Vision | `SINGLE_VISION` / wholesale `single-vision` | Distance / near one focus |
| **KT** | Kryptok (flat-top bifocal style line in this shop) | `KRYPTOK` | Needs ADD + AXIS on powers |
| **V2** / **PG-V2** | Progressive (V2 line) | `PROGRESSIVE` | Needs ADD + EYE (+ AXIS variants) |

*Industry:* SV = single vision; progressive = multifocal progressive; kryptok = common India wholesale name for a bifocal / kryptok segment line.

### 1.2 Base (coating / treatment family)

In India wholesale these sit next to hard-coat vs blue-cut lines.

| Short | Full form | Meaning | In live DrishX cards? |
|-------|-----------|---------|------------------------|
| **HC** | Hard Coat (also H/C, Hardcoat) | Scratch-resistant hard coat; typically **no** full AR stack | Yes — `H/C`, `HC KT`, `HC V2` |
| **ARC** | Anti-Reflective Coating (AR / anti-glare) | Clear lens with AR stack (often HMC/SHMC grade) | **Base peer of HC/BRC** — not a live wholesale card name today |
| **BRC** | Blue Ray Cut / Blue Cut (often with ARC) | Blue-light filter (≈UV420) + usually AR / colour coat | Yes — `BRC`, `BRC KT`, `BRC V2` |

Related coating grades seen in industry + Progressive `type` field:

| Short | Full form |
|-------|-----------|
| **UC** | Uncoated (no hard / AR coat) — also used as a **material** in client language |
| **HMC** | Hard Multi Coating (hard coat + AR) |
| **SHMC** | Super Hydrophobic Multi Coating (premium AR + water-repellent) |

Bases for cascading: **HC / ARC / BRC**. Map legacy:

- Hardcoat / WHITE + type HC → **HC**  
- Progressive type HMC/SHMC on blue-cut lines → usually **BRC** (blue cut) or **ARC** if clear AR-only  
- BLUE CUT / BRC categories → **BRC**

### 1.3 Material / kind modifiers

These **compose with base** (why shop cards say `PG Poly BRC`).

| Short | Full form | Meaning | Typical parents (target) | Evidence in live data |
|-------|-----------|---------|--------------------------|------------------------|
| **PLAIN** | Standard / no modifier | Base only | HC, ARC, BRC | Most rows |
| **UC** | Uncoated blank | Uncoated substrate; tintable at lab | **HC / BRC** (core material) | 1 SV row with coating `UC` |
| **TINTABLE** | Tintable | Can be dyed; color-lens wizard | **HC / BRC** (core material) | Color-lens flow (`tintable`, `tintable-brc`); not a wholesale card |
| **POLY** | Polycarbonate | Impact-resistant material (~index 1.59) | Mostly **BRC** in production cards | `Poly BRC`, `POLY BRC KT`, `Poly BRC V2` |
| **PG** | Photochromic / Photogrey | Darkens in sun (Transitions-style) | HC, BRC | `PG H/C`, `PG BRC`, `PG HC KT`, `PG BRC V2` |
| **PG_POLY** | Photochromic polycarbonate | PG + Poly | **BRC** | `PG Poly BRC`, `PG Poly BRC V2` |

*Industry:* Photochromic ≈ light-adaptive; Polycarbonate ≈ impact-resistant plastic (~1.586–1.59). CR-39 ≈ 1.499 standard plastic.

### 1.4 Refractive index

| Short | Full form / typical material | Live SV row counts (approx.) |
|-------|------------------------------|------------------------------|
| **1.49 / 1.499** | Standard plastic (CR-39 class) | Color wizard poly default 1.499; rare as stored SV index |
| **1.56** | Mid-index resin (very common blue-cut) | 83 |
| **1.59 / 1.6** | Often polycarbonate / mid-hi | 45 + 28 |
| **1.61** | High-index (e.g. MR-8 class) | 11 |
| **1.67** | High-index thin | 80 |
| **1.74** | Ultra high-index | 26 |

Higher index → thinner lens for same power; usually lower Abbe (more chromatic aberration).

### 1.5 Coating (aside — surface / coat label)

**Separate from Color.** Flat master list. Examples from live filters / production:

| Coating examples | Notes |
|------------------|--------|
| GREEN, BLUE, Blue Coat | Common coat labels |
| Mari-Blue / INVISIBLE MARI-BLU | Coating |
| VIOLET, PURPLE | Coat labels |
| HC, HMC, SHMC | Grade-style coats (esp. KT / Progressive type) |
| CLIK COAT, LR Green, … | Brand / marketing coats |

Admin maintains a **Coating** master (`CoatingFilterLabel` is today’s shop chip cousin).

### 1.6 Color (aside — tint for tinted lenses)

**Separate from Coating.** Used for **tinted / tintable** lenses. Own master list (hex optional).  
Do not store Mari-Blue / green coat names here — those are **Coating**.

### 1.6b Mapping former “special lines”

| Old label | Correct home |
|-----------|----------------|
| Cross | **Power range type** (see §1.7 / §2.0c) |
| Mari-Blue | **Coating** |
| Violet (coat) | **Coating** |
| Dual / Eyeconic-DUAL | Coating or product naming (TBD) |

### 1.7 Power range (under product identity)

| Concept | Meaning |
|---------|---------|
| **Range** | Named SPH/CYL band, e.g. −6×2, −8×2 (price-sheet slice) |
| **Power step** | **0.25** diopter |
| **Power-wise SKU** | One stock row per sellable SPH×CYL (and KT/PG extras) |

**Range types:** normal SPH/CYL band **or** **cross** (cross-cylinder). Cross is a range/power shape — not a catalog “special line”.

**Family-specific power rules:**

| Family | Power / range extras |
|--------|----------------------|
| SV | SPH, CYL; cross ranges |
| KT | SPH, CYL, ADD, AXIS; cross ranges |
| V2 | SPH, CYL, ADD, EYE, AXIS as used |

Legacy today stores **range bands** as rows (`sphStartRange`…`sph`). Target: expand bands into exact-power leaves (`CatalogLeafStorage.POWER_WISE`).

---

## 2. Hierarchy flowchart

### 2.0 Final flowcharts — core cascade vs aside (do not force everything)

**Rule:** Only attributes that consistently parent each other go in the cascade.  
Rare / flat / special attributes stay **aside** (UT analogy: on the map, not a normal city under a state).

#### Flowchart A — core hierarchy (filters next dropdown)

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
                    │  (peers)        │
                    └────────┬────────┘
                             │ filters
                             ▼
                    ┌─────────────────┐
                    │  MATERIAL       │
                    │  PLAIN · UC     │
                    │  TINTABLE       │
                    │  POLY · PG      │
                    │  PG_POLY        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  PRODUCT        │
                    │  IDENTITY       │
                    │  + Index/Coat/  │
                    │    Color (B)    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
     ┌─────────────────┐          ┌─────────────────┐
     │ CatalogRange    │   …      │ CatalogRange    │
     └────────┬────────┘          └────────┬────────┘
              ▼                             ▼
     ┌─────────────────┐          ┌─────────────────┐
     │ Power-wise SKUs │          │ Power-wise SKUs │
     │ (0.25 cells)    │          │                 │
     └─────────────────┘          └─────────────────┘
```

**Core material parents:**

```
HC ──┬── PLAIN
     ├── UC
     ├── TINTABLE
     └── PG

BRC ─┬── PLAIN
     ├── UC
     ├── TINTABLE
     ├── POLY
     ├── PG
     └── PG_POLY

ARC ─┬── PLAIN
     ├── UC?
     ├── TINTABLE?
     └── (extend as product uses ARC)
```

UC / Tintable under HC / BRC as core Material children.

#### Flowchart B — aside attributes (Index · Coating · Color)

```
              Family → Base → Material  (core)
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ INDEX        │ │ COATING      │ │ COLOR (tint)     │
│ (aside)      │ │ (aside)      │ │ (aside)          │
│              │ │              │ │                  │
│ Flat master  │ │ Flat master  │ │ Flat master for  │
│ 1.49…1.74    │ │ GREEN,       │ │ tinted lenses    │
│ Soft default │ │ Mari-Blue,   │ │ ≠ Coating        │
│ from material│ │ VIOLET, …    │ │                  │
└──────────────┘ └──────────────┘ └──────────────────┘
        │                │                │
        └────────────────┴────────────────┘
                         │
                         ▼
              PRODUCT IDENTITY → ranges (normal | cross) → leaves
```

| Aside | Why not in core tree |
|-------|----------------------|
| Index | Not a structural child of coating/color |
| Coating | Flat coat list (includes Mari-Blue etc.) |
| Color | Tint field only; **separate from Coating** |

#### Flowchart C — power ranges by family

```
PRODUCT
   │
   ├── Normal range(s)     e.g. −6×2, −8×2
   └── Cross range(s)      power-range TYPE (not a product line)
          │
          ▼
   Expand to power-wise SKUs using FAMILY rules:
   SV → SPH/CYL (+ cross)
   KT → SPH/CYL + ADD + AXIS (+ cross)
   V2 → SPH/CYL + ADD + EYE (+ AXIS as used)
```

Client-facing twin: `CLIENT-HIERARCHY-CONFIRMATION.md`.

### 2.1 Cascade (admin create product) — full optional chain

*Prefer §2.0: Index & Color are **aside**, not required cascade steps.*

```
┌──────────────────┐
│  1. LENS FAMILY  │  SV | KT | V2
└────────┬─────────┘
         ▼
┌──────────────────┐
│  2. BASE         │  HC | BRC | ARC
└────────┬─────────┘
         ▼
┌──────────────────┐
│  3. MATERIAL     │  PLAIN / UC / TINTABLE / POLY / PG / PG_POLY
└────────┬─────────┘
         ▼
┌──────────────────┐
│  4. INDEX        │  ASIDE flat list (optional soft default)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  5. COATING      │  ASIDE flat list (Mari-Blue, green, …)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  6. COLOR        │  ASIDE tint list (≠ coating)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  7. PRODUCT ID   │  unique identityKey / SKU prefix
└────────┬─────────┘
         ▼
┌──────────────────┐
│  8. RANGE(s)     │  normal and/or cross; family power rules
└────────┬─────────┘
         ▼
┌──────────────────┐
│  9. POWER SKUs   │  generate grid → stock leaves
└──────────────────┘
```

### 2.2 Family → base → material (target tree)

```
SV
├── HC
│   ├── PLAIN      → shop card "H/C"
│   ├── UC         → material under HC
│   ├── TINTABLE   → material under HC
│   └── PG         → shop card "PG H/C"
├── ARC            → base peer of HC/BRC
│   ├── PLAIN
│   ├── UC?
│   └── TINTABLE?
└── BRC
    ├── PLAIN      → "BRC" / "BRC 1.67"
    ├── UC         → material under BRC
    ├── TINTABLE   → tintable-brc
    ├── POLY       → "Poly BRC"
    ├── PG         → "PG BRC"
    └── PG_POLY    → "PG Poly BRC"
    (coatings like Mari-Blue / Violet live on Coating aside — not here)

KT
├── HC
│   ├── PLAIN      → "HC KT"
│   └── PG         → "PG HC KT"
└── BRC
    ├── PLAIN      → "BRC KT"
    ├── POLY       → "POLY BRC KT"
    └── PG         → "PG BRC KT"
    (+ special: CROSS)

V2 (Progressive)
├── HC
│   ├── PLAIN      → "HC V2"
│   └── PG         → "PG HC V2"
└── BRC
    ├── PLAIN      → "BRC V2"
    ├── POLY       → "Poly BRC V2"
    ├── PG         → "PG BRC V2"
    └── PG_POLY    → "PG Poly BRC V2"
```

### 2.3 How wholesale cards encode the same tree

Live `CatalogProductLine` names **are** base×material×family:

| Card | Family | Base | Material |
|------|--------|------|----------|
| H/C | SV | HC | PLAIN |
| PG H/C | SV | HC | PG |
| BRC | SV | BRC | PLAIN |
| Poly BRC | SV | BRC | POLY |
| PG BRC | SV | BRC | PG |
| PG Poly BRC | SV | BRC | PG_POLY |
| BRC 1.67 | SV | BRC | PLAIN + index 1.67 |
| HC KT | KT | HC | PLAIN |
| PG HC KT | KT | HC | PG |
| BRC KT | KT | BRC | PLAIN |
| PG BRC KT | KT | BRC | PG |
| POLY BRC KT | KT | BRC | POLY |
| CROSS | KT | — | **cross power range** (not a product line) |
| HC V2 | V2 | HC | PLAIN |
| PG HC V2 | V2 | HC | PG |
| BRC V2 | V2 | BRC | PLAIN |
| Poly BRC V2 | V2 | BRC | POLY |
| PG BRC V2 | V2 | BRC | PG |
| PG Poly BRC V2 | V2 | BRC | PG_POLY |

---

## 3. Compatibility matrix (what belongs to what)

### 3.1 Target rules (for admin link tables)

| Material | Allowed bases | Allowed families | Notes |
|----------|---------------|------------------|-------|
| PLAIN | HC, ARC, BRC | SV, KT, V2 | Default |
| UC | **HC, BRC**; ARC optional | SV (primary); confirm KT/V2 | Core material |
| TINTABLE | **HC, BRC**; ARC optional | SV; color wizard hides some for KT/V2 | Core material |
| POLY | **BRC** (primary) | SV, KT, V2 | Production cards are Poly+BRC |
| PG | HC, BRC | SV, KT, V2 | Photochromic |
| PG_POLY | **BRC** | SV, V2 (KT: confirm) | Production: SV + Progressive |

Index defaults (soft):

| Material | Default index |
|----------|---------------|
| POLY / PG_POLY | ~1.49–1.59 (poly class) |
| Others | 1.56 common; allow 1.61 / 1.67 / 1.74 |

Coating / Color: **no hard parent** under material — both aside; Color = tint only.

### 3.2 Observed from live inference (24 Oct 2026)

Script: `scripts/analyze-catalog-hierarchy.mjs` → `hierarchy-compatibility.json`

| Family | Base (inferred) | Materials seen |
|--------|-----------------|----------------|
| SV | HC | PLAIN |
| SV | BRC | PLAIN, POLY, PG, PG_POLY |
| SV | UNKNOWN | PLAIN, UC (tiny) |
| KT | HC | PLAIN, PG |
| KT | BRC | PLAIN, POLY, PG |
| Progressive | HC | PLAIN, PG |
| Progressive | BRC | PLAIN, POLY, PG, PG_POLY |

**Takeaway:** Production already behaves like **HC + (PLAIN|PG)** and **BRC + (PLAIN|POLY|PG|PG_POLY)**. Seed **ARC** as a base master and **UC / TINTABLE** as material masters under HC/BRC even if rare in old stock rows.

---

## 4. How each product looks

### 4.1 Three layers (always)

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER A — Attribute masters (admin tables)                  │
│ Family, Base, Material, Index, Coating, Color (+ link rules) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER B — Product identity (1 row)                          │
│ SV | BRC | POLY | index 1.59 | color GREEN                  │
│ identityKey / displayName e.g. "SV · Poly BRC · 1.59 · GREEN"│
│ default price, status ACTIVE/HELD/ARCHIVED                  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        Range −6×2      Range −8×2      Range +6 …
              │               │
              ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER C — Power-wise SKUs (many rows)                       │
│ Each: SPH/CYL (exact), qty, price, link to Order/PO/stock   │
│ Example: SPH -4.25, CYL -0.75  ≠  SPH -4.00, CYL -0.75     │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Example A — Single Vision hardcoat plain

| Field | Value |
|-------|--------|
| Family | SV — Single Vision |
| Base | HC — Hard Coat |
| Material | PLAIN |
| Index | 1.56 |
| Color | (none) / clear |
| Display | `SV · H/C · 1.56` |
| Legacy map | category `Hardcoat`, empty coating, shop card `H/C` |
| Range example | −6×2 → generates powers SPH 0…−6 / CYL 0…−2 step 0.25 |
| One SKU | `SV|HC|PLAIN|1.56|clear|SPH=-2.00|CYL=-1.00` |

### 4.3 Example B — Single Vision blue-cut polycarbonate green

| Field | Value |
|-------|--------|
| Family | SV |
| Base | BRC — Blue Ray Cut |
| Material | POLY — Polycarbonate |
| Index | 1.59 |
| Color | GREEN |
| Display | `SV · Poly BRC · 1.59 · GREEN` |
| Shop card | `Poly BRC` |
| SKU example | same identity + `SPH=-4.25, CYL=-0.75` **own stock** |

### 4.4 Example C — Client’s UC example

| Field | Value |
|-------|--------|
| Family | SV |
| Base | HC |
| Material | UC — Uncoated |
| Index | 1.56 |
| Color | Blue (tint later) |
| Display | `SV · HC · UC · 1.56 · Blue` |
| Ranges | e.g. −6…+2 and separately −8…+2 |
| Power-wise | −4.25/−0.75 and −4.00/−0.75 are **two SKUs** |

### 4.5 Example D — Kryptok PG HC

| Field | Value |
|-------|--------|
| Family | KT |
| Base | HC |
| Material | PG |
| Index | (often N/A on KT rows today) |
| Color / coating | HC |
| Display | `KT · PG HC · coating HC` |
| Shop card | `PG HC KT` |
| Power extras | ADD +1 or +3; AXIS ±45/90/135/180 |

### 4.6 Example E — Progressive PG Poly BRC V2

| Field | Value |
|-------|--------|
| Family | V2 Progressive |
| Base | BRC |
| Material | PG_POLY |
| Index | 1.56 |
| Color | Green |
| Type grade | SHMC (legacy Progressive.type — map under ARC/BRC grade) |
| Shop card | `PG Poly BRC V2` |
| Power extras | ADD +3; EYE LEFT/RIGHT; AXIS set |

### 4.7 Cart / order line (what customer “buys”)

Not the range. Not only “Poly BRC”. The line is:

```
Family + Base + Material + Index + Color
+ exact power (SPH/CYL [+ ADD/AXIS/EYE])
+ quantity
```

That exact-power SKU is what stock decrement, PO receive, and reorder rules use.

---

## 5. Legacy field mapping (old → new)

| New attribute | Single Vision fields | Kryptok fields | Progressive fields |
|---------------|----------------------|----------------|--------------------|
| Family | table = SV | table = KT | table = Progressive |
| Base + Material | Inferred from category/brand/item + wholesale matcher | `category` + coating rules | `category` + `item` + `type` |
| Index | `index` | often unused | `index` |
| Coating | `coating` | `coating` | `coating` (+ `type` as grade) |
| Color (tint) | (future / color-lens) | — | — |
| Product group | category\|brand\|item\|index\|coating | category\|brand\|coating | category\|brand\|item\|index\|type\|coating |
| Power band | sph/cyl + start ranges | + add, axis, cross | + add, axis, eye |

Wholesale resolution code (keep for migration):

- `app/lib/single-vision-wholesale-catalog.ts`  
- `app/lib/kryptok-wholesale-catalog.ts`  
- `app/lib/progressive-wholesale-catalog.ts`  

---

## 6. Recommended admin data model (for implementation later)

```
LensFamily          (SV, KT, V2) — code, name, sortOrder, isActive
LensBase            (HC, ARC, BRC) — code, name, …
LensMaterial        (PLAIN, UC, TINTABLE, POLY, PG, PG_POLY)
LensIndex           (1.49, 1.56, …) — value Decimal, label
LensCoating         (GREEN, Mari-Blue, VIOLET, …) — coat labels
LensColor           (tint colours) — name, hex?, isActive

LensBaseFamily      (which bases under which family)          — M2M / link
LensMaterialBase    (which materials under which base)       — M2M / link
LensMaterialIndex   (default/allowed indexes per material)   — M2M / link

CatalogProduct      FKs → family, base, material, index, coating, color?
                    + identityKey unique + prices + status
CatalogRange        productId + sph/cyl bounds + label
CatalogRangeLeaf / power SKU
                    exact power + qty → linked to legacy lens id during migration
```

Create-product UI loads children from link tables only (state → city → area pattern).

---

## 7. Sources & how to refresh

| Source | Role |
|--------|------|
| `npm run analyze:catalog-hierarchy` | Live distinct values + inferred base/material tree |
| `npm run audit:catalog` | Full band / power-shape audit |
| `docs/lens-catalog-from-production.md` | Prior production inventory |
| `docs/remaining-work.md` RW-09 | Meeting hierarchy: type → kind → index → coating → ranges |
| `docs/lens-domain-logic.md` | SPH/CYL/ADD/AXIS rules |
| Web / industry | UC/HC/HMC/SHMC coating stack; indexes; poly ~1.59; PG = photochromic; India BRC ≈ blue cut (+ ARC) |

**Open client confirms**

1. Which materials under **ARC** (Plain / UC / Tintable / others)?  
2. Whether KT/V2 sell **UC** / **Tintable**.  
3. Confirm **Poly under HC** exists or BRC-only.  
4. Canonical **Coating** vs **Color (tint)** lists; migrate legacy `coating` strings → Coating master.

---

## 8. One-page summary

| Track | Attributes |
|-------|------------|
| **Core cascade** | Family → Base (HC/BRC/ARC) → Material (PLAIN/UC/TINTABLE/POLY/PG/PG_POLY) |
| **Aside** | Index · Coating · Color (tint; ≠ coating) |
| **Then** | Product → Ranges (normal \| cross) → power-wise SKUs (family rules) |

**Hierarchy (forced):** Family → Base → Material → Product → Ranges → Powers.  
**Aside:** Index, Coating, Color. **Cross** = range type. **SV/KT/V2** power rules differ.

**Product example:** Core `SV + HC + UC` + aside `index 1.56` + `coating …` + tint color if needed + range `−6…+2` (or cross) → power SKUs.
