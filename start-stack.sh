#!/bin/sh
set -e

PORT="${PORT:-10000}"
WEBUI_PORT="${WEBUI_PORT:-8080}"
CMS_API_PORT="${CMS_API_PORT:-3000}"
NGINX_PORT="${NGINX_PORT:-8088}"
DATA_ROOT="${DATA_ROOT:-/app/data}"
DATA_DIR="${DATA_DIR:-/app/data/.open-webui}"

# Prefer CHAT_HOST; keep EDITOR_HOST as a backward-compatible alias.
if [ -z "$CHAT_HOST" ] && [ -n "$EDITOR_HOST" ]; then
  CHAT_HOST="$EDITOR_HOST"
fi

# On Render, derive hosts from the assigned hostname when not set explicitly.
# Nested *.onrender.com names (chat.<service>.onrender.com) do not resolve on
# Render DNS — for production set SITE_HOST / CHAT_HOST / PREVIEW_HOST to a
# real domain and attach those custom domains to the service.
if [ -n "$RENDER_EXTERNAL_HOSTNAME" ]; then
  SITE_HOST="${SITE_HOST:-$RENDER_EXTERNAL_HOSTNAME}"
  # Prefer explicit custom-domain overrides; otherwise keep chat/preview on
  # derived names so Host routing works once those domains are attached.
  CHAT_HOST="${CHAT_HOST:-chat.${RENDER_EXTERNAL_HOSTNAME}}"
  PREVIEW_HOST="${PREVIEW_HOST:-preview.${RENDER_EXTERNAL_HOSTNAME}}"
fi

SITE_HOST="${SITE_HOST:-localhost}"
CHAT_HOST="${CHAT_HOST:-chat.localhost}"
PREVIEW_HOST="${PREVIEW_HOST:-preview.localhost}"

export API_PORT="$CMS_API_PORT"
export DATA_ROOT
export DATA_DIR
export STORAGE_BACKEND="${STORAGE_BACKEND:-fs}"
export DRAFTS_DIR="${DRAFTS_DIR:-.drafts}"
export COMPONENTS_DIR="${COMPONENTS_DIR:-.components}"
export PREVIEW_HOST
export SITE_HOST
export CHAT_HOST
export NGINX_PORT

if [ -z "$OPENAI_API_KEY" ] && [ -n "$OPENROUTER_API_KEY" ]; then
  export OPENAI_API_KEY="$OPENROUTER_API_KEY"
fi

if [ -z "$SITE_BASE_URL" ]; then
  case "${WEBUI_URL:-}" in
    https://*)
      export SITE_BASE_URL="https://${SITE_HOST}"
      ;;
    *)
      if [ "$PORT" = "80" ] || [ "$PORT" = "443" ]; then
        export SITE_BASE_URL="http://${SITE_HOST}"
      else
        export SITE_BASE_URL="http://${SITE_HOST}:${PORT}"
      fi
      ;;
  esac
fi

if [ -z "$PREVIEW_BASE_URL" ]; then
  case "${WEBUI_URL:-}${SITE_BASE_URL:-}" in
    https://*)
      export PREVIEW_BASE_URL="https://${PREVIEW_HOST}"
      ;;
    *)
      if [ "$PORT" = "80" ] || [ "$PORT" = "443" ]; then
        export PREVIEW_BASE_URL="http://${PREVIEW_HOST}"
      else
        export PREVIEW_BASE_URL="http://${PREVIEW_HOST}:${PORT}"
      fi
      ;;
  esac
fi

if [ -z "$WEBUI_URL" ]; then
  case "${SITE_BASE_URL:-}" in
    https://*)
      export WEBUI_URL="https://${CHAT_HOST}"
      ;;
    *)
      if [ "$PORT" = "80" ] || [ "$PORT" = "443" ]; then
        export WEBUI_URL="http://${CHAT_HOST}"
      else
        export WEBUI_URL="http://${CHAT_HOST}:${PORT}"
      fi
      ;;
  esac
fi

if [ -z "$TOOL_SERVER_CONNECTIONS" ] && [ -n "$CMS_API_KEY" ]; then
  export TOOL_SERVER_CONNECTIONS="[{\"type\":\"mcp\",\"url\":\"http://127.0.0.1:${CMS_API_PORT}/mcp\",\"path\":\"/mcp\",\"auth_type\":\"bearer\",\"key\":\"${CMS_API_KEY}\",\"config\":{\"enable\":true},\"info\":{\"id\":\"cms-pages\",\"name\":\"CMS Pages\",\"description\":\"Read and write HTML files on the site\"}}]"
fi

/app/seed-data.sh
mkdir -p "$DATA_DIR"

# Live site via nginx (same document root as cms-api / DATA_ROOT)
NGINX_CONF=/tmp/nginx-stack.conf
sed "s/NGINX_PORT_PLACEHOLDER/${NGINX_PORT}/g" /etc/nginx/nginx.stack.conf > "$NGINX_CONF"
nginx -c "$NGINX_CONF" -g "daemon off;" &
NGINX_PID=$!

cd /app/cms-api
bun run src/server.js &
CMS_PID=$!

cd /app/backend
PORT="$WEBUI_PORT" bash start.sh &
WEBUI_PID=$!

wait_for() {
  url="$1"
  max_tries="${2:-90}"
  tries=0
  while [ "$tries" -lt "$max_tries" ]; do
    if wget --quiet --tries=1 --spider "$url" 2>/dev/null; then
      return 0
    fi
    tries=$((tries + 1))
    sleep 1
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

wait_for "http://127.0.0.1:${NGINX_PORT}/" 60
wait_for "http://127.0.0.1:${CMS_API_PORT}/health" 60

export PORT WEBUI_PORT CMS_API_PORT NGINX_PORT SITE_HOST CHAT_HOST PREVIEW_HOST

echo "Stack starting: site=${SITE_HOST} chat=${CHAT_HOST} preview=${PREVIEW_HOST} port=${PORT}"

cleanup() {
  kill "$CADDY_PID" "$CMS_PID" "$WEBUI_PID" "$NGINX_PID" 2>/dev/null || true
  wait "$CADDY_PID" "$CMS_PID" "$WEBUI_PID" "$NGINX_PID" 2>/dev/null || true
}
trap cleanup TERM INT

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

# Open WebUI first boot can download embedding models; allow plenty of time.
# After the model is cached on the persistent disk, startups are much faster.
if wait_for "http://127.0.0.1:${WEBUI_PORT}/health" 1200; then
  echo "Stack ready: site=${SITE_HOST} chat=${CHAT_HOST} preview=${PREVIEW_HOST} port=${PORT}"
else
  echo "Open WebUI not healthy yet; continuing (site/preview may still work)" >&2
fi

wait "$CADDY_PID"
