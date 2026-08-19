#!/usr/bin/env bash
#
# Applies every migration to a throwaway Postgres container, then runs the
# ownership tests against it.
#
#   bash supabase/tests/run_tests.sh
#
# Requires Docker. Nothing else -- no Supabase CLI, no local Postgres, no
# network access to a Supabase project.
#
# Why a container rather than `supabase db reset`: no Supabase CLI is installed
# on this machine (D-030). A stock Postgres image plus the shim in
# 00_local_supabase_shim.sql gives a real Postgres to test policies against,
# which is the part that matters -- RLS is enforced by Postgres, not by Supabase.
#
# The container is deleted on exit, pass or fail. It never touches a real
# project: the connection is to localhost only, and no Supabase credentials are
# read.

set -euo pipefail

CONTAINER="paperlens-schema-test"
PG_IMAGE="postgres:16-alpine"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"

# Docker on Windows/Git Bash rewrites arguments that look like paths.
export MSYS_NO_PATHCONV=1

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== starting throwaway postgres =="
cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  "$PG_IMAGE" >/dev/null

# Two readiness gates. pg_isready can report ready during the init scripts'
# bootstrap phase, when the server is still listening on a unix socket only and
# a connection would be refused.
echo -n "waiting for postgres"
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -q 2>/dev/null \
     && docker exec "$CONTAINER" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
    echo " ready"
    break
  fi
  echo -n "."
  sleep 1
done

if ! docker exec "$CONTAINER" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo ""
  echo "FAIL: postgres did not become ready in time"
  docker logs "$CONTAINER" 2>&1 | tail -20
  exit 1
fi

run_sql() {
  local label="$1" file="$2"
  echo ""
  echo "== $label =="
  # ON_ERROR_STOP makes psql exit non-zero on the first error, so `set -e`
  # aborts the run instead of reporting success over a broken schema.
  docker exec -i "$CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$file"
}

# Shim first: the migrations reference auth.users and storage.objects.
run_sql "local supabase shim" "$HERE/00_local_supabase_shim.sql"

# Migrations in filename order, which is timestamp order (D-026).
for migration in "$MIGRATIONS"/*.sql; do
  run_sql "migration: $(basename "$migration")" "$migration"
done

# Re-apply every migration. D-026 requires idempotency, so a second pass over an
# already-migrated database must be a clean no-op. This is the check for that.
echo ""
echo "== re-applying all migrations (idempotency check) =="
for migration in "$MIGRATIONS"/*.sql; do
  docker exec -i "$CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$migration"
done
echo "all migrations re-applied cleanly"

for test_file in "$HERE"/*_test.sql; do
  run_sql "test: $(basename "$test_file")" "$test_file"
done

echo ""
echo "=================================================="
echo "SCHEMA + RLS + STORAGE TESTS PASSED"
echo "=================================================="
