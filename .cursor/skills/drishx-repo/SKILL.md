---
name: drishx-repo
description: DrishX admin+backend repo map, stack, roles, and non-negotiables. Use when starting work in Drishx-admin-and-backend, choosing where code belongs, or clarifying product scope vs the web/mobile clients.
---

# DrishX Admin + Backend

## Product

B2B optical-lens wholesale ERP. Not social, live streaming, Agora, or payment-gateway checkout.

This repo is the **brain**: PostgreSQL + Prisma + ~70 REST API routes + admin panel. Web and mobile are clients only.

## Stack (pin to package.json)

- Next.js **16.2** / React **19** / TypeScript
- Prisma **7** + `@prisma/adapter-pg` + `pg` Pool (Supabase Postgres)
- Auth: JWT (`jsonwebtoken`) + refresh cookies / mobile refresh tokens
- UI: Tailwind **v4**, shadcn/radix, lucide-react
- Storage: Supabase Storage for images

## Layout

| Path | Role |
|------|------|
| `app/api/**` | REST backend (shared by admin, web proxy, mobile) |
| `app/lib/**` | Domain logic (orders, lenses, cart, returns, auth, audit) |
| `app/(admin)/**` | Admin UI pages (route group; URLs unchanged) |
| `app/login/**` | Login only — outside admin chrome |
| `components/` | Admin UI + shells/skeletons |
| `prisma/` | Schema, migrations, seed scripts |
| `docs/` | Specs — prefer these over inventing domain rules |

## Roles

`ADMIN` | `EMPLOYEE` | `CUSTOMER` — see `docs/intro.md` and role capability spec.

## Before coding

1. Read `AGENTS.md` (Next.js version differs from training data).
2. For domain behavior, open the relevant doc under `docs/` first.
3. Prefer extending `app/lib/*` + thin route handlers over dumping logic in `route.ts`.
4. Do not invent catalogs, payment gateways, or features from other products.

## Related skills

- `drishx-nextjs` — App Router / admin chrome / loading UX
- `drishx-prisma` — Prisma 7 client, pooler, migrations
- `drishx-api-auth-audit` — session, API errors, audit/security events
