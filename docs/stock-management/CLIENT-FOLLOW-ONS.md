# Stock-related follow-ons (other modules)

**Audience:** Client + product  
**Status:** Agreed in discussion; **scheduled after** Stock Management ([CLIENT-PLAN.md](./CLIENT-PLAN.md))

These points came from the same review notes as stock. They stay in this file so nothing is lost, without mixing full UX into the stock build.

**Stock CLIENT-PLAN already requires** the quantity effects: reserve/release, pack deduct, return/reversal movements, and receive Excel side-by-side vs PO. Below is **full order/returns/finance UX and policy** after stock.

---

## 1. Orders — live vs non-live & reserve

| Topic | Intent |
|-------|--------|
| Non-live stock order | Place order → **reserve** stock as per order |
| Live stock (customer) | Only for items that are **available** → place order → **reserve** |
| Reserve math | Uses available (see stock plan); shortage / procurement path when not enough |

**Module:** Orders / checkout (admin + shop).  
**After:** Stock S4 (available / reserved / blocked stable).

---

## 2. Orders — cancel

| When | Intent |
|------|--------|
| Cancel **after reserve**, before pack; procurement already raised | **Release** reserved qty back to available; **cancel** related procurement demand where appropriate |
| Cancel **after stock deducted** (packed) | **Return to stock** with proper audited stock transactions (same atomic consistency as other stock posts) |

**Module:** Orders + Dispatch + light Procurement cancel rules.  
**Stock plan link:** movements must support release / return; full cancel screens are Orders.

---

## 3. Orders — modify / controlled reversal

| Topic | Intent |
|-------|--------|
| Default | Prefer **no silent edit** of an order — place a **new** order where needed |
| If modification allowed | **Admin approval** before changing the original order |
| Controlled reversal | Picked quantities → **return-to-stock** workflow; unpicked quantities simpler (release reserve) |

**Module:** Order modification / reversal (dedicated).  
**Not in stock v1 UI.**

---

## 4. Returns — accept / edit cycle

| Topic | Intent |
|-------|--------|
| Accepted return qty | Return to stock **immediately** (stock movement) |
| Later change | If qty was rejected or customer refuses return of powers, Admin can **edit again** and accept so stock stays correct |

**Module:** Returns & Replacements.  
**Stock plan link:** return movements use the stock leaf (`variant` + SPH + CYL); editable decision UX is Returns.

---

## 5. Finance — weighted average purchase cost

On purchase / receive for the same stock leaf (variant SKU + SPH/CYL):

| Supplier | Qty | Unit cost | Line |
|----------|-----|-----------|------|
| A | 10 | 100 | 1000 |
| B | 20 | 110 | 2200 |
| **Total** | **30** | | **3200** |

**Weighted average** = 3200 ÷ 30 = **106.66**

**Module:** Finance / costing (update on Confirm Receipt or purchase posting).  
**Not required to finish stock qty / matrix / PO receive accept path.**

---

## 6. Sequencing (suggested)

```
Stock Management (CLIENT-PLAN) S1 → S5
        │
        ├── then: Order reserve / live vs non-live (§1)
        ├── then: Cancel release / return-to-stock (§2)
        ├── then: Order modify / reversal (§3)
        ├── then: Returns edit cycle polish (§4)
        └── then: Weighted average cost (§5)
```


