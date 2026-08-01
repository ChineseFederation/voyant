#!/usr/bin/env bash
set -euo pipefail

image_ref="${1:?usage: smoke-operator-image.sh <image-ref>}"
database_url="${DATABASE_URL:-postgresql://voyant:voyant@localhost:5432/voyant_starter_acceptance}"
port="${VOYANT_IMAGE_SMOKE_PORT:-8080}"
container="voyant-operator-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

cleanup() {
  status=$?
  if (( status != 0 )); then
    docker logs "$container" 2>/dev/null || true
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  return "$status"
}
trap cleanup EXIT

# Pulling an image@sha256 reference makes the artifact under test explicit. A
# local CI tag still works, so branch CI and registry publication share this
# exact migration/boot/API acceptance sequence.
if ! docker image inspect "$image_ref" >/dev/null 2>&1; then
  for attempt in $(seq 1 6); do
    if docker pull "$image_ref" >/dev/null; then
      break
    fi
    if (( attempt == 6 )); then
      echo "Unable to pull $image_ref after $attempt attempts."
      exit 1
    fi
    sleep 5
  done
fi

env_args=(
  --env "PORT=$port"
  --env "DATABASE_URL=$database_url"
  --env EMAIL_FROM=ci@example.com
  --env KMS_PROVIDER=local
  --env "APP_URL=http://localhost:$port/api"
  --env "API_BASE_URL=http://localhost:$port/api"
  --env "CORS_ALLOWLIST=http://localhost:$port"
  --env "DASH_BASE_URL=http://localhost:$port"
  --env "BETTER_AUTH_ADMIN_SECRET=$(openssl rand -hex 24)"
  --env "BETTER_AUTH_CUSTOMER_SECRET=$(openssl rand -hex 24)"
  --env "SESSION_CLAIMS_ADMIN_SECRET=$(openssl rand -hex 24)"
  --env "SESSION_CLAIMS_CUSTOMER_SECRET=$(openssl rand -hex 24)"
  --env "VOYANT_CHECKOUT_CAPABILITY_SECRET=$(openssl rand -hex 24)"
  --env "INTERNAL_API_KEY=$(openssl rand -hex 16)"
  --env "KMS_LOCAL_KEY=$(openssl rand -base64 32)"
)

docker run --rm --network host "${env_args[@]}" "$image_ref" \
  node run-generated-migrations.mjs
docker run --detach --name "$container" --network host \
  "${env_args[@]}" "$image_ref" >/dev/null

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://localhost:$port/healthz"; then
    break
  fi
  sleep 1
done

health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/healthz")
echo "healthz -> $health"
test "$health" = "200"

api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
  "http://localhost:$port/api/openapi.json")
echo "api dispatch -> $api"
test "$api" -lt 500
