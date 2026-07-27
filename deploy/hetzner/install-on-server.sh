#!/usr/bin/env bash
# Run on the VPS after /opt/capuz/.env exists. Idempotent.
set -euo pipefail

APP_DIR="${CAPUZ_APP_DIR:-/opt/capuz/app}"
ENV_FILE="${CAPUZ_ENV_FILE:-/opt/capuz/.env}"
REPO="${CAPUZ_REPO:-https://github.com/mauricewipf/capuz.git}"
BRANCH="${CAPUZ_BRANCH:-main}"
CAPUZ_STACK="${CAPUZ_STACK:-}"

read_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/'
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy env.production.example and fill secrets first." >&2
  exit 1
fi

if [ -z "$CAPUZ_STACK" ]; then
  CAPUZ_STACK="$(read_env CAPUZ_STACK)"
fi
CAPUZ_STACK="${CAPUZ_STACK:-bundled}"

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

ensure_packages() {
  export DEBIAN_FRONTEND=noninteractive
  if ! command -v docker >/dev/null 2>&1; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
  fi
  if ! command -v caddy >/dev/null 2>&1; then
    echo "Installing Caddy..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
  fi
  if ! command -v envsubst >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq gettext-base
  fi
  systemctl enable caddy
}

ensure_swap() {
  if swapon --show | grep -q '/swapfile'; then
    return
  fi
  if [ -f /swapfile ]; then
    swapon /swapfile 2>/dev/null || true
    return
  fi
  echo "Creating 2G swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}

stop_native_nginx() {
  if systemctl is-active --quiet nginx 2>/dev/null; then
    systemctl stop nginx
  fi
  if systemctl is-enabled --quiet nginx 2>/dev/null; then
    systemctl disable nginx
  fi
}

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

ensure_packages
ensure_swap

if [ "$CAPUZ_STACK" = "reference" ]; then
  stop_native_nginx

  envsubst '${SITE_HOST} ${EDITOR_HOST} ${PREVIEW_HOST}' \
    < "$APP_DIR/deploy/hetzner/Caddyfile.host.template" \
    > /etc/caddy/Caddyfile

  cd "$APP_DIR"
  docker compose -f docker-compose.yml down -v 2>/dev/null || true
  docker compose -f docker-compose.bundled.yml down -v 2>/dev/null || true

  docker compose \
    -f docker-compose.yml \
    -f deploy/hetzner/docker-compose.reference.production.yml \
    up -d --build nginx cms-api openwebui

  systemctl enable caddy
  if systemctl is-active --quiet caddy; then
    systemctl reload caddy
  else
    systemctl start caddy
  fi

  echo ""
  echo "Reference stack started (nginx + cms-api + openwebui). Host Caddy serves TLS for:"
  echo "  https://${SITE_HOST} (live site — empty until publish)"
  echo "  https://www.${SITE_HOST}"
  echo "  https://${EDITOR_HOST} (Open WebUI)"
  echo "  https://${PREVIEW_HOST} (draft preview)"
  echo ""
  echo "First Open WebUI boot can take several minutes. Check:"
  echo "  docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.reference.production.yml logs -f openwebui"
else
  envsubst '${SITE_HOST} ${EDITOR_HOST} ${PREVIEW_HOST}' \
    < "$APP_DIR/deploy/hetzner/Caddyfile.template" \
    > /etc/caddy/Caddyfile

  cd "$APP_DIR"
  docker compose \
    -f docker-compose.bundled.yml \
    -f deploy/hetzner/docker-compose.production.yml \
    up -d --build

  systemctl enable caddy
  if systemctl is-active --quiet caddy; then
    systemctl reload caddy
  else
    systemctl start caddy
  fi

  echo ""
  echo "Bundled container started. Host Caddy serves TLS for:"
  echo "  https://${SITE_HOST}"
  echo "  https://${EDITOR_HOST}"
  echo "  https://${PREVIEW_HOST}"
  echo ""
  echo "First Open WebUI boot can take several minutes (model cache). Check:"
  echo "  docker compose -f docker-compose.bundled.yml -f deploy/hetzner/docker-compose.production.yml logs -f"
fi
