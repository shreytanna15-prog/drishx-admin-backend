# Audit & Logs — QA Checklist (§52)

Use this checklist when validating the audit platform against the client spec in [`audit-and-logs-spec.md`](./audit-and-logs-spec.md).

## Audit trail

- [ ] Every order status change writes an `AuditEvent` with before/after status
- [ ] Order create (retail, wholesale, RX, color) emits `ORDER_CREATED`
- [ ] Alternate power accept emits `PRESCRIPTION_CHANGED` with sph/cyl/axis/add diffs
- [ ] Power-not-available emits `POWER_NOT_AVAILABLE`
- [ ] Stock pick/restore/decrement/increment emits inventory audit with qty before/after
- [ ] Stock intake (procurement expense) emits `STOCK_RECEIVED` and links transaction in `relatedRefs`
- [ ] Income/expense create and void emit finance audit events (no hard-delete of transactions)
- [ ] Return admin decision emits `RETURN_DECISION`; credit path also emits `CREDIT_NOTE_ISSUED`
- [ ] Lens price/qty change emits `PRICE_CHANGED` or `LENS_UPDATED`; SKU delete is soft-disable + `SKU_DISABLED`
- [ ] Order archive (DELETE) sets `archivedAt` — no cascade delete of audit rows

## Security

- [ ] Login success/failure creates `SecurityEvent`
- [ ] Logout creates security event
- [ ] Customer approve/reject creates audit event

## Admin UI

- [ ] `/audit` overview KPIs load for Admin
- [ ] `/audit/trail` lists events with filters and CSV export
- [ ] `/audit/security` lists security events
- [ ] `/audit/errors` lists system errors
- [ ] Order and return detail pages show entity audit timeline tab/section
- [ ] Employee role sees scoped trail only (not other users’ unrelated entities)

## Correlation

- [ ] Web sends `X-Client: web` and `X-Request-Id` on API calls
- [ ] Mobile sends `X-Client: mobile` and `X-Request-Id` on all calls
- [ ] Offline replay sends `X-Offline-Replay: true` with stable request id
- [ ] Web proxy forwards correlation headers to backend

## Retention

- [ ] `AUDIT_RETENTION_DAYS` env (default 90) applies to **SystemErrorLog only**
- [ ] `AuditEvent`, `SecurityEvent`, and business history are never purged by cron
- [ ] Run `npm run audit:purge-errors` periodically in production (optional cron)

## Immutability

- [ ] No API route updates or deletes audit/security tables
- [ ] Prisma models have no `onDelete: Cascade` from business entities into audit tables
