#!/usr/bin/env bash
set -Eeuo pipefail

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DOCKER_HOST="unix://${XDG_RUNTIME_DIR}/docker.sock"
export PATH="/usr/bin:/bin"
umask 0077

action="${1:-image}"
if [[ "$action" != "image" && "$action" != "config" ]]; then
  echo "usage: remote-deploy.sh [image|config]" >&2
  exit 64
fi

app_dir="$(cd "$(dirname "$0")/.." && pwd -P)"
if [[ "$app_dir" != "/srv/apps/llmapi" ]]; then
  echo "refusing unexpected app directory: $app_dir" >&2
  exit 65
fi
cd "$app_dir"

if ! mkdir .deploy-lock 2>/dev/null; then
  echo "another llmapi deployment is active" >&2
  exit 75
fi
trap 'rmdir .deploy-lock 2>/dev/null || true' EXIT

mkdir -p backups secrets
chmod 700 backups secrets
docker network inspect llm-internal >/dev/null 2>&1 || docker network create llm-internal >/dev/null

if docker compose ps -q llmapi 2>/dev/null | grep -q .; then
  docker compose exec -T llmapi node dist/scripts/backup-now.js
fi

had_env=0
had_runtime=0
had_providers=0
[[ -f .env ]] && { cp .env .env.rollback; had_env=1; }
[[ -f secrets/runtime.env ]] && { cp secrets/runtime.env secrets/runtime.env.rollback; had_runtime=1; }
[[ -f secrets/providers.json ]] && { cp secrets/providers.json secrets/providers.json.rollback; had_providers=1; }

[[ -f .env.next ]] && mv .env.next .env
[[ -f secrets/runtime.env.next ]] && mv secrets/runtime.env.next secrets/runtime.env
[[ -f secrets/providers.json.next ]] && mv secrets/providers.json.next secrets/providers.json
chmod 600 .env secrets/runtime.env secrets/providers.json

rollback() {
  echo "deployment failed; restoring previous image and configuration" >&2
  if [[ "$had_env" -eq 1 ]]; then mv -f .env.rollback .env; else rm -f .env; fi
  if [[ "$had_runtime" -eq 1 ]]; then mv -f secrets/runtime.env.rollback secrets/runtime.env; else rm -f secrets/runtime.env; fi
  if [[ "$had_providers" -eq 1 ]]; then mv -f secrets/providers.json.rollback secrets/providers.json; else rm -f secrets/providers.json; fi
  if [[ "$had_env" -eq 1 && "$had_runtime" -eq 1 && "$had_providers" -eq 1 ]]; then
    docker compose up -d --remove-orphans || true
  else
    docker compose down || true
  fi
}

if ! docker compose config --quiet; then
  rollback
  exit 1
fi

if [[ "$action" == "image" ]]; then
  if ! docker compose pull; then
    rollback
    exit 1
  fi
fi

if ! docker compose up -d --remove-orphans; then
  rollback
  exit 1
fi

healthy=0
for _ in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:3001/livez >/dev/null \
    && curl -fsS http://127.0.0.1:3001/readyz >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  docker compose logs --tail=200 llmapi >&2 || true
  rollback
  exit 1
fi

rm -f .env.rollback secrets/runtime.env.rollback secrets/providers.json.rollback
docker compose ps
