#!/bin/sh
set -e

mkdir -p /app/data /app/data/.open-webui

MODE="${CAPUZ_SEED:-SKIP}"

seed_assets() {
  cp -a /app/seed/assets/. /app/data/assets/
}

seed_pages() {
  find /app/seed -maxdepth 1 -type f \( -name '*.html' -o -name '*.xml' \) -exec cp -a {} /app/data/ \;
}

case "$MODE" in
  SKIP)
    exit 0
  ;;
  SEED)
    if [ -f /app/data/index.html ]; then
      exit 0
    fi
    mkdir -p /app/data/assets
    seed_assets
    seed_pages
  ;;
  FORCE_OVERWRITE)
    rm -rf /app/data/assets
    mkdir -p /app/data/assets
    seed_assets
    seed_pages
  ;;
  *)
    echo "Invalid CAPUZ_SEED=$MODE (use SKIP, SEED, or FORCE_OVERWRITE)" >&2
    exit 1
  ;;
esac
