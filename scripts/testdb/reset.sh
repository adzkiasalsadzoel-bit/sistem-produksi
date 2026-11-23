#!/usr/bin/env bash
# Reset database uji: bootstrap peran Supabase + shim auth + semua migrasi + seed.
# Pakai Postgres yang sudah jalan (default 127.0.0.1:54329, user postgres).
#   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres bash scripts/testdb/reset.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
URL="${TEST_DATABASE_URL:-postgres://postgres@127.0.0.1:54329/postgres}"
PSQL=(psql "$URL" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;" \
  -c "drop publication if exists supabase_realtime;" 2>/dev/null
"${PSQL[@]}" -f "$ROOT/scripts/testdb/bootstrap.sql" 2>&1 | grep -v -E "wal_level|HINT" || true
"${PSQL[@]}" -f "$ROOT/scripts/testdb/auth-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f"
done
if [ "${SKIP_SEED:-0}" != "1" ]; then
  "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
fi
echo "[testdb] siap: $URL"
