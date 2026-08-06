# shellcheck shell=bash
# Shared operator image acceptance primitives.
#
# Sourced by scripts/smoke-operator-image.sh (fresh database) and
# scripts/upgrade-operator-image.sh (previous release's database). Both stages
# must run the same image with the same environment, so the environment set and
# the boot assertions live here once. A binding added for one stage and not the
# other is exactly how an acceptance lane stops resembling a deployment.

operator_image_pull() {
  local image_ref="$1"
  if docker image inspect "$image_ref" >/dev/null 2>&1; then
    return 0
  fi
  local attempt
  for attempt in $(seq 1 6); do
    if docker pull "$image_ref" >/dev/null; then
      return 0
    fi
    if ((attempt == 6)); then
      echo "Unable to pull $image_ref after $attempt attempts."
      return 1
    fi
    sleep 5
  done
}

# Populates the OPERATOR_IMAGE_ENV_ARGS array for a port/database pair. Secrets
# are generated once per process so every image in one acceptance run reads the
# same deployment, which is what makes a two-image upgrade sequence meaningful.
operator_image_configure() {
  local port="$1"
  local database_url="$2"

  if [[ -z "${OPERATOR_IMAGE_SECRETS_READY:-}" ]]; then
    OPERATOR_IMAGE_BETTER_AUTH_ADMIN_SECRET="$(openssl rand -hex 24)"
    OPERATOR_IMAGE_BETTER_AUTH_CUSTOMER_SECRET="$(openssl rand -hex 24)"
    OPERATOR_IMAGE_SESSION_CLAIMS_ADMIN_SECRET="$(openssl rand -hex 24)"
    OPERATOR_IMAGE_SESSION_CLAIMS_CUSTOMER_SECRET="$(openssl rand -hex 24)"
    OPERATOR_IMAGE_CHECKOUT_CAPABILITY_SECRET="$(openssl rand -hex 24)"
    OPERATOR_IMAGE_INTERNAL_API_KEY="$(openssl rand -hex 16)"
    OPERATOR_IMAGE_KMS_LOCAL_KEY="$(openssl rand -base64 32)"
    OPERATOR_IMAGE_SECRETS_READY=1
  fi

  OPERATOR_IMAGE_ENV_ARGS=(
    --env "PORT=$port"
    --env "DATABASE_URL=$database_url"
    --env EMAIL_FROM=ci@example.com
    --env KMS_PROVIDER=local
    --env "APP_URL=http://localhost:$port/api"
    --env "API_BASE_URL=http://localhost:$port/api"
    --env "CORS_ALLOWLIST=http://localhost:$port"
    --env "DASH_BASE_URL=http://localhost:$port"
    --env "BETTER_AUTH_ADMIN_SECRET=$OPERATOR_IMAGE_BETTER_AUTH_ADMIN_SECRET"
    --env "BETTER_AUTH_CUSTOMER_SECRET=$OPERATOR_IMAGE_BETTER_AUTH_CUSTOMER_SECRET"
    --env "SESSION_CLAIMS_ADMIN_SECRET=$OPERATOR_IMAGE_SESSION_CLAIMS_ADMIN_SECRET"
    --env "SESSION_CLAIMS_CUSTOMER_SECRET=$OPERATOR_IMAGE_SESSION_CLAIMS_CUSTOMER_SECRET"
    --env "VOYANT_CHECKOUT_CAPABILITY_SECRET=$OPERATOR_IMAGE_CHECKOUT_CAPABILITY_SECRET"
    --env "INTERNAL_API_KEY=$OPERATOR_IMAGE_INTERNAL_API_KEY"
    --env "KMS_LOCAL_KEY=$OPERATOR_IMAGE_KMS_LOCAL_KEY"
  )
}

# Runs the image's embedded migration plan. With a log path the output is
# retained so the caller can assert on the emitted execution report rather than
# on the exit code alone.
operator_image_migrate() {
  local image_ref="$1"
  local log_path="${2:-}"

  if [[ -z "$log_path" ]]; then
    docker run --rm --network host "${OPERATOR_IMAGE_ENV_ARGS[@]}" "$image_ref" \
      node run-generated-migrations.mjs
    return
  fi

  docker run --rm --network host "${OPERATOR_IMAGE_ENV_ARGS[@]}" "$image_ref" \
    node run-generated-migrations.mjs 2>&1 | tee "$log_path"
}

operator_image_boot_and_assert() {
  local image_ref="$1"
  local container="$2"
  local port="$3"

  docker run --detach --name "$container" --network host \
    "${OPERATOR_IMAGE_ENV_ARGS[@]}" "$image_ref" >/dev/null

  local _
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://localhost:$port/healthz"; then
      break
    fi
    sleep 1
  done

  local health
  health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/healthz")
  echo "healthz -> $health"
  test "$health" = "200"

  local api
  api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
    "http://localhost:$port/api/openapi.json")
  echo "api dispatch -> $api"
  test "$api" -lt 500
}
