#!/usr/bin/env bash
# Create a Hetzner Cloud VPS with Docker preinstalled (cloud-init).
# Reference stack: in-compose edge-router handles TLS.
# Bundled stack: install-on-server.sh installs host Caddy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SERVER_NAME="${SERVER_NAME:-capuz}"
SERVER_TYPE="${SERVER_TYPE:-cax11}"
LOCATION="${LOCATION:-nbg1}"
IMAGE="${IMAGE:-ubuntu-24.04}"

if ! command -v hcloud >/dev/null 2>&1; then
  echo "Install hcloud: brew install hcloud" >&2
  exit 1
fi

if [ -z "${HCLOUD_SSH_KEY:-}" ]; then
  echo "Set HCLOUD_SSH_KEY to your hcloud SSH key name (hcloud ssh-key list)." >&2
  exit 1
fi

echo "Creating server ${SERVER_NAME} (${SERVER_TYPE}, ${LOCATION})..."
hcloud server create \
  --name "$SERVER_NAME" \
  --type "$SERVER_TYPE" \
  --image "$IMAGE" \
  --location "$LOCATION" \
  --ssh-key "$HCLOUD_SSH_KEY" \
  --user-data-from-file "$SCRIPT_DIR/cloud-init.yaml"

IP="$(hcloud server ip "$SERVER_NAME" -4)"
echo ""
echo "Server ready."
echo "  Name: $SERVER_NAME"
echo "  IPv4: $IP"
echo ""
echo "Next (manual):"
echo "  1. cp deploy/hetzner/env.production.example deploy/hetzner/.env.production"
echo "  2. Fill secrets and domain in deploy/hetzner/.env.production"
echo "  3. ./deploy/hetzner/deploy-from-local.sh root@${IP} deploy/hetzner/.env.production"
echo ""
echo "Or wait ~60s for cloud-init, then point DNS A records for @, chat, preview to ${IP}."
