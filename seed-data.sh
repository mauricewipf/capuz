#!/bin/sh
set -e

mkdir -p /app/data /app/data/.open-webui

MODE="${CAPUZ_SEED:-SKIP}"

fix_permissions() {
  [ -d /app/data/assets ] && chmod -R a+rX /app/data/assets
  [ -d /app/data/.components ] && chmod -R a+rX /app/data/.components
  find /app/data -path /app/data/.open-webui -prune -o -type f -exec chmod a+r {} + 2>/dev/null || true
}

wipe_site_data() {
  find /app/data -mindepth 1 -maxdepth 1 ! -name '.open-webui' -exec rm -rf {} +
}

seed_components() {
  if [ -d /app/seed/.components ]; then
    mkdir -p /app/data/.components
    cp -a /app/seed/.components/. /app/data/.components/
  fi
}

seed_site() {
  cp -a /app/seed/. /app/data/
  fix_permissions
}

case "$MODE" in
  SKIP)
    exit 0
  ;;
  SEED)
    if [ -f /app/data/index.html ]; then
      seed_components
      fix_permissions
      exit 0
    fi
    seed_site
  ;;
  FORCE_OVERWRITE)
    wipe_site_data
    seed_site
  ;;
  *)
    echo "Invalid CAPUZ_SEED=$MODE (use SKIP, SEED, or FORCE_OVERWRITE)" >&2
    exit 1
  ;;
esac
