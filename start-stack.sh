#!/bin/sh
set -e

PORT="${PORT:-10000}"
WEBUI_PORT="${WEBUI_PORT:-8080}"
CMS_API_PORT="${CMS_API_PORT:-3000}"
EDITOR_HOST="${EDITOR_HOST:-localhost}"
PREVIEW_HOST="${PREVIEW_HOST:-preview.localhost}"
DATA_ROOT="${DATA_ROOT:-/app/data}"
DATA_DIR="${DATA_DIR:-/app/data/.open-webui}"

export API_PORT="$CMS_API_PORT"
export DATA_ROOT
export DATA_DIR
export STORAGE_BACKEND="${STORAGE_BACKEND:-fs}"
export DRAFTS_DIR="${DRAFTS_DIR:-.drafts}"
export COMPONENTS_DIR="${COMPONENTS_DIR:-.components}"
export PREVIEW_HOST

if [ -z "$OPENAI_API_KEY" ] && [ -n "$OPENROUTER_API_KEY" ]; then
  export OPENAI_API_KEY="$OPENROUTER_API_KEY"
fi

if [ -z "$PREVIEW_BASE_URL" ]; then
  case "${WEBUI_URL:-}" in
    https://*)
      export PREVIEW_BASE_URL="https://${PREVIEW_HOST}"
      ;;
    *)
      export PREVIEW_BASE_URL="http://${PREVIEW_HOST}:${PORT}"
      ;;
  esac
fi

if [ -z "$TOOL_SERVER_CONNECTIONS" ] && [ -n "$CMS_API_KEY" ]; then
  export TOOL_SERVER_CONNECTIONS="[{\"type\":\"mcp\",\"url\":\"http://127.0.0.1:${CMS_API_PORT}/mcp\",\"path\":\"/mcp\",\"auth_type\":\"bearer\",\"key\":\"${CMS_API_KEY}\",\"config\":{\"enable\":true},\"info\":{\"id\":\"cms-pages\",\"name\":\"CMS Pages\",\"description\":\"Read and write HTML files on the site\"}}]"
fi

/app/seed-data.sh
mkdir -p "$DATA_DIR"

cd /app/cms-api
bun run src/server.js &
CMS_PID=$!

cd /app/backend
PORT="$WEBUI_PORT" bash start.sh &
WEBUI_PID=$!

wait_for() {
  url="$1"
  tries=0
  while [ "$tries" -lt 60 ]; do
    if wget --quiet --tries=1 --spider "$url" 2>/dev/null; then
      return 0
    fi
    tries=$((tries + 1))
    sleep 1
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

wait_for "http://127.0.0.1:${CMS_API_PORT}/health"
wait_for "http://127.0.0.1:${WEBUI_PORT}/health"

export PORT WEBUI_PORT CMS_API_PORT EDITOR_HOST

cleanup() {
  kill "$CMS_PID" "$WEBUI_PID" 2>/dev/null || true
  wait "$CMS_PID" "$WEBUI_PID" 2>/dev/null || true
}
trap cleanup TERM INT

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

wait "$CADDY_PID"
