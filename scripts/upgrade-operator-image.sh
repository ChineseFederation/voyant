#!/usr/bin/env bash
set -euo pipefail

# Upgrade-path acceptance for the operator image.
#
# scripts/smoke-operator-image.sh migrates an empty database. That is the
# install case: a fresh database has nothing to adopt, so ledger-identity,
# baseline-adoption, and re-entrancy defects are invisible to it by
# construction. Self-hosters and the downstream Platform derivative both run
# this image against databases that already carry an earlier release's schema,
# which is the case no acceptance stage exercised until now (#4333).
#
# The sequence is:
#   1. resolve the previous released version, anonymously from the registry;
#   2. migrate a clean database with *that* image, producing a real prior state;
#   3. migrate it with the candidate — the step 0.6.0 would have failed;
#   4. boot the candidate against it and repeat the liveness/API assertions;
#   5. migrate once more and require a no-op, which pins re-entrancy.

candidate_ref="${1:?usage: upgrade-operator-image.sh <candidate-image-ref> [candidate-version]}"
candidate_version="${2:-}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_name="${IMAGE_NAME:-ghcr.io/voyant-travel/operator}"
port="${VOYANT_IMAGE_UPGRADE_PORT:-8081}"
container="voyant-operator-upgrade-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
log_dir="$(mktemp -d)"

# A dedicated database: the fresh-database stage shares this Postgres service
# and has usually already migrated the acceptance database with the candidate,
# which would make an older image's plan meaningless here.
admin_url="${VOYANT_UPGRADE_ADMIN_URL:-postgresql://voyant:voyant@localhost:5432/postgres}"
database_name="${VOYANT_UPGRADE_DATABASE:-voyant_starter_upgrade}"
database_url="${VOYANT_UPGRADE_DATABASE_URL:-postgresql://voyant:voyant@localhost:5432/$database_name}"

# shellcheck source=scripts/lib/operator-image-acceptance.sh
source "$root/scripts/lib/operator-image-acceptance.sh"

cleanup() {
  status=$?
  if ((status != 0)); then
    docker logs "$container" 2>/dev/null || true
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$log_dir"
  return "$status"
}
trap cleanup EXIT

skip() {
  echo "SKIPPED: operator image upgrade-path acceptance — $1"
  echo "This stage is advisory only when it cannot resolve a baseline. It never passes silently:"
  echo "the reason above is the whole result."
  exit 0
}

# Every migration run is diagnosed from its own execution report, so a plan that
# applied nothing is distinguishable from a plan that had nothing to do. The
# command's exit status is still fatal: the report is read first only so the
# reason reaches the log ahead of the failure.
migrate_and_assert() {
  local label="$1" image_ref="$2" log_name="$3"
  shift 3
  local log="$log_dir/$log_name"
  local status=0

  operator_image_migrate "$image_ref" "$log" || status=$?
  node "$root/scripts/assert-migration-report.mjs" --label "$label" "$@" <"$log" || exit 1
  if ((status != 0)); then
    echo "$label: the migration command itself exited $status."
    exit 1
  fi
}

resolved="$(node "$root/scripts/resolve-upgrade-baseline.mjs" "$image_name" "$candidate_version")"
if [[ -z "$resolved" ]]; then
  skip "no usable released predecessor exists yet"
fi
read -r baseline_version baseline_digest <<<"$resolved"
if ! [[ "$baseline_digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Baseline resolution returned no usable digest: $resolved"
  exit 1
fi
baseline_ref="$image_name@$baseline_digest"
echo "Upgrade baseline: $image_name:$baseline_version -> $baseline_ref"
echo "Upgrade candidate: $candidate_ref"

operator_image_pull "$baseline_ref"
operator_image_pull "$candidate_ref"

# Recreate the database so a rerun starts from the same prior state rather than
# from whatever the previous attempt left behind.
# One statement per invocation: DROP DATABASE cannot run inside a transaction
# block, and psql's own batching rules are not worth relying on here.
for statement in \
  "DROP DATABASE IF EXISTS \"$database_name\" WITH (FORCE)" \
  "CREATE DATABASE \"$database_name\""; do
  docker run --rm --network host postgres:16 \
    psql "$admin_url" --set ON_ERROR_STOP=1 --quiet -c "$statement"
done

operator_image_configure "$port" "$database_url"

echo "== Establishing the prior state with $baseline_version"
migrate_and_assert "baseline $baseline_version" "$baseline_ref" baseline.log --expect-applied

echo "== Upgrading that database with the candidate"
migrate_and_assert "upgrade from $baseline_version" "$candidate_ref" upgrade.log

echo "== Booting the candidate against the upgraded database"
operator_image_boot_and_assert "$candidate_ref" "$container" "$port"

echo "== Re-running the candidate's plan to pin re-entrancy"
migrate_and_assert "re-entrancy" "$candidate_ref" reentrancy.log --expect-no-op

echo "Upgrade path from $baseline_version accepted."
