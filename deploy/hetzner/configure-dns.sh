#!/usr/bin/env bash
# Point web hostnames at a VPS IP using hcloud DNS (Hetzner Cloud Console zones only).
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: ZONE=just-html.com $0 <zone> <ip>" >&2
  echo "Example: $0 just-html.com 203.0.113.10" >&2
  exit 1
fi

ZONE="$1"
IP="$2"

if ! command -v hcloud >/dev/null 2>&1; then
  echo "Install hcloud: brew install hcloud" >&2
  exit 1
fi

echo "Setting A records on ${ZONE} -> ${IP} (@, www, chat, preview)..."
echo "MX/mail records are not changed."

hcloud zone rrset set-records "$ZONE" @ A --record "$IP"
hcloud zone rrset set-records "$ZONE" www A --record "$IP"
hcloud zone rrset set-records "$ZONE" chat A --record "$IP"
hcloud zone rrset set-records "$ZONE" preview A --record "$IP"

echo "Done. TLS certificates issue after DNS propagates (edge-router / Let's Encrypt)."
