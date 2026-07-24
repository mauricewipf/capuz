#!/usr/bin/env bash
# Minimal Hetzner stack: native nginx + Certbot + Tailscale SFTP target.
# Live document root starts empty (placeholder index until you publish from the local editor).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SITE_DOMAIN="${SITE_DOMAIN:-}"
SITE_ROOT="${SITE_ROOT:-/opt/capuz/site-data}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
SFTP_PUBKEY_FILE="${SFTP_PUBKEY_FILE:-}"
SKIP_TAILSCALE_UP="${SKIP_TAILSCALE_UP:-0}"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"
SKIP_UFW_PUBLIC_SSH_LOCKDOWN="${SKIP_UFW_PUBLIC_SSH_LOCKDOWN:-0}"

if [ -z "$SITE_DOMAIN" ]; then
  echo "SITE_DOMAIN is required (e.g. SITE_DOMAIN=example.com)." >&2
  exit 1
fi

install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq nginx certbot python3-certbot-nginx curl ca-certificates ufw
}

install_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then
    echo "Tailscale already installed."
  else
    echo "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
  fi

  if [ "$SKIP_TAILSCALE_UP" = "1" ]; then
    echo "SKIP_TAILSCALE_UP=1 — not running tailscale up."
    return
  fi

  if tailscale status >/dev/null 2>&1; then
    echo "Tailscale already connected."
    return
  fi

  if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
    tailscale up --ssh --accept-routes --auth-key="$TAILSCALE_AUTHKEY"
    return
  fi

  echo "Run: tailscale up --ssh"
  echo "Or set TAILSCALE_AUTHKEY and re-run."
  tailscale up --ssh --accept-routes || true
}

setup_site_root() {
  mkdir -p "$SITE_ROOT/assets"
  chmod 755 /opt/capuz 2>/dev/null || true
  chmod 755 "$SITE_ROOT"
  if [ ! -f "$SITE_ROOT/index.html" ]; then
    cat >"$SITE_ROOT/index.html" <<EOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${SITE_DOMAIN}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <p>Capuz site root — publish pages from the local editor stack.</p>
</body>
</html>
EOF
  fi
  echo "Site root at ${SITE_ROOT}"
}

setup_nginx() {
  local conf_src="$SCRIPT_DIR/nginx.site.conf.template"
  local conf_dst="/etc/nginx/sites-available/${SITE_DOMAIN}"

  if [ ! -f "$conf_src" ]; then
    echo "Missing ${conf_src}" >&2
    exit 1
  fi

  sed -e "s|__SITE_DOMAIN__|${SITE_DOMAIN}|g" \
      -e "s|__SITE_ROOT__|${SITE_ROOT}|g" \
      "$conf_src" >"$conf_dst"

  ln -sf "$conf_dst" /etc/nginx/sites-enabled/"$SITE_DOMAIN"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl reload nginx
}

install_sftp_pubkey() {
  if [ -z "$SFTP_PUBKEY_FILE" ] || [ ! -f "$SFTP_PUBKEY_FILE" ]; then
    echo "No SFTP_PUBKEY_FILE — skip authorized_keys install." >&2
    return
  fi

  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  touch /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys

  pubkey="$(cat "$SFTP_PUBKEY_FILE")"
  if grep -qxF "$pubkey" /root/.ssh/authorized_keys 2>/dev/null; then
    echo "SFTP public key already in authorized_keys."
  else
    echo "$pubkey" >> /root/.ssh/authorized_keys
    echo "Installed SFTP public key for root."
  fi
}

setup_ufw() {
  local tailscale_ok=0
  if tailscale status >/dev/null 2>&1; then
    tailscale_ok=1
  fi

  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow in on tailscale0 to any port 22 proto tcp

  if [ "$SKIP_UFW_PUBLIC_SSH_LOCKDOWN" = "1" ] || [ "$tailscale_ok" -ne 1 ]; then
    ufw allow OpenSSH
    if [ "$tailscale_ok" -ne 1 ]; then
      echo "Tailscale not connected — keeping public SSH open. Join tailnet, then:" >&2
      echo "  ufw delete allow OpenSSH && ufw reload" >&2
    else
      echo "Keeping public SSH open (SKIP_UFW_PUBLIC_SSH_LOCKDOWN=1)."
    fi
  else
    echo "Public SSH closed; use Tailscale for port 22."
  fi

  ufw --force enable
  ufw status
}

run_certbot() {
  if [ "$SKIP_CERTBOT" = "1" ]; then
    echo "SKIP_CERTBOT=1 — skipping certbot."
    return
  fi

  local certbot_args=(--nginx -d "$SITE_DOMAIN" -d "www.${SITE_DOMAIN}" --non-interactive --agree-tos --redirect)
  if [ -n "$CERTBOT_EMAIL" ]; then
    certbot_args+=(--email "$CERTBOT_EMAIL")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi

  certbot "${certbot_args[@]}"
}

echo "=== Capuz minimal Hetzner setup (${SITE_DOMAIN}) ==="
install_packages
install_tailscale
setup_site_root
setup_nginx
install_sftp_pubkey
setup_ufw
run_certbot

echo ""
echo "Done."
echo "  Site root: ${SITE_ROOT}"
echo "  Tailscale: $(tailscale ip -4 2>/dev/null || echo 'not connected')"
echo "  MagicDNS:  $(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | head -1 || tailscale status 2>/dev/null | head -3 || true)"
echo "  Test TLS:  curl -sI https://${SITE_DOMAIN}/"
echo ""
echo "On your laptop, set SFTP_HOST to this machine's Tailscale MagicDNS name or 100.x IP,"
echo "then: docker compose -f docker-compose.stack.yml -f docker-compose.stack.sftp.yml up --build"
