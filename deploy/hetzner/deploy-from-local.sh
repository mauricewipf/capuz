#!/usr/bin/env bash
# Upload production .env and run install-on-server.sh on a VPS.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <user@host> [path-to-env-file]" >&2
  echo "Example: $0 root@203.0.113.10 deploy/hetzner/.env.production" >&2
  exit 1
fi

TARGET="$1"
ENV_FILE="${2:-deploy/hetzner/.env.production}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ ! -f "$REPO_ROOT/$ENV_FILE" ] && [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  echo "Copy deploy/hetzner/env.production.example to deploy/hetzner/.env.production and edit it." >&2
  exit 1
fi

ENV_PATH="$ENV_FILE"
if [ -f "$REPO_ROOT/$ENV_FILE" ]; then
  ENV_PATH="$REPO_ROOT/$ENV_FILE"
fi

echo "Uploading env to ${TARGET}:/opt/capuz/.env ..."
ssh -o StrictHostKeyChecking=accept-new "$TARGET" 'mkdir -p /opt/capuz /opt/capuz/app && chmod 700 /opt/capuz'
scp "$ENV_PATH" "${TARGET}:/opt/capuz/.env"
ssh "$TARGET" 'chmod 600 /opt/capuz/.env'

echo "Syncing repo to ${TARGET}:/opt/capuz/app ..."
rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude bundled-data \
  "$REPO_ROOT/" "${TARGET}:/opt/capuz/app/"

echo "Running install-on-server.sh on ${TARGET} ..."
CAPUZ_STACK="${CAPUZ_STACK:-reference}"
ssh "$TARGET" "CAPUZ_SKIP_GIT_PULL=1 CAPUZ_STACK=${CAPUZ_STACK} CAPUZ_APP_DIR=/opt/capuz/app CAPUZ_ENV_FILE=/opt/capuz/.env bash /opt/capuz/app/deploy/hetzner/install-on-server.sh"

echo ""
echo "Deploy finished. Verify HTTPS for hosts in your env file."
