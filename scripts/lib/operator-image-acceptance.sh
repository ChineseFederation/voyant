# shellcheck shell=bash
# Shared operator image acceptance primitives.
#
# Sourced by scripts/smoke-operator-image.sh (fresh database) and
# scripts/upgrade-operator-image.sh (previous release's database). Both stages
# must run the same image with the same environment, so the environment set and
# the boot assertions live here once. A binding added for one stage and not the
# other is exactly how an acceptance lane stops resembling a deployment.

operator_image_is_docker_desktop() {
  [[ "$(docker info --format '{{.OperatingSystem}}' 2>/dev/null)" == "Docker Desktop" ]]
}

operator_image_database_host() {
  if operator_image_is_docker_desktop; then
    printf '%s\n' "host.docker.internal"
    return
  fi
  printf '%s\n' "localhost"
}

# Linux CI can share the host network directly. Docker Desktop keeps that
# capability opt-in, so local acceptance publishes only the tested port rather
# than requiring developers to widen the VM's network access.
operator_image_prepare_network_args() {
  local port="${1:-}"
  if operator_image_is_docker_desktop; then
    OPERATOR_IMAGE_NETWORK_ARGS=(--network bridge)
    if [[ -n "$port" ]]; then
      OPERATOR_IMAGE_NETWORK_ARGS=(--publish "127.0.0.1:$port:$port")
    fi
    return
  fi
  OPERATOR_IMAGE_NETWORK_ARGS=(--network host)
}

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
    OPERATOR_IMAGE_POSTGRES_SEARCH_CURSOR_SIGNING_KEY="$(openssl rand -hex 32)"
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
    --env "POSTGRES_SEARCH_CURSOR_SIGNING_KEY=$OPERATOR_IMAGE_POSTGRES_SEARCH_CURSOR_SIGNING_KEY"
  )
}

# Runs the image's embedded migration plan. With a log path the output is
# retained so the caller can assert on the emitted execution report rather than
# on the exit code alone.
operator_image_migrate() {
  local image_ref="$1"
  local log_path="${2:-}"
  operator_image_prepare_network_args

  if [[ -z "$log_path" ]]; then
    docker run --rm "${OPERATOR_IMAGE_NETWORK_ARGS[@]}" "${OPERATOR_IMAGE_ENV_ARGS[@]}" "$image_ref" \
      node run-generated-migrations.mjs
    return
  fi

  docker run --rm "${OPERATOR_IMAGE_NETWORK_ARGS[@]}" "${OPERATOR_IMAGE_ENV_ARGS[@]}" "$image_ref" \
    node run-generated-migrations.mjs 2>&1 | tee "$log_path"
}

##
# Wait for the container to serve /healthz, and SAY WHY if it never does.
#
# Without this the failure was silent: `health=$(curl …)` assigns curl's exit
# status, `set -e` aborts on it, and the script died before printing even the
# status code — so a production image that migrated fine and then crashed on
# boot produced no diagnostic at all. The container logs are the only place the
# reason exists, and nothing was reading them.
##
operator_image_await_health() {
  local container="$1"
  local port="$2"

  local _
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://localhost:$port/healthz"; then
      return 0
    fi
    # A container that has already exited will never come up; stop waiting out
    # the full minute for something that is gone.
    if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = "false" ]; then
      break
    fi
    sleep 1
  done

  echo "::group::$container did not serve /healthz on port $port"
  echo "--- docker inspect ---"
  docker inspect -f 'running={{.State.Running}} exit={{.State.ExitCode}} error={{.State.Error}}' \
    "$container" 2>&1 || true
  echo "--- container logs ---"
  docker logs "$container" 2>&1 | tail -100 || true
  echo "::endgroup::"
  return 1
}

operator_image_boot_and_assert() {
  local image_ref="$1"
  local container="$2"
  local port="$3"
  operator_image_prepare_network_args "$port"

  docker run --detach --name "$container" "${OPERATOR_IMAGE_NETWORK_ARGS[@]}" \
    "${OPERATOR_IMAGE_ENV_ARGS[@]}" "$image_ref" >/dev/null

  operator_image_await_health "$container" "$port"

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

operator_image_verify_shell_artifact() {
  local image_ref="$1"
  docker run --rm "$image_ref" node verify-operator-admin-shell.mjs /app/admin-shell
}

operator_image_boot_api_only_and_assert() {
  local image_ref="$1"
  local container="$2"
  local port="$3"
  operator_image_prepare_network_args "$port"

  docker run --detach --name "$container" "${OPERATOR_IMAGE_NETWORK_ARGS[@]}" \
    "${OPERATOR_IMAGE_ENV_ARGS[@]}" "$image_ref" node start-api-only.mjs >/dev/null

  operator_image_await_health "$container" "$port"

  local health api admin content_type
  health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/healthz" || true)
  api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
    "http://localhost:$port/api/openapi.json" || true)
  admin=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/" || true)
  content_type=$(curl -s -o /dev/null -w "%{content_type}" "http://localhost:$port/" || true)
  echo "api-only healthz -> $health; api -> $api; admin -> $admin ($content_type)"
  test "$health" = "200"
  test "$api" -lt 500
  test "$admin" != "200"
  [[ "$content_type" != text/html* ]]
}
