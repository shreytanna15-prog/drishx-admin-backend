---
name: drishx-prisma
description: Prisma 7 + PostgreSQL (Supabase pooler) patterns for DrishX. Use when editing schema, migrations, seeds, PrismaClient usage, pool/adapter setup, or database connection errors.
---

# DrishX Prisma 7

## Client setup

Use the shared client from `app/lib/prisma.ts` — do **not** construct a bare `new PrismaClient()` in routes.

- Prisma 7 requires driver adapter: `@prisma/adapter-pg` + `pg` Pool
- Prefer Supabase **transaction pooler** (`:6543`) at runtime; session mode (`:5432`) hits `EMAXCONNSESSION`
- URL normalization and password parsing live in `prisma.ts` — preserve that logic
- Use `withDbRetry` for transient pool/busy errors where the codebase already does

Also load official skills when needed: `prisma-client-api`, `prisma-cli`, `prisma-upgrade-v7`, `prisma-database-setup`.

## Commands

```bash
npm run db:generate    # prisma generate
npm run db:migrate     # prisma migrate dev
npm run db:studio
npm run db:seed        # main seed
```

Many catalog seeds are named `db:seed-*` in `package.json` — prefer those over one-off scripts.

## Schema / migrations

- Schema: `prisma/schema.prisma`
- Prefer `prisma migrate dev` with a named migration for schema changes
- Seeds are `tsx prisma/*.ts` — keep them idempotent when possible
- After schema change: generate client before typechecking

## Query habits

- Put multi-step writes in `$transaction` when stock/orders/finance must stay consistent
- Reuse existing domain helpers (`order-inventory`, `place-order`, `stock-intake`, audit helpers) instead of raw model writes from routes
- Never log connection strings or service-role keys

## Env

- `DATABASE_URL` — primary connection (pooler preferred for app)
- Do not commit `.env` / secrets
