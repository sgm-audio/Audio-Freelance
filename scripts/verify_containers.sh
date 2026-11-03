#!/usr/bin/env bash
# Deterministic container/Compose release gate using only synthetic credentials.
set -Eeuo pipefail

for command in docker curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "required command not found: $command" >&2
    exit 2
  fi
done

docker compose version >/dev/null

project="${COMPOSE_PROJECT_NAME:-audio-freelance-ci}"
env_file="$(mktemp)"
cleanup() {
  status=$?
  if (( status != 0 )); then
    docker compose --project-name "$project" \
      -f docker-compose.yml -f docker-compose.prod.yml logs --no-color || true
  fi
  docker compose --project-name "$project" \
    -f docker-compose.yml -f docker-compose.prod.yml down --volumes --remove-orphans || true
  rm -f "$env_file"
  exit "$status"
}
trap cleanup EXIT

cat >"$env_file" <<'EOF'
TAVILY_API_KEY=synthetic-ci-only
SERPER_API_KEY=synthetic-ci-only
FIRECRAWL_API_KEY=synthetic-ci-only
API_KEY=synthetic-ci-bearer-key
ENVIRONMENT=production
SENTRY_DSN=
EOF
export ENV_FILE="$env_file"
export BACKEND_IMAGE="audio-freelance-backend:ci"
export FRONTEND_IMAGE="audio-freelance-frontend:ci"

base=(docker compose --project-name "$project" -f docker-compose.yml)
production=(docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.prod.yml)

# Parse every supported profile and the production override before building.
"${base[@]}" config --quiet
"${base[@]}" --profile full config --quiet
"${base[@]}" --profile outreach config --quiet
"${production[@]}" config --quiet
"${production[@]}" --profile full --profile outreach config --quiet

# Build all repository-owned images, including the optional outreach CLI.
"${base[@]}" --profile outreach build backend frontend outreach

# Static non-root image policy and a real runtime check below are both required.
[[ "$(docker image inspect "$BACKEND_IMAGE" --format '{{.Config.User}}')" == "appuser" ]]
[[ "$(docker image inspect "$FRONTEND_IMAGE" --format '{{.Config.User}}')" == "node" ]]
outreach_image="$("${base[@]}" --profile outreach images -q outreach)"
[[ -n "$outreach_image" ]]
[[ "$(docker image inspect "$outreach_image" --format '{{.Config.User}}')" == "node" ]]
docker image tag "$outreach_image" audio-freelance-outreach:ci

"${production[@]}" up -d backend frontend

wait_for_url() {
  local url=$1
  local attempts=${2:-60}
  for ((i = 1; i <= attempts; i++)); do
    if curl --fail --silent --show-error "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "timed out waiting for $url" >&2
  return 1
}

wait_for_url http://127.0.0.1:8080/api/v1/health
wait_for_url http://127.0.0.1:3000

# Production auth must reject missing credentials and accept the synthetic key.
[[ "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:8080/briefing)" == "401" ]]
curl --fail --silent --show-error \
  -H 'Authorization: Bearer synthetic-ci-bearer-key' \
  http://127.0.0.1:8080/briefing >/dev/null

# Confirm containers actually run unprivileged.
[[ "$("${production[@]}" exec -T backend id -u)" != "0" ]]
[[ "$("${production[@]}" exec -T frontend id -u)" != "0" ]]

# Exercise named-volume persistence across a backend restart.
marker="container-gate-$RANDOM-$RANDOM"
"${production[@]}" exec -T backend sh -c "printf '%s' '$marker' > /app/leads/data/.ci-persistence"
"${production[@]}" restart backend
wait_for_url http://127.0.0.1:8080/api/v1/health
[[ "$("${production[@]}" exec -T backend cat /app/leads/data/.ci-persistence)" == "$marker" ]]
"${production[@]}" exec -T backend rm /app/leads/data/.ci-persistence

# Restart policy and health states must match the production configuration.
[[ "$(docker inspect "$(${production[@]} ps -q backend)" --format '{{.HostConfig.RestartPolicy.Name}}')" == "unless-stopped" ]]
[[ "$(docker inspect "$(${production[@]} ps -q frontend)" --format '{{.HostConfig.RestartPolicy.Name}}')" == "unless-stopped" ]]
[[ "$(docker inspect "$(${production[@]} ps -q backend)" --format '{{.State.Health.Status}}')" == "healthy" ]]
[[ "$(docker inspect "$(${production[@]} ps -q frontend)" --format '{{.State.Health.Status}}')" == "healthy" ]]

echo "Container and Compose verification passed."
