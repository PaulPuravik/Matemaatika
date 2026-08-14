#!/usr/bin/env bash
# Runs the RLS test suite against a throwaway local Postgres.
#
# It stubs out the Supabase-managed objects (auth.uid(), auth.users, storage)
# so migrations/0001_init.sql can run unmodified, then checks that students,
# parents and the admin can each see exactly what they should.
#
# Usage: supabase/tests/run.sh [psql-connection-args...]
#   e.g. supabase/tests/run.sh -h /tmp -p 5433 -U postgres
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL_ARGS=("$@")
DB="${TEST_DB:-tutor_rls_test}"

psql "${PSQL_ARGS[@]}" -q -c "drop database if exists $DB;" -c "create database $DB;"
psql "${PSQL_ARGS[@]}" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/supabase_stub.sql"
psql "${PSQL_ARGS[@]}" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/../migrations/0001_init.sql"
psql "${PSQL_ARGS[@]}" -d "$DB" -q -f "$HERE/rls_tests.sql"
