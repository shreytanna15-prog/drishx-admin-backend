# Supabase backups (drishx)

Production Postgres dumps live in `supabase/backups/` on disk only.
They are git-ignored via `supabase/backups/.gitignore` — never commit real data.

## Naming

`drishx-supabase-YYYY-MM-DD.sql` (+ `.gz` compressed copy)

## Take a new backup

Requires `pg_dump` 17+ (server is Postgres 17). From the repo root:

```bash
npm run backup:supabase
```

This reads `DATABASE_URL` from `.env` and writes a timestamped
`supabase/backups/drishx-supabase-YYYY-MM-DD.sql` + `.gz`.

## Restore (careful — overwrites the target DB)

```bash
psql "$DATABASE_URL" < supabase/backups/drishx-supabase-YYYY-MM-DD.sql
# or compressed:
gunzip -c supabase/backups/drishx-supabase-YYYY-MM-DD.sql.gz | psql "$DATABASE_URL"
```

Prefer restoring into a fresh/staging project first and verifying before
touching production.
