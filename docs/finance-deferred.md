# Finance & GST — deferred for client

These items from the Finance PDF are **intentionally not built** in this delivery. Architecture leaves room to add them later without rewriting invoicing.

| Item | Why deferred | When to revisit |
|------|----------------|-----------------|
| NIC **e-Invoice** / **e-Way Bill** live APIs | Needs GST portal credentials, IRP integration, legal sign-off | After company GSTIN live + CA confirms filing process |
| **Payment gateway** (Razorpay etc.) | Client chose payment **claims** (UTR → admin confirm) | If customers should pay inside the app |
| **Hard credit-limit block** | Warn-only protects wholesale ops; block needs written credit policy | After credit limits are maintained on all customers |
| Bank statement **CSV / OFX import** reconciliation | Manual cash reconcile exists; bank file parse is a separate project | When accountant requests monthly bank match |
| Full **Chart of Accounts UI** / trial balance / journals for CA | Backend CoA + journal postings exist; no accountant UI | If a CA will work inside DrishX daily |
| Auto-approval threshold for tiny expenses | Approval queue exists; threshold is config polish | After expense volume is clear |

## What shipped (summary)

- GST sales invoices (auto on order) with HSN/GST, place-of-supply, FY numbering, PDF
- Customer payment claims (web + mobile) + admin confirm
- Receivables / aging / customer ledger
- Credit notes with tax + AR reduction
- Purchase bills, payables, supplier payments
- Company / employee cash + no-bill expense approval (mobile submit)
- GST summary, HSN, power-wise reports
- Finance settings (company GSTIN, defaults)
