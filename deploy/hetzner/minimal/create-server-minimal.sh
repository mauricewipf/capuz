#!/usr/bin/env bash
# Create a Hetzner Cloud VPS for the minimal stack (live nginx site only — no Docker).
# Editor + cms-api run locally via docker-compose.stack.yml.
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

echo "Creating minimal server ${SERVER_NAME} (${SERVER_TYPE}, ${LOCATION})..."
hcloud server create \
  --name "$SERVER_NAME" \
  --type "$SERVER_TYPE" \
  --image "$IMAGE" \
  --location "$LOCATION" \
  --ssh-key "$HCLOUD_SSH_KEY" \
  --user-data-from-file "$SCRIPT_DIR/cloud-init-minimal.yaml"

IP="$(hcloud server ip "$SERVER_NAME" -4)"
echo ""
echo "Server ready."
echo "  Name: $SERVER_NAME"
echo "  IPv4: $IP"
echo ""
echo "Next:"
echo "  1. Point DNS A records for @ and www at ${IP}"
echo "  2. Wait ~60s for cloud-init, then:"
echo "       SITE_DOMAIN=your.domain ./deploy/hetzner/minimal/deploy-minimal.sh root@${IP}"
echo "  3. Copy env template and start the local editor:"
echo "       cp deploy/hetzner/minimal/env.local.example .env"
echo "       # edit .env (SFTP_HOST, secrets, key path)"
echo "       docker compose -f docker-compose.stack.yml -f docker-compose.stack.sftp.yml up --build"
