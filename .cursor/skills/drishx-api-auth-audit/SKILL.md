---
name: drishx-api-auth-audit
description: DrishX API route, JWT session, and audit/security logging conventions. Use when adding or changing app/api routes, auth, permissions, security events, or audit trail writes.
---

# DrishX API, Auth, Audit

## API routes

- Live under `app/api/**/route.ts`
- Keep handlers thin: validate → session → call `app/lib/*` → JSON response
- Clients: admin (same origin), web (`BACKEND_URL` proxy), mobile (`EXPO_PUBLIC_BACKEND_BASE_URL` + `X-Client: mobile`)

## Auth

- Access token: `Authorization: Bearer …`
- Helpers: `getSession` / `getSessionOrUnauthorized` in `app/lib/session-auth.ts`
- Password/JWT utils: `app/lib/auth.ts`, session issue: `app/lib/auth-session.ts`
- Admin UI gate: `isAdminUser` + token in `AdminChrome` (client)
- Staff permissions: `app/lib/staff-permissions.ts` / `staff-access.ts` — do not invent role matrices

## Audit / security

- Business trail: `auditEvent` via helpers in `app/lib/audit/*` (`recordAudit…`, request context)
- Auth events: `recordSecurityEvent` → Security page (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, …)
- Always pass `buildAuditRequestContext(req)` so `X-Client: mobile|web` maps to `MOBILE` / `WEB`
- Spec: `docs/audit-and-logs-spec.md` — follow event codes in `app/lib/audit/event-codes.ts`
- Admin UI: `/audit`, `/audit/trail`, `/audit/security`, `/audit/errors`, `/audit/activity`

## Errors

- Prefer existing `AdminApiError` / `auth-errors` response shapes
- Use stable `code` fields clients already handle (`TOKEN_INVALID`, `FORBIDDEN`, …)
- Log server errors with route context; do not leak stack traces to clients

## Checklist for new mutating APIs

- [ ] Authz checked (role / staff permission)
- [ ] Domain logic in `app/lib`, not only in the route
- [ ] Audit or security event when the action is accountable
- [ ] Stock/finance changes are transactional
- [ ] Mobile `X-Client` still resolved via request context
