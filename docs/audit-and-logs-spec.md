# DrishX — Audit & Logs Module (Client Specification)

**Document type:** Product requirements (client)  
**Implementation:** See `app/lib/audit/` and Admin → Audit & Logs  
**Related:** [`DrishX_Operations_Role_Capability_Specification.md`](./DrishX_Operations_Role_Capability_Specification.md)

---

## Purpose

Enterprise-grade audit trail for DrishX: who did what, when, where, to which record, before/after values, why, source (human/system), and correlation across order → procurement → inventory → finance.

**Principle:** If an action can change fulfilment, inventory, cash, pricing, permissions, or configuration — there must be a permanent record.

---

## Three log categories

| Category | Use |
|----------|-----|
| **Audit Log** | Accountability — immutable, before/after, reason codes |
| **Activity Log** | Operational timeline — human-readable (“Order moved to Packing”) |
| **Security / Error Log** | Auth events, access denied, API/system failures |

Do not mix these into one UI table.

---

## Access (v1)

| Role | Access |
|------|--------|
| **Admin** | Full audit trail, security, export |
| **Employee** | Own actions + assigned orders + own procurement/expenses |
| **Customer** | No internal audit |

---

## Audit event structure

Every audit event includes:

- Audit ID (`AU-000001`)
- Timestamp, actor type (HUMAN / SYSTEM / AUTOMATION / INTEGRATION)
- Actor user + denormalized name
- Action code, module, entity type + ID
- Before/after changes (JSON)
- Reason code + text (required for sensitive actions)
- Source: WEB / MOBILE / ADMIN / SYSTEM
- IP, user-agent, correlation ID
- Result: SUCCESS / FAILURE
- Related refs (orderId, transactionId, etc.)
- Context (order number, power, SKU label)

**Immutability:** No edit/delete via application. Corrections = new event (e.g. `PRICE_CHANGE_CORRECTED`).

---

## Modules to audit

Authentication, Users & Roles, Customers, Products/SKU, Inventory, Orders, Procurement, Finance, Company Cash (future), Suppliers (future), Returns, Notifications, System automation, Configuration.

---

## P0 event codes (minimum)

### Authentication
`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`, `ACCOUNT_LOCKED`

### Users
`USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `ROLE_CHANGED`, `CUSTOMER_APPROVED`, `CUSTOMER_REJECTED`

### Orders
`ORDER_CREATED`, `ORDER_UPDATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`, `ORDER_ARCHIVED`, `ORDER_REASSIGNED`, `PRESCRIPTION_CHANGED`, `PICKED_QUANTITY`

### Inventory
`STOCK_RECEIVED`, `STOCK_DECREMENTED`, `STOCK_INCREMENTED`, `STOCK_ADJUSTED`, `STOCK_PICKED`, `STOCK_RESTORED`

### Finance
`EXPENSE_CREATED`, `EXPENSE_VOIDED`, `PAYMENT_CREATED`, `PAYMENT_REVERSED`, `CREDIT_NOTE_ISSUED`

### Returns
`RETURN_SUBMITTED`, `RETURN_DECISION_*`

### Lenses / catalog
`LENS_CREATED`, `LENS_UPDATED`, `SKU_DISABLED`, `PRICE_CHANGED`

### System
`SYSTEM_ORDER_COVERAGE_RECALCULATED`, `ACCESS_DENIED`

### Future (hooks reserved)
`AUTO_PROCUREMENT_TRIGGERED`, `REORDER_RULE_UPDATED`, `CASH_ALLOCATED`, `CASH_SPENT`, `SUPPLIER_UPDATED`

---

## Reason codes (sensitive actions)

**Stock adjustment:** physical_mismatch, damaged, counting_error, wrong_entry, other  
**Order cancel:** customer_cancelled, payment_issue, unavailable, duplicate, other  
**Price change:** supplier_cost, promotional, correction, other

---

## Policy

- **No silent changes** to order qty, prescription, stock, price, payment, cash, thresholds
- **Financial history:** void/reversal, not delete
- **Failed actions** logged (login fail, access denied, validation failure on mutations)
- **Retention:** Audit long-term; system error logs shorter (configurable)

---

## QA acceptance (summary)

- Every critical mutation generates audit event with actor + timestamp + entity
- Before/after where applicable; reason on sensitive changes
- System vs human distinguished
- Audit entries not editable/deletable via UI
- Entity timelines on Order, Return, SKU
- Correlation ID traces cross-module flows

See client full document for detailed examples (order timeline, procurement timeline, stock adjustment, company cash).
