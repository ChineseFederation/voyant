#!/usr/bin/env bash
set -euo pipefail

image_ref="${1:?usage: smoke-operator-image.sh <image-ref>}"
database_url="${DATABASE_URL:-postgresql://voyant:voyant@localhost:5432/voyant_starter_acceptance}"
port="${VOYANT_IMAGE_SMOKE_PORT:-8080}"
container="voyant-operator-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

# shellcheck source=scripts/lib/operator-image-acceptance.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/operator-image-acceptance.sh"

cleanup() {
  status=$?
  if ((status != 0)); then
    docker logs "$container" 2>/dev/null || true
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  return "$status"
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

operator_image_migrate "$image_ref"

operator_image_boot_and_assert "$image_ref" "$container" "$port"
