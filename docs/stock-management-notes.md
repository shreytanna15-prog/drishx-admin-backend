# Stock management — future notes

Client feedback captured during Product Catalog review (Oct 2026).  
**Not** part of the current [product catalog](./product-catalog/) build. Use when starting inventory / procurement work.

Related trackers: [RW-08](./remaining-work.md#rw-08--procurement-purchase-order--receive--close-power-wise) (procurement), [RW-06](./remaining-work.md#rw-06--reports-module-client-report-catalog-phased) (reports).

---

## Two ways to update stock

Stock quantity must **not** be a free editable field (e.g. change 20 → 25 with no reason).

| Path | What happens |
|------|----------------|
| **1. Procurement (purchase receipt)** | Receive goods against a PO → accepted qty updates stock |
| **2. Stock adjustment** | Controlled form: current qty, counted qty, reason, ± adjustment |

### Stock adjustment (illustrative)

- Product / power SKU (e.g. `HC · 1.56 · Blue Cut · SPH −2.00 / CYL 0.00`)
- Current quantity
- Counted quantity
- Reason (e.g. physical stock count discrepancy)
- Quantity adjustment (± units)

Record at least: who submitted, who approved (if approval is required), when, and resulting balance.

**Open:** confirm whether every adjustment needs a second-person approve, or some roles can submit + apply with audit only.

---

## Linked modules (Stock Management)

Client-confirmed module list:

1. **Stock Overview** — Physical stock, reserved stock, available stock, shortages  
2. **Power-wise Inventory** — Search/filter every stock SKU by product, power, quantity, location  
3. **Stock Transactions** — Ledger of receipts, sales deductions, returns, transfers, adjustments  
4. **Purchase Receipts** — Receive against POs; accepted / rejected quantities  
5. **Stock Adjustments** — Opening balances, physical counts, damage, loss, corrections  
6. **Returns & Replacements** — Customer returns, supplier returns, replacement fulfilment, inspection  
7. **Stock Transfers** — Dispatch, in-transit, receipt between locations  
8. **Reorder Rules** — Min thresholds, target quantities, incoming supply, procurement suggestions  
9. **Stock Reports** — Movement history, valuation, ageing, stock discrepancies  

**Open:** single warehouse first vs multi-location required in v1 (affects #2 and #7).

---

## Boundary with Product Catalog

| Product catalog (now) | Stock management (later) |
|-----------------------|--------------------------|
| Attributes, create product, list/grid, matrix UI placeholders | Live quantities, receipts, adjustments, reorder, reports |
| Matrix cells `_ / _ / _` display only | Current / threshold / target (and edits via #4 / #5) |
