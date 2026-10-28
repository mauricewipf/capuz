# Deploy Capuz on Hetzner Cloud

Production on Hetzner uses the **multi-service stack**: `docker-compose.yml` plus `deploy/hetzner/docker-compose.production.yml`. Six containers (`nginx`, `cms-api`, `cms-console`, `openwebui`, `oauth2-proxy`, `edge-router`) share a `site-data` volume. In-compose Caddy (`edge-router`) terminates TLS on `:80`/`:443` with Let's Encrypt (`ACME_EMAIL`, `Caddyfile.prod`).

Compared to Render, you control TLS and DNS yourself — no custom-domain slot limits.

For a laptop editor with a remote static site, use `docker-compose.bundled.yml` with `CAPUZ_SERVE_SITE=false`, `STORAGE_BACKEND=sftp`, and optional `docker-compose.bundled.sftp.yml` (not a Hetzner VPS deploy path).

---

## Architecture

```
Internet
   │
   ▼
edge-router (Caddy in Docker) :443 TLS + Let's Encrypt
   │  SITE_HOST / www     → nginx:80 (public; cookies stripped)
   │  EDITOR_HOST         → forward_auth → openwebui:8080
   │  CONSOLE_HOST        → forward_auth → cms-console:3000
   │  PREVIEW_HOST        → cms-api:3000 (API/MCP blocked at edge)
   │  AUTH_HOST           → oauth2-proxy:4180 (GitHub OAuth callback)
   ▼
docker compose (nginx + cms-api + cms-console + openwebui + oauth2-proxy + edge-router)
   └─ shared volume site-data  (published pages + .drafts + .open-webui)
   └─ caddy_data / caddy_config  (certificates — never down -v)
```

Local demo: `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d` (HTTP on `127.0.0.1:8080`).

The live site volume starts **empty** (no demo HTML seeded); pages appear after `publish_page` from chat or the CMS Console.

---

## Rollout sequence (two increments)

Ship in two steps so SSO risk is isolated from the new console.

| Increment | What ships | Auth impact |
|-----------|------------|---------------|
| **1 — Console + preview hardening** | `cms-console`, preview `/api`/`/mcp` blocks, cookie stripping on site/preview | **Local only** — `console.localhost:8080` with dev identity headers; no oauth2-proxy; chat stays on local signup |
| **2 — GitHub SSO cutover** | `oauth2-proxy`, `forward_auth` on chat + console, trusted-header Open WebUI | **Production** — local login disabled; shared OAuth session for chat and console |

### Increment 1 (local)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
open http://console.localhost:8080/pages
curl -sI http://preview.localhost:8080/api/pages   # expect 403
```

### Increment 2 (production)

1. Create DNS A records for `console` and `auth` (`configure-dns.sh`).
2. Register GitHub OAuth App — callback `https://AUTH_HOST/oauth2/callback`, scopes `user:email`, `read:org`.
3. Fill all auth variables in `.env.production` (see `env.production.example`).
4. Run `deploy-from-local.sh` — **preflight validates compose + Caddy before replacing containers**.
5. GitHub login on chat; send a chat message to confirm streaming.
6. Open console on same browser session — should not prompt again.
7. Sign out from Open WebUI — should clear oauth2-proxy cookie (`WEBUI_AUTH_SIGNOUT_REDIRECT_URL`).

If SSO misconfiguration locks you out of chat, see [Break-glass recovery](#break-glass-recovery-locked-out-of-chat) below.

### Migrating an existing VPS (host Caddy → edge-router)

1. Deploy updated code with `ACME_EMAIL` set in `.env.production`.
2. Install script preflights compose + `Caddyfile.prod`, pulls published images (`openwebui`, `edge-router`, `oauth2-proxy`), builds local images, then `systemctl disable --now caddy`.
3. Starts all services with `up -d --build --pull always --remove-orphans` (no `down -v`).
4. Expect one automatic ACME certificate issuance; later deploys reuse `caddy_data`.

---

## Manual checklist

| Step | Why manual |
|------|------------|
| Hetzner Cloud account + API token | Billing / `hcloud` |
| SSH access to VPS | Public IP or **Tailscale** (`root@your-host.tailnet`) |
| Production `.env` | Copy `env.production.example` → `.env.production`; secrets, hosts, **`ACME_EMAIL`**, GitHub OAuth |
| GitHub OAuth App | Callback `https://AUTH_HOST/oauth2/callback`; scopes `user:email`, `read:org` |
| DNS A records | `@`, `www`, `chat`, `preview`, `console`, `auth` → VPS IPv4 |
| Keep mail DNS | Do **not** remove MX/SPF/SRV if you use Hetzner mail |

---

## Recommended server size

| Plan | RAM | Notes |
|------|-----|--------|
| **cpx12** / **cx22** | 2–4 GB | Tight with console + oauth2-proxy; use 2 GB swap + lean Open WebUI env |
| cx22+ | 4 GB | Comfortable for Open WebUI + cms-api + cms-console + nginx |

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
#       SITE_HOST, EDITOR_HOST, PREVIEW_HOST, CONSOLE_HOST, AUTH_HOST,
#       WEBUI_URL, PREVIEW_BASE_URL, ACME_EMAIL,
#       GITHUB_OAUTH_*, GITHUB_ALLOWED_USERS, OAUTH2_PROXY_*,
#       CONSOLE_CSRF_SECRET

./deploy/hetzner/configure-dns.sh your.domain YOUR_VPS_IP

./deploy/hetzner/deploy-from-local.sh \
  root@YOUR_VPS_IP deploy/hetzner/.env.production
```

Use `root@your-host.tailnet` instead of the public IP if SSH is Tailscale-only.

### Open WebUI SSO cutover (increment 2)

Production compose enables GitHub OAuth for chat and console. Before disabling local login:

1. Register the GitHub OAuth App with callback `https://AUTH_HOST/oauth2/callback`.
2. Ensure the GitHub account's **verified primary email** matches the existing Open WebUI admin email (trusted-header auth resolves users by email).
3. Set `GITHUB_ALLOWED_USERS` to that GitHub login.
4. Deploy with full auth env vars — preflight fails before touching running containers if any are missing.
5. After deploy, sign in via GitHub, send a **chat message** to confirm token streaming (page load `200` is not enough).
6. Sign out from Open WebUI should redirect through oauth2-proxy (`WEBUI_AUTH_SIGNOUT_REDIRECT_URL`).

Optional: set `CONSOLE_ALLOWED_GROUPS` to restrict console routes to GitHub org/team memberships (`read:org` scope).

---

## Verify

```bash
curl -sI https://your.domain/ | head -5          # 404 until first publish (expected)
curl -sI https://www.your.domain/ | head -5
curl -sI https://chat.your.domain/ | head -5       # redirects to GitHub OAuth when unauthenticated
curl -sI https://console.your.domain/ | head -5
curl -sI https://preview.your.domain/health | head -5
curl -sI https://preview.your.domain/api/pages | head -5   # 403 (edge block)
systemctl is-active caddy                          # inactive (Docker edge-router handles TLS)
```

Smoke test: GitHub login → chat MCP tools → write draft → preview → publish (chat or console) → page on apex.

---

## Break-glass recovery (locked out of chat)

If `forward_auth` or GitHub OAuth misconfiguration locks you out of `EDITOR_HOST`:

1. SSH to the VPS.
2. Edit `/opt/capuz/app/Caddyfile.prod` — temporarily replace the `{$EDITOR_HOST}` block with a direct `reverse_proxy openwebui:8080` (no `forward_auth`).
3. Restart only edge-router:
   ```bash
   cd /opt/capuz/app
   docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml restart edge-router
   ```
4. Fix GitHub OAuth / oauth2-proxy config, redeploy, restore the auth block.

Site and preview hosts remain available while chat/console auth is broken.

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
| `docker-compose.production.yml` | edge-router `:80`/`:443`, oauth2-proxy, console, production env, `caddy_data` |
| `../Caddyfile.prod` | In-compose TLS + hostname routing + forward_auth (repo root) |
| `create-server.sh` | Optional `hcloud server create` + cloud-init |
| `cloud-init.yaml` | Docker + UFW bootstrap (no secrets) |
| `deploy-from-local.sh` | SCP `.env` + rsync repo + remote `install-on-server.sh` |
| `install-on-server.sh` | Swap, Docker bootstrap, disables host Caddy, preflight auth vars, starts stack |
| `configure-dns.sh` | Optional `hcloud zone rrset` for web records |
| `env.production.example` | Production template incl. OAuth, console, `ACME_EMAIL`, lean Open WebUI flags |

Root: **`seed-data.sh`** uses `CAPUZ_SEED` (`SKIP` | `SEED` | `FORCE_OVERWRITE`; default `SKIP` in `docker-compose.yml`).

**Shared disk for `import_chat_file`:** Open WebUI mounts `site-data` at `/app/data` with `DATA_DIR=/app/data/.open-webui` so cms-api can read `webui.db` and chat uploads.

---

## Operations

```bash
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml ps'
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml logs -f openwebui'
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml logs -f edge-router'
ssh root@YOUR_VPS 'cd /opt/capuz/app && docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.production.yml logs -f oauth2-proxy'
ssh root@YOUR_VPS 'docker stats --no-stream'
```

Firewall: **80**, **443** public. Only **edge-router** publishes those ports; other services stay on the Docker network.

---

## Migrating from Render

1. Deploy the multi-service stack on a Hetzner VPS (steps above).
2. Copy site data if needed (export disk / republish via API).
3. Update DNS from Render to the VPS IP.
4. Suspend Render when satisfied.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Apex 404 | Expected until first `publish_page`; `CAPUZ_SEED=SKIP` — no demo seed |
| Chat `/error` or 502 | Open WebUI not ready; check `PORT=8080` inside container (not `8081` from laptop `.env`); compose logs |
| Chat loads but no streaming | `forward_auth` + buffering; send a message after SSO; check `logs edge-router oauth2-proxy` |
| Preview 502 | `docker compose … logs edge-router cms-api`; `PREVIEW_HOST` matches DNS |
| Preview `/api/pages` public | Should be **403** at edge; if not, check `Caddyfile.prod` preview block |
| TLS / ACME fails | DNS A records; `ACME_EMAIL` set; ports 80/443 free (`systemctl is-active caddy` should be inactive); `logs edge-router` |
| Port 80/443 in use | Stop host Caddy: `systemctl disable --now caddy` |
| Chat slow on first visit | Open WebUI still starting |
| oauth2-proxy won't start | Cookie secret must be 16, 24, or 32 bytes; check `logs oauth2-proxy` |
| Locked out of chat | Break-glass: disable `forward_auth` on `EDITOR_HOST` in `Caddyfile.prod`, restart `edge-router` |

---

## Security notes

- `ENABLE_SIGNUP=false` and `ENABLE_LOGIN_FORM=false` in production compose (GitHub OAuth only).
- Use strong `CMS_API_KEY`, `WEBUI_SECRET_KEY`, `CONSOLE_CSRF_SECRET`, and `OAUTH2_PROXY_COOKIE_SECRET`.
- Only edge-router publishes 80/443; never `docker compose down -v` (wipes site + certs).
- Preview host blocks `/api*`, `/mcp*`, `/openapi.json` at the edge; site/preview strip oauth cookies.
- Keep `/opt/capuz/.env` mode `600`.

See also [README.md](../README.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).
