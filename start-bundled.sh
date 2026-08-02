#!/bin/sh
set -e

PORT="${PORT:-10000}"
WEBUI_PORT="${WEBUI_PORT:-8080}"
CMS_API_PORT="${CMS_API_PORT:-3000}"
NGINX_PORT="${NGINX_PORT:-8088}"
DATA_ROOT="${DATA_ROOT:-/app/data}"
DATA_DIR="${DATA_DIR:-/app/data/.open-webui}"
CAPUZ_SERVE_SITE="${CAPUZ_SERVE_SITE:-true}"

export STORAGE_BACKEND="${STORAGE_BACKEND:-fs}"

case "$CAPUZ_SERVE_SITE" in
  true|1|yes)
    CAPUZ_SERVE_SITE=true
    if [ "$STORAGE_BACKEND" != "fs" ]; then
      echo "CAPUZ_SERVE_SITE=true requires STORAGE_BACKEND=fs (got ${STORAGE_BACKEND})." >&2
      exit 1
    fi
    SITE_HOST="${SITE_HOST:-localhost}"
    EDITOR_HOST="${EDITOR_HOST:-chat.localhost}"
    PREVIEW_HOST="${PREVIEW_HOST:-preview.localhost}"
    ;;
  false|0|no)
    CAPUZ_SERVE_SITE=false
    if [ "$STORAGE_BACKEND" = "fs" ]; then
      echo "CAPUZ_SERVE_SITE=false requires STORAGE_BACKEND=sftp, git, or s3 (not fs)." >&2
      exit 1
    fi
    case "$STORAGE_BACKEND" in
      sftp|git|s3) ;;
      *)
        echo "CAPUZ_SERVE_SITE=false requires STORAGE_BACKEND=sftp, git, or s3 (got ${STORAGE_BACKEND})." >&2
        exit 1
        ;;
    esac
    EDITOR_HOST="${EDITOR_HOST:-localhost}"
    PREVIEW_HOST="${PREVIEW_HOST:-preview.localhost}"
    ;;
  *)
    echo "Invalid CAPUZ_SERVE_SITE=${CAPUZ_SERVE_SITE} (use true or false)." >&2
    exit 1
    ;;
esac

export API_PORT="$CMS_API_PORT"
export DATA_ROOT
export DATA_DIR
export DRAFTS_DIR="${DRAFTS_DIR:-.drafts}"
export COMPONENTS_DIR="${COMPONENTS_DIR:-.components}"
export PREVIEW_HOST
export EDITOR_HOST
export NGINX_PORT
if [ "$CAPUZ_SERVE_SITE" = "true" ]; then
  export SITE_HOST
fi

if [ -z "$OPENAI_API_KEY" ] && [ -n "$OPENROUTER_API_KEY" ]; then
  export OPENAI_API_KEY="$OPENROUTER_API_KEY"
fi

url_for_host() {
  host="$1"
  case "${WEBUI_URL:-}${SITE_BASE_URL:-}" in
    https://*)
      printf 'https://%s' "$host"
      ;;
    *)
      if [ "$PORT" = "80" ] || [ "$PORT" = "443" ]; then
        printf 'http://%s' "$host"
      else
        printf 'http://%s:%s' "$host" "$PORT"
      fi
      ;;
  esac
}

if [ "$CAPUZ_SERVE_SITE" = "true" ] && [ -z "$SITE_BASE_URL" ]; then
  export SITE_BASE_URL="$(url_for_host "$SITE_HOST")"
fi

if [ -z "$PREVIEW_BASE_URL" ]; then
  export PREVIEW_BASE_URL="$(url_for_host "$PREVIEW_HOST")"
fi

if [ -z "$WEBUI_URL" ]; then
  export WEBUI_URL="$(url_for_host "$EDITOR_HOST")"
fi

if [ -z "$TOOL_SERVER_CONNECTIONS" ] && [ -n "$CMS_API_KEY" ]; then
  export TOOL_SERVER_CONNECTIONS="[{\"type\":\"mcp\",\"url\":\"http://127.0.0.1:${CMS_API_PORT}/mcp\",\"path\":\"/mcp\",\"auth_type\":\"bearer\",\"key\":\"${CMS_API_KEY}\",\"config\":{\"enable\":true},\"info\":{\"id\":\"cms-pages\",\"name\":\"CMS Pages\",\"description\":\"Read and write HTML files on the site\"}}]"
fi

NGINX_PID=""

if [ "$CAPUZ_SERVE_SITE" = "true" ]; then
  /app/seed-data.sh
fi

mkdir -p "$DATA_DIR"

if [ "$CAPUZ_SERVE_SITE" = "true" ]; then
  NGINX_CONF=/tmp/nginx-bundled.conf
  sed "s/NGINX_PORT_PLACEHOLDER/${NGINX_PORT}/g" /etc/nginx/nginx.bundled.conf > "$NGINX_CONF"
  nginx -c "$NGINX_CONF" -g "daemon off;" &
  NGINX_PID=$!
fi

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

prepare_caddy_config() {
  CADDY_CONF=/tmp/caddy.conf
  {
    echo ":{\$PORT} {"
    echo "	@preview host {\$PREVIEW_HOST}"
    echo "	handle @preview {"
    echo "		reverse_proxy 127.0.0.1:{\$CMS_API_PORT}"
    echo "	}"
    echo ""
    echo "	@editor host {\$EDITOR_HOST}"
    echo "	handle @editor {"
    echo "		reverse_proxy 127.0.0.1:{\$WEBUI_PORT}"
    echo "	}"
    if [ "$CAPUZ_SERVE_SITE" = "true" ]; then
      echo ""
      echo "	@site host {\$SITE_HOST} www.{\$SITE_HOST}"
      echo "	handle @site {"
      echo "		reverse_proxy 127.0.0.1:{\$NGINX_PORT}"
      echo "	}"
      echo ""
      echo "	@loopback host localhost 127.0.0.1"
      echo "	handle @loopback {"
      echo "		reverse_proxy 127.0.0.1:{\$NGINX_PORT}"
      echo "	}"
      echo ""
      echo "	handle {"
      echo "		respond 404"
      echo "	}"
    else
      echo ""
      echo "	handle {"
      echo "		reverse_proxy 127.0.0.1:{\$WEBUI_PORT}"
      echo "	}"
    fi
    echo "}"
  } > "$CADDY_CONF"
}

if [ "$CAPUZ_SERVE_SITE" = "true" ]; then
  wait_for "http://127.0.0.1:${NGINX_PORT}/" 60
fi
wait_for "http://127.0.0.1:${CMS_API_PORT}/health" 60

export PORT WEBUI_PORT CMS_API_PORT
if [ "$CAPUZ_SERVE_SITE" = "true" ]; then
  export NGINX_PORT SITE_HOST EDITOR_HOST PREVIEW_HOST
  echo "Bundled starting: mode=site site=${SITE_HOST} editor=${EDITOR_HOST} preview=${PREVIEW_HOST} port=${PORT}"
else
  export EDITOR_HOST PREVIEW_HOST
  echo "Bundled starting: mode=editor editor=${EDITOR_HOST} preview=${PREVIEW_HOST} port=${PORT} backend=${STORAGE_BACKEND}"
fi

prepare_caddy_config
CADDY_CONF=/tmp/caddy.conf

cleanup() {
  if [ -n "$NGINX_PID" ]; then
    kill "$CADDY_PID" "$CMS_PID" "$WEBUI_PID" "$NGINX_PID" 2>/dev/null || true
    wait "$CADDY_PID" "$CMS_PID" "$WEBUI_PID" "$NGINX_PID" 2>/dev/null || true
  else
    kill "$CADDY_PID" "$CMS_PID" "$WEBUI_PID" 2>/dev/null || true
    wait "$CADDY_PID" "$CMS_PID" "$WEBUI_PID" 2>/dev/null || true
  fi
}
trap cleanup TERM INT

caddy run --config "$CADDY_CONF" --adapter caddyfile &
CADDY_PID=$!

# Open WebUI first boot can download embedding models; allow plenty of time.
if wait_for "http://127.0.0.1:${WEBUI_PORT}/health" 1200; then
  if [ "$CAPUZ_SERVE_SITE" = "true" ]; then
    echo "Bundled ready: mode=site site=${SITE_HOST} editor=${EDITOR_HOST} preview=${PREVIEW_HOST} port=${PORT}"
  else
    echo "Bundled ready: mode=editor editor=${EDITOR_HOST} preview=${PREVIEW_HOST} port=${PORT}"
  fi
else
  echo "Open WebUI not healthy yet; continuing (preview may still work)" >&2
fi

wait "$CADDY_PID"
