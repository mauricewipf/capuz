# Deploy Capuz on Hetzner Cloud

Three ways to run Capuz with a Hetzner VPS:

| Mode | VPS | Laptop | When to use |
|------|-----|--------|-------------|
| **Minimal** | Native nginx + TLS; empty site root | `docker-compose.stack.yml` + SFTP over Tailscale | Smallest VPS; editor stays local |
| **Reference** | `docker-compose.yml` (nginx + cms-api + openwebui) behind host Caddy | Deploy scripts only | Same layout as local demo; separate containers; empty live site until publish |
| **Bundled** | Single container (site + chat + preview) behind host Caddy | Deploy scripts only | One Docker image; needs more RAM (4 GB recommended) |

Compared to Render, you control TLS and DNS yourself — no custom-domain slot limits.

Set **`CAPUZ_STACK=reference`** or **`CAPUZ_STACK=bundled`** in `deploy/hetzner/.env.production` (or export it when running `deploy-from-local.sh`). The deploy script defaults to **reference**.

---

## Minimal: local editor + remote live site

```
Laptop                                         Hetzner VPS
┌─────────────────────────────┐                ┌──────────────────────────┐
│ docker-compose.stack.yml    │   SFTP (TS)    │ nginx + Certbot          │
│  Open WebUI :8081           │ ─────────────► │ /opt/capuz/site-data     │
│  cms-api (drafts + publish) │                │ https://YOUR_DOMAIN      │
│  preview.localhost:8081     │                │ Tailscale (SSH / SFTP)   │
└─────────────────────────────┘                └──────────────────────────┘
```

Writes stay as **drafts** on the laptop until you `publish_page`; publish pushes HTML/XML (and assets via the API) to the VPS over SFTP.

### What you do manually

| Step | Why manual |
|------|------------|
| Hetzner Cloud account + API token | Billing / `hcloud` |
| SSH key in Hetzner | `hcloud ssh-key create …` |
| Tailscale on laptop + VPS | Private SFTP path (scripts install Tailscale on the VPS) |
| DNS A records for `@` and `www` | Point at the VPS IPv4 |
| Local `.env` secrets | OpenRouter, `CMS_API_KEY`, `WEBUI_SECRET_KEY`, `SFTP_*` |

### Quick start (from a fresh clone)

```bash
brew install hcloud
hcloud context create capuz-prod    # paste API token
hcloud ssh-key create --name laptop --public-key-from-file ~/.ssh/id_ed25519.pub
export HCLOUD_SSH_KEY=laptop

chmod +x deploy/hetzner/minimal/*.sh

# 1. Create a small Ubuntu VPS (no Docker — live site only)
./deploy/hetzner/minimal/create-server-minimal.sh
# Note the IPv4

# 2. DNS: A @ and A www → that IPv4 (leave mail MX/SPF alone)

# 3. Provision nginx + Certbot + Tailscale + SFTP deploy key
SITE_DOMAIN=your.domain CERTBOT_EMAIL=you@example.com \
  ./deploy/hetzner/minimal/deploy-minimal.sh root@YOUR_VPS_IP

# 4. Local editor
cp deploy/hetzner/minimal/env.local.example .env
# Edit: OPENROUTER_API_KEY, CMS_API_KEY, WEBUI_SECRET_KEY,
#       SFTP_HOST (Tailscale MagicDNS from step 3), SFTP_KEY_HOST_PATH,
#       SITE_BASE_URL=https://your.domain

docker compose -f docker-compose.stack.yml -f docker-compose.stack.sftp.yml up --build
```

Open http://localhost:8081 (chat), http://preview.localhost:8081 (drafts), https://your.domain (live after publish).

Join the VPS to your tailnet when prompted (`tailscale up`), or pass `TAILSCALE_AUTHKEY=…` into `deploy-minimal.sh`. After Tailscale is up, public SSH can be closed (the setup script does this when connected).

### Recommended server size (minimal)

| Plan | RAM | Notes |
|------|-----|--------|
| **cax11** / **cx22** | 2–4 GB | Enough for nginx + TLS |
| Larger | — | Only needed if you also host other services |

### Files (`deploy/hetzner/minimal/`)

| File | Purpose |
|------|---------|
| `create-server-minimal.sh` | `hcloud server create` + lightweight cloud-init |
| `cloud-init-minimal.yaml` | First boot: UFW 22/80/443 |
| `deploy-minimal.sh` | Upload scripts, install SFTP pubkey, run setup |
| `setup-server.sh` | nginx, Certbot, Tailscale, UFW, `/opt/capuz/site-data` |
| `nginx.site.conf.template` | HTTP vhost (Certbot adds HTTPS) |
| `env.local.example` | Laptop `.env` for stack + SFTP |

Companion compose override at repo root: **`docker-compose.stack.sftp.yml`** (mounts `SFTP_KEY_HOST_PATH`).

### Verify

```bash
curl -sI https://your.domain/ | head -5
# From laptop, with stack up and STORAGE_BACKEND=sftp:
curl -H "Authorization: Bearer $CMS_API_KEY" http://localhost:8081/…   # via Open WebUI tools / MCP
```

Publish a page from the editor, then confirm it appears on the live domain.

---

## Reference: full stack on the VPS (`docker-compose.yml`)

Multi-container production deploy of the **reference demo stack** — same services as local `docker compose up`, but on the VPS with **host Caddy** for TLS and **no in-compose `editor-router`**. The live site volume starts **empty** (no demo HTML/assets seeded); pages appear after `publish_page` from chat.

```
Internet
   │
   ▼
Host Caddy (:443, Let's Encrypt)     deploy/hetzner/Caddyfile.host.template
   │  SITE_HOST / www     → 127.0.0.1:8080  (nginx)
   │  EDITOR_HOST (chat)  → 127.0.0.1:8082  (openwebui)
   │  PREVIEW_HOST         → 127.0.0.1:3000  (cms-api preview vhost)
   ▼
docker compose (nginx + cms-api + openwebui)
   └─ shared volume site-data  (published pages + .drafts; not seeded from public/)
```

Local dev still runs all four compose services including `editor-router` on `:8081`; production skips `editor-router` because host Caddy routes by hostname directly.

### Manual checklist (reference)

| Step | Why manual |
|------|------------|
| Hetzner Cloud account + API token | Billing / `hcloud` |
| SSH access to VPS | Public IP or **Tailscale** (`root@your-host.tailnet`) |
| Production `.env` | Copy `env.production.example` → `.env.production`; set `CAPUZ_STACK=reference` and secrets |
| DNS A records | `@`, `www`, `chat`, `preview` → VPS IPv4 |
| Keep mail DNS | Do **not** remove MX/SPF/SRV if you use Hetzner mail |

### Recommended server size (reference)

| Plan | RAM | Notes |
|------|-----|--------|
| **cpx12** / **cx22** | 2–4 GB | 2 GB works with 2 GB swap + lean Open WebUI env; tight |
| cx22+ | 4 GB | Comfortable for Open WebUI + cms-api + nginx |

Install script creates **2 GB swap** if missing. Set lean Open WebUI flags in `.env.production` (see `env.production.example` — `RAG_EMBEDDING_ENGINE=openai`, disable Ollama, code exec, memories, etc.).

### Quick deploy (reference)

```bash
brew install hcloud
hcloud context create capuz-prod

chmod +x deploy/hetzner/*.sh

cp deploy/hetzner/env.production.example deploy/hetzner/.env.production
# Edit: CAPUZ_STACK=reference, OPENROUTER_API_KEY, CMS_API_KEY, WEBUI_SECRET_KEY,
#       SITE_HOST, EDITOR_HOST, PREVIEW_HOST, WEBUI_URL, PREVIEW_BASE_URL

# DNS: A @, www, chat, preview → VPS IP
./deploy/hetzner/configure-dns.sh your.domain YOUR_VPS_IP

# Deploy (Tailscale example; use root@YOUR_VPS_IP if public SSH is open)
CAPUZ_STACK=reference ./deploy/hetzner/deploy-from-local.sh \
  root@your-host.tailnet deploy/hetzner/.env.production
```

### Verify (reference)

```bash
curl -sI https://your.domain/ | head -5          # 404 until first publish (expected)
curl -sI https://www.your.domain/ | head -5
curl -sI https://chat.your.domain/ | head -5       # Open WebUI
curl -sI https://preview.your.domain/health | head -5
```

Smoke test: log into chat → MCP tools → write draft → preview → publish → page on apex.

### Redeploy / update (reference)

```bash
CAPUZ_STACK=reference ./deploy/hetzner/deploy-from-local.sh \
  root@your-host.tailnet deploy/hetzner/.env.production
```

### Files (`deploy/hetzner/` — reference)

| File | Purpose |
|------|---------|
| `docker-compose.reference.production.yml` | Localhost port binds, `CAPUZ_SKIP_SEED`, production env overrides |
| `Caddyfile.host.template` | Host TLS; routes apex/www/chat/preview to three localhost ports |
| `deploy-from-local.sh` | SCP `.env` + rsync repo + remote install (defaults `CAPUZ_STACK=reference`) |
| `install-on-server.sh` | Reference vs bundled path; swap; Docker/Caddy bootstrap |
| `configure-dns.sh` | Optional `hcloud zone rrset` for web records |
| `env.production.example` | Production template incl. lean Open WebUI flags |

Root: **`seed-data.sh`** respects `CAPUZ_SKIP_SEED=1` (production nginx skips copying `public/pages` and `public/assets`).

### Operations (reference)

```bash
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.reference.production.yml ps'
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.reference.production.yml logs -f openwebui'
ssh root@YOUR_VPS 'journalctl -u caddy -f'
ssh root@YOUR_VPS 'docker stats --no-stream'
```

Firewall: **80**, **443** public. App containers listen on **127.0.0.1** only.

---

## Bundled: everything in one container

Single VPS running the **bundled** stack (`Dockerfile.bundled`): live site + Open WebUI + draft preview in one Docker container, with **host Caddy** for HTTPS on three hostnames.

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

Persistent data: Docker volume `bundled-data` → `/app/data`.

### Manual checklist (bundled)

| Step | Why manual |
|------|------------|
| **1. Hetzner Cloud account + project** | Billing and ownership |
| **2. API token** | [console.hetzner.cloud](https://console.hetzner.cloud) → Security → API tokens |
| **3. `hcloud context create`** | `brew install hcloud` |
| **4. SSH key in Hetzner** | `hcloud ssh-key create --name laptop --public-key-from-file ~/.ssh/id_ed25519.pub` |
| **5. Production `.env`** | Copy `env.production.example` → `.env.production`; set secrets and hosts |
| **6. DNS A records** | `@`, `www`, `chat`, `preview` → VPS IPv4 |
| **7. Keep mail DNS** | Do **not** remove MX/SPF/SRV if you use Hetzner mail |

### Recommended server size (bundled)

| Plan | RAM | Notes |
|------|-----|--------|
| **cx22** (default) | 4 GB | Recommended minimum |
| cx32 | 8 GB | Heavier chat / concurrent edits |

Open WebUI first boot can take several minutes while embedding models cache to disk.

### Quick deploy (bundled)

```bash
brew install hcloud
hcloud context create capuz-prod
hcloud ssh-key create --name laptop --public-key-from-file ~/.ssh/id_ed25519.pub
export HCLOUD_SSH_KEY=laptop

chmod +x deploy/hetzner/*.sh
./deploy/hetzner/create-server.sh

cp deploy/hetzner/env.production.example deploy/hetzner/.env.production
# Edit secrets + SITE_HOST / EDITOR_HOST / PREVIEW_HOST
openssl rand -hex 32   # CMS_API_KEY
openssl rand -hex 32   # WEBUI_SECRET_KEY

# DNS: A @, www, chat, preview → VPS IP
# Or: ./deploy/hetzner/configure-dns.sh just-html.com YOUR_VPS_IP

# Wait ~60s for cloud-init, then:
CAPUZ_STACK=bundled ./deploy/hetzner/deploy-from-local.sh root@YOUR_VPS_IP deploy/hetzner/.env.production
```

```bash
curl -sI https://just-html.com/ | head -5
curl -sI https://chat.just-html.com/ | head -5
curl -sI https://preview.just-html.com/ | head -5
```

### Redeploy / update (bundled)

```bash
CAPUZ_STACK=bundled ./deploy/hetzner/deploy-from-local.sh root@YOUR_VPS_IP deploy/hetzner/.env.production
```

### Files (`deploy/hetzner/` — bundled)

| File | Purpose |
|------|---------|
| `cloud-init.yaml` | First boot: Docker, Caddy, UFW, `/opt/capuz` |
| `create-server.sh` | `hcloud server create` wrapper |
| `deploy-from-local.sh` | SCP `.env` + remote install |
| `install-on-server.sh` | Clone/pull repo, Caddyfile, `docker compose up` |
| `configure-dns.sh` | Optional `hcloud zone rrset` for web records |
| `Caddyfile.template` | Bundled: host TLS → single container on `8081` |
| `Caddyfile.host.template` | Reference: host TLS → nginx / openwebui / cms-api ports |
| `docker-compose.production.yml` | Bundled: bind `8081` to localhost, `restart: unless-stopped` |
| `docker-compose.reference.production.yml` | Reference: three services, localhost binds, skip seed |
| `env.production.example` | Production env template (`CAPUZ_STACK`, lean Open WebUI flags) |

### Operations (bundled)

```bash
ssh root@YOUR_VPS_IP 'cd /opt/capuz/app && docker compose -f docker-compose.bundled.yml -f deploy/hetzner/docker-compose.production.yml logs -f'
ssh root@YOUR_VPS_IP 'journalctl -u caddy -f'
hcloud server ssh capuz
```

Firewall (bundled cloud-init): **22**, **80**, **443**. App listens on **127.0.0.1:8081**.

---

## Migrating from Render

1. Prefer **minimal**, **reference**, or **bundled** deploy above.
2. Copy site data if needed (export disk / republish via API).
3. Update DNS from Render to the VPS IP.
4. Suspend Render when satisfied.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Minimal: SFTP auth fails | Tailscale up on laptop + VPS; `SFTP_HOST` = MagicDNS; key mounted via `docker-compose.stack.sftp.yml` |
| Minimal: TLS / empty site | DNS `@`/`www` → VPS; `certbot` / nginx; publish from editor (root starts with placeholder `index.html`) |
| Reference: apex 404 | Expected until first `publish_page`; `CAPUZ_SKIP_SEED=1` — no demo seed |
| Reference: chat `/error` or 502 | Open WebUI not ready; check `PORT=8080` inside container (not `8081` from laptop `.env`); compose logs |
| Reference: preview 502 | cms-api health on `127.0.0.1:3000`; `PREVIEW_HOST` matches DNS |
| Reference / bundled: TLS error on chat/preview | DNS A records; `systemctl status caddy` |
| Reference / bundled: 502 from Caddy | Containers not up; compose logs |
| Chat slow on first visit | Open WebUI still starting |

## Security notes

- Set `ENABLE_SIGNUP=false` in production / local `.env`.
- Use strong `CMS_API_KEY` and `WEBUI_SECRET_KEY`.
- Minimal: prefer Tailscale-only SSH after join; do not expose CMS/editor ports on the VPS.
- Reference / bundled: keep `/opt/capuz/.env` mode `600`; app ports on localhost only.

See also [README.md](../README.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).
