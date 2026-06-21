#!/bin/sh
set -e

if [ ! -f /app/data/index.html ]; then
  mkdir -p /app/data
  cp -a /app/seed/. /app/data/
fi
