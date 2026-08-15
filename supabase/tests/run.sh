#!/usr/bin/env bash
# Runs the RLS test suites against a throwaway local Postgres.
#
# Stubs the Supabase-managed objects (auth.uid(), auth.users, storage) so the
# migrations run unmodified, then checks that students, parents and the admin
# can each see exactly what they should — and that a parent can only ever be
# linked by accepting a code the student issued.
#
# Usage: supabase/tests/run.sh [psql-connection-args...]
#   e.g. supabase/tests/run.sh -h /tmp -p 5433 -U postgres
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL_ARGS=("$@")
DB="${TEST_DB:-tutor_rls_test}"

run() { psql "${PSQL_ARGS[@]}" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }

psql "${PSQL_ARGS[@]}" -q -c "drop database if exists $DB;" -c "create database $DB;"
run "$HERE/supabase_stub.sql"
for m in "$HERE"/../migrations/*.sql; do run "$m"; done

echo "=== core RLS ==="
psql "${PSQL_ARGS[@]}" -d "$DB" -q -f "$HERE/rls_tests.sql"

# The invite suite seeds its own users, so it needs a clean database.
psql "${PSQL_ARGS[@]}" -q -c "drop database if exists $DB;" -c "create database $DB;"
run "$HERE/supabase_stub.sql"
for m in "$HERE"/../migrations/*.sql; do run "$m"; done

echo "=== parent invites ==="
psql "${PSQL_ARGS[@]}" -d "$DB" -q -f "$HERE/parent_invite_tests.sql"

psql "${PSQL_ARGS[@]}" -q -c "drop database if exists $DB;" -c "create database $DB;"
run "$HERE/supabase_stub.sql"
for m in "$HERE"/../migrations/*.sql; do run "$m"; done

echo "=== grades and per-student materials ==="
psql "${PSQL_ARGS[@]}" -d "$DB" -q -f "$HERE/grades_and_materials_tests.sql"

psql "${PSQL_ARGS[@]}" -q -c "drop database if exists $DB;" -c "create database $DB;"
run "$HERE/supabase_stub.sql"
for m in "$HERE"/../migrations/*.sql; do run "$m"; done

echo "=== lesson summary and homework ==="
psql "${PSQL_ARGS[@]}" -d "$DB" -q -f "$HERE/lesson_notes_tests.sql"

psql "${PSQL_ARGS[@]}" -q -c "drop database if exists $DB;" -c "create database $DB;"
run "$HERE/supabase_stub.sql"
for m in "$HERE"/../migrations/*.sql; do run "$m"; done

echo "=== approvals and account admin ==="
psql "${PSQL_ARGS[@]}" -d "$DB" -q -f "$HERE/approval_tests.sql"
