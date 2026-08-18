#!/usr/bin/env bash
set -euo pipefail

image_ref="${1:?usage: smoke-operator-image.sh <image-ref>}"
port="${VOYANT_IMAGE_SMOKE_PORT:-8080}"
container="voyant-operator-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
api_only_container="${container}-api-only"

# shellcheck source=scripts/lib/operator-image-acceptance.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/operator-image-acceptance.sh"

database_host="$(operator_image_database_host)"
database_name="${VOYANT_SMOKE_DATABASE:-voyant_starter_acceptance}"
admin_url="${VOYANT_SMOKE_ADMIN_URL:-postgresql://voyant:voyant@$database_host:5432/postgres}"
database_url="${VOYANT_SMOKE_DATABASE_URL:-${DATABASE_URL:-postgresql://voyant:voyant@$database_host:5432/$database_name}}"

if [[ "$database_name" != "voyant_starter_acceptance" && "$database_name" != voyant_smoke_* ]]; then
  echo "Refusing to recreate non-smoke database: $database_name"
  exit 1
fi
if [[ "${database_url%%\?*}" != */"$database_name" ]]; then
  echo "Smoke database URL does not target guarded database $database_name."
  exit 1
fi

cleanup() {
  status=$?
  trap - EXIT
  if ((status != 0)); then
    docker logs "$container" 2>/dev/null || true
    docker logs "$api_only_container" 2>/dev/null || true
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker rm -f "$api_only_container" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

# This stage migrates a fresh database, which is the install case and not the
# deploy case. Upgrading a database that already carries the previous release's
# schema is scripts/upgrade-operator-image.sh.

# Pulling an image@sha256 reference makes the artifact under test explicit. A
# local CI tag still works, so branch CI and registry publication share this
# exact migration/boot/API acceptance sequence.
operator_image_pull "$image_ref"

operator_image_configure "$port" "$database_url"

# The install lane must be deterministic on rerun. Recreate only the guarded
# smoke database so stale partial migration state can never masquerade as a
# candidate failure or success.
for statement in \
  "DROP DATABASE IF EXISTS \"$database_name\" WITH (FORCE)" \
  "CREATE DATABASE \"$database_name\""; do
  operator_image_prepare_network_args
  docker run --rm "${OPERATOR_IMAGE_NETWORK_ARGS[@]}" postgres:16 \
    psql "$admin_url" --set ON_ERROR_STOP=1 --quiet -c "$statement"
done

operator_image_migrate "$image_ref"

operator_image_boot_and_assert "$image_ref" "$container" "$port"

operator_image_verify_shell_artifact "$image_ref"

docker rm -f "$container" >/dev/null
api_only_port=$((port + 1))
operator_image_configure "$api_only_port" "$database_url"
operator_image_boot_api_only_and_assert "$image_ref" "$api_only_container" "$api_only_port"
