#!/usr/bin/env bash
# Run on the VPS after /opt/capuz/.env exists. Idempotent.
set -euo pipefail

APP_DIR="${CAPUZ_APP_DIR:-/opt/capuz/app}"
ENV_FILE="${CAPUZ_ENV_FILE:-/opt/capuz/.env}"
REPO="${CAPUZ_REPO:-https://github.com/mauricewipf/capuz.git}"
BRANCH="${CAPUZ_BRANCH:-main}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy env.production.example and fill secrets first." >&2
  exit 1
fi

read_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/'
}

SITE_HOST="$(read_env SITE_HOST)"
EDITOR_HOST="$(read_env EDITOR_HOST)"
PREVIEW_HOST="$(read_env PREVIEW_HOST)"
OPENROUTER_API_KEY="$(read_env OPENROUTER_API_KEY)"
CMS_API_KEY="$(read_env CMS_API_KEY)"
WEBUI_SECRET_KEY="$(read_env WEBUI_SECRET_KEY)"

for var in SITE_HOST EDITOR_HOST PREVIEW_HOST OPENROUTER_API_KEY CMS_API_KEY WEBUI_SECRET_KEY; do
  eval "val=\$$var"
  if [ -z "$val" ]; then
    echo "Set $var in $ENV_FILE before running install." >&2
    exit 1
  fi
done

export SITE_HOST EDITOR_HOST PREVIEW_HOST

if [ "${CAPUZ_SKIP_GIT_PULL:-}" = "1" ]; then
  : # app dir synced from local (deploy-from-local.sh)
elif [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

cp "$ENV_FILE" "$APP_DIR/.env"

if ! command -v envsubst >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq gettext-base
fi

envsubst '${SITE_HOST} ${EDITOR_HOST} ${PREVIEW_HOST}' \
  < "$APP_DIR/deploy/hetzner/Caddyfile.template" \
  > /etc/caddy/Caddyfile

systemctl reload caddy

cd "$APP_DIR"
docker compose \
  -f docker-compose.bundled.yml \
  -f deploy/hetzner/docker-compose.production.yml \
  up -d --build

echo ""
echo "Bundled container started. Host Caddy serves TLS for:"
echo "  https://${SITE_HOST}"
echo "  https://${EDITOR_HOST}"
echo "  https://${PREVIEW_HOST}"
echo ""
echo "First Open WebUI boot can take several minutes (model cache). Check:"
echo "  docker compose -f docker-compose.bundled.yml -f deploy/hetzner/docker-compose.production.yml logs -f"
