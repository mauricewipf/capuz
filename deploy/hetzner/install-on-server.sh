#!/usr/bin/env bash
# Run on the VPS after /opt/capuz/.env exists. Idempotent.
# Deploys the multi-service stack (nginx + cms-api + cms-console + openwebui + oauth2-proxy + edge-router).
set -euo pipefail

APP_DIR="${CAPUZ_APP_DIR:-/opt/capuz/app}"
ENV_FILE="${CAPUZ_ENV_FILE:-/opt/capuz/.env}"
REPO="${CAPUZ_REPO:-https://github.com/mauricewipf/capuz.git}"
BRANCH="${CAPUZ_BRANCH:-main}"

read_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/'
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy env.production.example and fill secrets first." >&2
  exit 1
fi

SITE_HOST="$(read_env SITE_HOST)"
EDITOR_HOST="$(read_env EDITOR_HOST)"
PREVIEW_HOST="$(read_env PREVIEW_HOST)"
CONSOLE_HOST="$(read_env CONSOLE_HOST)"
AUTH_HOST="$(read_env AUTH_HOST)"
OPENROUTER_API_KEY="$(read_env OPENROUTER_API_KEY)"
CMS_API_KEY="$(read_env CMS_API_KEY)"
WEBUI_SECRET_KEY="$(read_env WEBUI_SECRET_KEY)"
ACME_EMAIL="$(read_env ACME_EMAIL)"
GITHUB_OAUTH_CLIENT_ID="$(read_env GITHUB_OAUTH_CLIENT_ID)"
GITHUB_OAUTH_CLIENT_SECRET="$(read_env GITHUB_OAUTH_CLIENT_SECRET)"
GITHUB_ALLOWED_USERS="$(read_env GITHUB_ALLOWED_USERS)"
OAUTH2_PROXY_COOKIE_SECRET="$(read_env OAUTH2_PROXY_COOKIE_SECRET)"
OAUTH2_PROXY_COOKIE_DOMAIN="$(read_env OAUTH2_PROXY_COOKIE_DOMAIN)"
OAUTH2_PROXY_WHITELIST_DOMAIN="$(read_env OAUTH2_PROXY_WHITELIST_DOMAIN)"
CONSOLE_CSRF_SECRET="$(read_env CONSOLE_CSRF_SECRET)"

for var in SITE_HOST EDITOR_HOST PREVIEW_HOST CONSOLE_HOST AUTH_HOST OPENROUTER_API_KEY CMS_API_KEY WEBUI_SECRET_KEY ACME_EMAIL GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET GITHUB_ALLOWED_USERS OAUTH2_PROXY_COOKIE_SECRET OAUTH2_PROXY_COOKIE_DOMAIN OAUTH2_PROXY_WHITELIST_DOMAIN CONSOLE_CSRF_SECRET; do
  eval "val=\$$var"
  if [ -z "$val" ]; then
    echo "Set $var in $ENV_FILE before running install." >&2
    exit 1
  fi
done

cookie_len="${#OAUTH2_PROXY_COOKIE_SECRET}"
if [ "$cookie_len" -ne 16 ] && [ "$cookie_len" -ne 24 ] && [ "$cookie_len" -ne 32 ]; then
  echo "OAUTH2_PROXY_COOKIE_SECRET must be exactly 16, 24, or 32 bytes (got length $cookie_len)." >&2
  echo "Generate with: openssl rand -hex 16" >&2
  exit 1
fi

export SITE_HOST EDITOR_HOST PREVIEW_HOST CONSOLE_HOST AUTH_HOST ACME_EMAIL

ensure_docker() {
  export DEBIAN_FRONTEND=noninteractive
  if ! command -v docker >/dev/null 2>&1; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
  fi
  if ! command -v envsubst >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq gettext-base
  fi
}

disable_host_caddy() {
  # Free :80/:443 for in-compose edge-router.
  if command -v caddy >/dev/null 2>&1 || systemctl list-unit-files caddy.service >/dev/null 2>&1; then
    echo "Disabling host Caddy (multi-service stack uses Docker edge-router)..."
    systemctl disable --now caddy 2>/dev/null || true
  fi
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

ensure_docker
ensure_swap
stop_native_nginx
cd "$APP_DIR"

COMPOSE=(docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml)

echo "Preflight: validating merged compose config..."
"${COMPOSE[@]}" config >/dev/null

echo "Preflight: validating Caddyfile.prod..."
docker run --rm \
  -e SITE_HOST="$SITE_HOST" \
  -e EDITOR_HOST="$EDITOR_HOST" \
  -e PREVIEW_HOST="$PREVIEW_HOST" \
  -e CONSOLE_HOST="$CONSOLE_HOST" \
  -e AUTH_HOST="$AUTH_HOST" \
  -e ACME_EMAIL="$ACME_EMAIL" \
  -v "$APP_DIR/Caddyfile.prod:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "Preflight: building images..."
"${COMPOSE[@]}" build

disable_host_caddy

# Prefer up without volume wipe. Never use down -v here (site-data + caddy_data).
"${COMPOSE[@]}" up -d --build --remove-orphans

echo ""
echo "Multi-service stack started (nginx + cms-api + cms-console + openwebui + oauth2-proxy + edge-router)."
echo "In-compose Caddy (edge-router) serves TLS for:"
echo "  https://${SITE_HOST} (live site — empty until publish)"
echo "  https://www.${SITE_HOST}"
echo "  https://${EDITOR_HOST} (Open WebUI — GitHub OAuth)"
echo "  https://${CONSOLE_HOST} (CMS Console — shared OAuth session)"
echo "  https://${PREVIEW_HOST} (draft preview — public read)"
echo "  https://${AUTH_HOST} (oauth2-proxy callback)"
echo ""
echo "GitHub OAuth App callback URL: https://${AUTH_HOST}/oauth2/callback"
echo ""
echo "First Open WebUI boot can take several minutes. After SSO cutover, send a chat message to confirm streaming."
echo "Check:"
echo "  docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml logs -f openwebui"
echo "  docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml logs -f edge-router"
echo "  docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml logs -f oauth2-proxy"
