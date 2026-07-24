#!/usr/bin/env bash
# Provision a Hetzner VPS as the live static site (native nginx + Certbot + Tailscale SFTP).
# Pair with local editor: docker compose -f docker-compose.stack.yml -f docker-compose.stack.sftp.yml
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: SITE_DOMAIN=example.com $0 <user@host> [path-to-sftp-pubkey]" >&2
  echo "Example: SITE_DOMAIN=just-html.com $0 root@203.0.113.10 ~/.ssh/capuz_hetzner_sftp.pub" >&2
  exit 1
fi

TARGET="$1"
PUBKEY="${2:-$HOME/.ssh/capuz_hetzner_sftp.pub}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DOMAIN="${SITE_DOMAIN:-}"

if [ -z "$SITE_DOMAIN" ]; then
  echo "Set SITE_DOMAIN to your apex domain (e.g. SITE_DOMAIN=example.com)." >&2
  exit 1
fi

if [ ! -f "$PUBKEY" ]; then
  echo "Generating SFTP deploy key at ${PUBKEY%.pub}..."
  ssh-keygen -t ed25519 -f "${PUBKEY%.pub}" -N "" -C "capuz-sftp"
fi

echo "Uploading minimal deploy scripts to ${TARGET}..."
ssh -o StrictHostKeyChecking=accept-new "$TARGET" 'mkdir -p /opt/capuz/minimal'
scp "$SCRIPT_DIR"/nginx.site.conf.template "$SCRIPT_DIR"/setup-server.sh \
  "${TARGET}:/opt/capuz/minimal/"
scp "$PUBKEY" "${TARGET}:/tmp/capuz_sftp.pub"

# Pass selected env vars into the remote setup script.
remote_env=(
  "SITE_DOMAIN=$(printf %q "$SITE_DOMAIN")"
  "SFTP_PUBKEY_FILE=/tmp/capuz_sftp.pub"
)
[ -n "${CERTBOT_EMAIL:-}" ] && remote_env+=("CERTBOT_EMAIL=$(printf %q "$CERTBOT_EMAIL")")
[ -n "${TAILSCALE_AUTHKEY:-}" ] && remote_env+=("TAILSCALE_AUTHKEY=$(printf %q "$TAILSCALE_AUTHKEY")")
[ -n "${SITE_ROOT:-}" ] && remote_env+=("SITE_ROOT=$(printf %q "$SITE_ROOT")")
[ -n "${SKIP_CERTBOT:-}" ] && remote_env+=("SKIP_CERTBOT=$(printf %q "$SKIP_CERTBOT")")
[ -n "${SKIP_TAILSCALE_UP:-}" ] && remote_env+=("SKIP_TAILSCALE_UP=$(printf %q "$SKIP_TAILSCALE_UP")")

echo "Running minimal setup on ${TARGET} (SITE_DOMAIN=${SITE_DOMAIN})..."
ssh "$TARGET" "${remote_env[*]} bash /opt/capuz/minimal/setup-server.sh"

echo ""
echo "VPS ready for live pages."
echo "  1. Note Tailscale MagicDNS / IP from server output → set SFTP_HOST in .env"
echo "  2. cp deploy/hetzner/minimal/env.local.example .env"
echo "     Set SITE_BASE_URL=https://${SITE_DOMAIN}, SFTP_HOST, SFTP_KEY_HOST_PATH, secrets"
echo "  3. docker compose -f docker-compose.stack.yml -f docker-compose.stack.sftp.yml up --build"
echo "  4. Open http://localhost:8081 — publish pages to https://${SITE_DOMAIN}"
