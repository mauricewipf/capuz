# Deploy Capuz bundled on Hetzner Cloud

Single VPS running the **bundled** stack (`Dockerfile.bundled`): live site + Open WebUI + draft preview on one Docker container, with **host Caddy** for HTTPS on three hostnames.

Compared to Render, you control TLS and DNS yourself — no custom-domain slot limits.

## Architecture

```
Internet
   │
   ▼
Host Caddy (:443, Let's Encrypt)     deploy/hetzner/Caddyfile.template
   │  reverse_proxy 127.0.0.1:8081
   ▼
Bundled container (docker-compose.bundled.yml)
   ├─ Caddy (in-container) → routes by Host
   ├─ nginx        → SITE_HOST (live pages)
   ├─ Open WebUI   → EDITOR_HOST (chat)
   └─ cms-api      → PREVIEW_HOST (draft preview)
```

Persistent data: Docker volume `bundled-data` → `/app/data` (pages, drafts, Open WebUI state).

## What you do manually (checklist)

These steps require your account, secrets, or DNS — they cannot be fully automated without your credentials.

| Step | Why manual |
|------|------------|
| **1. Hetzner Cloud account + project** | Billing and ownership |
| **2. API token** | Create once at [console.hetzner.cloud](https://console.hetzner.cloud) → Security → API tokens |
| **3. `hcloud context create`** | Paste token locally (`brew install hcloud`) |
| **4. SSH key in Hetzner** | `hcloud ssh-key create --name laptop --public-key-from-file ~/.ssh/id_ed25519.pub` |
| **5. Production `.env`** | Copy `deploy/hetzner/env.production.example` → `deploy/hetzner/.env.production`, set `OPENROUTER_API_KEY`, `CMS_API_KEY`, `WEBUI_SECRET_KEY`, domain hosts |
| **6. DNS A records** | Point `@`, `www`, `chat`, `preview` at the VPS IPv4 (Hetzner DNS Console or `configure-dns.sh` if zone is in Cloud Console) |
| **7. Keep mail DNS** | Do **not** remove MX/SPF/SRV records if you use Hetzner mail on the same domain |

Everything else can be scripted (see below).

## Recommended server size

| Plan | RAM | Notes |
|------|-----|--------|
| **cx22** (default) | 4 GB | Recommended minimum |
| cx32 | 8 GB | Heavier chat / concurrent edits |

Open WebUI first boot can take several minutes while embedding models cache to disk.

## Quick deploy (from your laptop)

### 1. One-time local setup

```bash
brew install hcloud
hcloud context create capuz-prod    # paste API token

hcloud ssh-key create --name laptop --public-key-from-file ~/.ssh/id_ed25519.pub
export HCLOUD_SSH_KEY=laptop
```

### 2. Create VPS

```bash
chmod +x deploy/hetzner/*.sh

# Optional: SERVER_TYPE=cx32 LOCATION=fsn1
./deploy/hetzner/create-server.sh
```

Note the **IPv4** printed at the end.

### 3. Prepare secrets (manual)

```bash
cp deploy/hetzner/env.production.example deploy/hetzner/.env.production
# Edit: OPENROUTER_API_KEY, CMS_API_KEY, WEBUI_SECRET_KEY, SITE_HOST, EDITOR_HOST, PREVIEW_HOST
openssl rand -hex 32   # use for CMS_API_KEY
openssl rand -hex 32   # use for WEBUI_SECRET_KEY
```

`deploy/hetzner/.env.production` is gitignored — never commit it.

### 4. DNS (manual at registrar, or hcloud)

**Option A — Hetzner DNS web UI** (dns.hetzner.com or Cloud Console):

| Type | Name | Value |
|------|------|--------|
| A | `@` | `<VPS IPv4>` |
| A | `www` | `<VPS IPv4>` |
| A | `chat` | `<VPS IPv4>` |
| A | `preview` | `<VPS IPv4>` |

Leave MX / mail records unchanged.

**Option B — hcloud** (zone must live in Hetzner **Cloud Console**, API token from console.hetzner.cloud):

```bash
./deploy/hetzner/configure-dns.sh just-html.com YOUR_VPS_IP
```

### 5. Deploy app

Wait ~60 seconds after server create for cloud-init (Docker + Caddy).

```bash
./deploy/hetzner/deploy-from-local.sh root@YOUR_VPS_IP deploy/hetzner/.env.production
```

This rsyncs your **local checkout** to the server (no need to push to GitHub first). Later redeploys use the same command; set `CAPUZ_SKIP_GIT_PULL=0` on the server if you switch to git-only updates from `main`.

### 6. Verify

```bash
curl -sI https://just-html.com/ | head -5
curl -sI https://chat.just-html.com/ | head -5
curl -sI https://preview.just-html.com/ | head -5
ssh root@YOUR_VPS_IP 'docker compose -f /opt/capuz/app/docker-compose.bundled.yml -f /opt/capuz/app/deploy/hetzner/docker-compose.production.yml ps'
```

First chat load may take a few minutes (`logs -f` on the bundled service).

## Redeploy / update

After pushing changes to `main`, or to refresh env:

```bash
./deploy/hetzner/deploy-from-local.sh root@YOUR_VPS_IP deploy/hetzner/.env.production
```

`install-on-server.sh` pulls latest `main`, rebuilds the image, and reloads host Caddy.

## Files in `deploy/hetzner/`

| File | Purpose |
|------|---------|
| `cloud-init.yaml` | First boot: Docker, Caddy, UFW, `/opt/capuz` |
| `create-server.sh` | `hcloud server create` wrapper |
| `deploy-from-local.sh` | SCP `.env` + remote install |
| `install-on-server.sh` | Clone/pull repo, Caddyfile, `docker compose up` |
| `configure-dns.sh` | Optional `hcloud zone rrset` for web records |
| `Caddyfile.template` | Host TLS + reverse proxy |
| `docker-compose.production.yml` | Bind `8081` to localhost, `restart: unless-stopped` |
| `env.production.example` | Production env template |

## Operations

```bash
# Logs
ssh root@YOUR_VPS_IP 'cd /opt/capuz/app && docker compose -f docker-compose.bundled.yml -f deploy/hetzner/docker-compose.production.yml logs -f'

# Host Caddy
ssh root@YOUR_VPS_IP 'journalctl -u caddy -f'

# Shell on server
hcloud server ssh capuz
```

## Firewall

Cloud-init enables UFW: **22**, **80**, **443** only. The bundled app listens on **127.0.0.1:8081** (not public).

## Migrating from Render

1. Deploy on Hetzner (this guide).
2. Copy site data if needed: export Render disk / republish pages via API.
3. Update DNS from Render (`216.24.57.1`) to VPS IP for `@`, `www`, `chat`, `preview`.
4. Suspend Render service when satisfied.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| TLS error on chat/preview | DNS A record → VPS IP; host Caddy running (`systemctl status caddy`) |
| 502 from Caddy | Container not up; `docker compose … ps` and logs |
| Chat slow / 502 on first visit | Open WebUI still starting; wait up to ~20 min first boot |
| Caddy cert failure | Port 80 must reach VPS for HTTP-01; verify UFW and DNS |

## Security notes

- Set `ENABLE_SIGNUP=false` in production `.env`.
- Use strong `CMS_API_KEY` and `WEBUI_SECRET_KEY`.
- Keep `/opt/capuz/.env` mode `600`.

See also [README.md](../README.md) (environment variables) and [ARCHITECTURE.md](../ARCHITECTURE.md) (bundled design).
