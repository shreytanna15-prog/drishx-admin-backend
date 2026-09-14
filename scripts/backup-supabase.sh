#!/usr/bin/env bash
# Take a pg_dump of the Supabase Postgres DB into supabase/backups/.
# Usage: npm run backup:supabase  (reads DATABASE_URL from .env)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL missing (expected in .env)" >&2
  exit 1
fi

# pg_dump must be >= server major (17). Prefer system pg_dump, fall back to
# the portable PGDG 17 binary under /tmp if present (no sudo installs here).
PG_DUMP="${PG_DUMP_BIN:-$(command -v pg_dump || true)}"
if [[ -z "$PG_DUMP" && -x /tmp/pg17/usr/lib/postgresql/17/bin/pg_dump ]]; then
  export LD_LIBRARY_PATH="/tmp/pgdump-extract/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
  PG_DUMP="/tmp/pg17/usr/lib/postgresql/17/bin/pg_dump"
fi
if [[ -z "$PG_DUMP" ]]; then
  echo "pg_dump not found. Install postgresql-client-17 or set PG_DUMP_BIN." >&2
  exit 1
fi

OUT_DIR="$ROOT/supabase/backups"
mkdir -p "$OUT_DIR"
STAMP="$(date +%F)"
OUT="$OUT_DIR/drishx-supabase-$STAMP.sql"

# Use session-mode pooler port 5432 for dumps when DATABASE_URL points at 6543.
URL="${DATABASE_URL/:6543\//:5432\/}"
export PGCONNECT_TIMEOUT=30

"$PG_DUMP" --dbname="$URL" -F p -f "$OUT" -v
gzip -k -f "$OUT"
ls -lh "$OUT" "$OUT.gz"
