# Deploy Capuz on Hetzner Cloud

Production on Hetzner uses the **reference stack**: `docker-compose.yml` plus `deploy/hetzner/docker-compose.reference.production.yml`. Four containers (`nginx`, `cms-api`, `openwebui`, `edge-router`) share a `site-data` volume. In-compose Caddy (`edge-router`) terminates TLS on `:80`/`:443` with Let's Encrypt (`ACME_EMAIL`, `Caddyfile.prod`).

Compared to Render, you control TLS and DNS yourself — no custom-domain slot limits.

For a laptop editor with a remote static site, use `docker-compose.bundled.yml` with `CAPUZ_SERVE_SITE=false`, `STORAGE_BACKEND=sftp`, and optional `docker-compose.bundled.sftp.yml` (not a Hetzner VPS deploy path).

---

## Architecture

```
Internet
   │
   ▼
edge-router (Caddy in Docker) :443 TLS + Let's Encrypt
   │  SITE_HOST / www  → nginx:80
   │  EDITOR_HOST      → openwebui:8080
   │  PREVIEW_HOST     → cms-api:3000
   ▼
docker compose (nginx + cms-api + openwebui + edge-router)
   └─ shared volume site-data  (published pages + .drafts + .open-webui)
   └─ caddy_data / caddy_config  (certificates — never down -v)
```

Local demo: `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d` (HTTP on `:8080`).

The live site volume starts **empty** (no demo HTML seeded); pages appear after `publish_page` from chat.

### Migrating an existing VPS (host Caddy → edge-router)

1. Deploy updated code with `ACME_EMAIL` set in `.env.production`.
2. Install script preflights compose + `Caddyfile.prod`, builds images, then `systemctl disable --now caddy`.
3. Starts all four services with `up -d --build --remove-orphans` (no `down -v`).
4. Expect one automatic ACME certificate issuance; later deploys reuse `caddy_data`.

---

## Manual checklist

| Step | Why manual |
|------|------------|
| Hetzner Cloud account + API token | Billing / `hcloud` |
| SSH access to VPS | Public IP or **Tailscale** (`root@your-host.tailnet`) |
| Production `.env` | Copy `env.production.example` → `.env.production`; secrets, hosts, **`ACME_EMAIL`** |
| DNS A records | `@`, `www`, `chat`, `preview` → VPS IPv4 |
| Keep mail DNS | Do **not** remove MX/SPF/SRV if you use Hetzner mail |

---

## Recommended server size

| Plan | RAM | Notes |
|------|-----|--------|
| **cpx12** / **cx22** | 2–4 GB | 2 GB works with 2 GB swap + lean Open WebUI env; tight |
| cx22+ | 4 GB | Comfortable for Open WebUI + cms-api + nginx |

`install-on-server.sh` creates **2 GB swap** if missing. Set lean Open WebUI flags in `.env.production` (see `env.production.example` — `RAG_EMBEDDING_ENGINE=openai`, disable Ollama, code exec, memories, etc.).

---

## Quick deploy

```bash
brew install hcloud
hcloud context create capuz-prod
hcloud ssh-key create --name laptop --public-key-from-file ~/.ssh/id_ed25519.pub
export HCLOUD_SSH_KEY=laptop

chmod +x deploy/hetzner/*.sh

# Optional: create VPS with Docker (cloud-init)
./deploy/hetzner/create-server.sh

cp deploy/hetzner/env.production.example deploy/hetzner/.env.production
# Edit: OPENROUTER_API_KEY, CMS_API_KEY, WEBUI_SECRET_KEY,
#       SITE_HOST, EDITOR_HOST, PREVIEW_HOST, WEBUI_URL, PREVIEW_BASE_URL, ACME_EMAIL

./deploy/hetzner/configure-dns.sh your.domain YOUR_VPS_IP

./deploy/hetzner/deploy-from-local.sh \
  root@YOUR_VPS_IP deploy/hetzner/.env.production
```

Use `root@your-host.tailnet` instead of the public IP if SSH is Tailscale-only.

---

## Verify

```bash
curl -sI https://your.domain/ | head -5          # 404 until first publish (expected)
curl -sI https://www.your.domain/ | head -5
curl -sI https://chat.your.domain/ | head -5       # Open WebUI
curl -sI https://preview.your.domain/health | head -5
systemctl is-active caddy                          # inactive (Docker edge-router handles TLS)
```

Smoke test: log into chat → MCP tools → write draft → preview → publish → page on apex.

---

## Redeploy / update

```bash
./deploy/hetzner/deploy-from-local.sh \
  root@YOUR_VPS_IP deploy/hetzner/.env.production
```

Never run `docker compose down -v` on production — that deletes `site-data` and Let's Encrypt certificates in `caddy_data`.

---

## Files (`deploy/hetzner/`)

| File | Purpose |
|------|---------|
| `docker-compose.reference.production.yml` | edge-router `:80`/`:443`, `CAPUZ_SEED`, production env, `caddy_data` |
| `../Caddyfile.prod` | In-compose TLS + hostname routing (repo root) |
| `create-server.sh` | Optional `hcloud server create` + cloud-init |
| `cloud-init.yaml` | Docker + UFW bootstrap (no secrets) |
| `deploy-from-local.sh` | SCP `.env` + rsync repo + remote `install-on-server.sh` |
| `install-on-server.sh` | Swap, Docker bootstrap, disables host Caddy, starts reference stack |
| `configure-dns.sh` | Optional `hcloud zone rrset` for web records |
| `env.production.example` | Production template incl. `ACME_EMAIL` and lean Open WebUI flags |

Root: **`seed-data.sh`** uses `CAPUZ_SEED` (`SKIP` | `SEED` | `FORCE_OVERWRITE`; production uses `SKIP`).

**Shared disk for `import_chat_file`:** Open WebUI mounts `site-data` at `/app/data` with `DATA_DIR=/app/data/.open-webui` so cms-api can read `webui.db` and chat uploads.

---

## Operations

```bash
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.reference.production.yml ps'
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.reference.production.yml logs -f openwebui'
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.reference.production.yml logs -f edge-router'
ssh root@YOUR_VPS 'docker stats --no-stream'
```

Firewall: **80**, **443** public. Only **edge-router** publishes those ports; nginx, cms-api, and openwebui stay on the Docker network.

---

## Migrating from Render

1. Deploy the reference stack on a Hetzner VPS (steps above).
2. Copy site data if needed (export disk / republish via API).
3. Update DNS from Render to the VPS IP.
4. Suspend Render when satisfied.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Apex 404 | Expected until first `publish_page`; `CAPUZ_SEED=SKIP` — no demo seed |
| Chat `/error` or 502 | Open WebUI not ready; check `PORT=8080` inside container (not `8081` from laptop `.env`); compose logs |
| Preview 502 | `docker compose … logs edge-router cms-api`; `PREVIEW_HOST` matches DNS |
| TLS / ACME fails | DNS A records; `ACME_EMAIL` set; ports 80/443 free (`systemctl is-active caddy` should be inactive); `logs edge-router` |
| Port 80/443 in use | Stop host Caddy: `systemctl disable --now caddy` |
| Chat slow on first visit | Open WebUI still starting |

---

## Security notes

- Set `ENABLE_SIGNUP=false` in production `.env`.
- Use strong `CMS_API_KEY` and `WEBUI_SECRET_KEY`.
- Only edge-router publishes 80/443; never `docker compose down -v` (wipes site + certs).
- Keep `/opt/capuz/.env` mode `600`.

See also [README.md](../README.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).
