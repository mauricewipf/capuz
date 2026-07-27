#!/bin/sh
set -e

mkdir -p /app/data

if [ "${CAPUZ_SKIP_SEED:-}" = "1" ] || [ "${CAPUZ_SKIP_SEED:-}" = "true" ]; then
  exit 0
fi

if [ ! -f /app/data/index.html ]; then
  cp -a /app/seed/pages/. /app/data/
  cp -a /app/seed/assets/. /app/data/assets/
fi
