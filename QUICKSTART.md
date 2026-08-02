# Quick Start Guide

## Setup (First Time)

```bash
# 1. Clone and enter directory
cd capuz

# 2. Configure environment
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY

# 3. Start services (base compose + local override — required)
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d

# 4. Open in browser
open http://localhost:8080          # Public site
open http://chat.localhost:8080     # AI Editor
open http://preview.localhost:8080  # Draft preview
```

On Linux, ensure `chat.localhost` and `preview.localhost` resolve (macOS usually does via `*.localhost`).

## URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **edge-router** | http://localhost:8080 | In-compose Caddy — only published port |
| **nginx** (via edge) | http://localhost:8080 | Public website |
| **openwebui** (via edge) | http://chat.localhost:8080 | AI editor |
| **preview** (via edge) | http://preview.localhost:8080 | Draft page preview |
| **cms-api** | (not published) | Internal only; optional debug override below |

Optional API on localhost:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.local-debug.yml up -d
curl http://127.0.0.1:3000/health
```

## Common Commands

```bash
# Start everything
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d

# View logs
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f nginx
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f cms-api
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f edge-router

# Check status / merged config
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
docker compose -f docker-compose.yml -f docker-compose.local.yml config

# Stop everything
docker compose -f docker-compose.yml -f docker-compose.local.yml down

# Restart services
docker compose -f docker-compose.yml -f docker-compose.local.yml restart

# Open shell in a service
docker compose -f docker-compose.yml -f docker-compose.local.yml exec nginx sh
docker compose -f docker-compose.yml -f docker-compose.local.yml exec cms-api sh
docker compose -f docker-compose.yml -f docker-compose.local.yml exec openwebui sh

# Rebuild after code changes
docker compose -f docker-compose.yml -f docker-compose.local.yml build
docker compose -f docker-compose.yml -f docker-compose.local.yml build cms-api

# Clean up (removes data volumes!)
docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
```

## Editor Setup (First Use)

1. Open http://chat.localhost:8080
2. Click "Sign Up" and create an admin account
3. Go to **Settings** → **Integrations**
4. Verify **CMS Pages** MCP server is connected
5. Select a model (e.g., `minimax/minimax-m3`)
6. Try a prompt:
   ```
   Read index.html, change the hero heading, and save it.
   ```

## API Usage (Optional)

With the debug override (or from inside the cms-api container):

```bash
# List all pages
curl http://127.0.0.1:3000/api/pages

# Health check
curl http://127.0.0.1:3000/health

# Save a draft (requires auth)
curl -H "Authorization: Bearer dev-local-key" \
  -X PUT -H "Content-Type: text/html" \
  -d '<!DOCTYPE html><html><body>ok</body></html>' \
  http://127.0.0.1:3000/api/pages/agent-test.html
```

Without the debug override, use:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec cms-api \
  wget -qO- http://127.0.0.1:3000/health
```

## Architecture Overview

```
Browser
   │
   ▼
edge-router (Caddy) :8080
   ├── localhost / www.localhost → nginx:80
   ├── chat.localhost            → openwebui:8080
   └── preview.localhost         → cms-api:3000
```

Shared volume `site-data` holds published pages, drafts, assets, and Open WebUI data (`.open-webui/`).

## Troubleshooting

### Port already in use

```bash
lsof -i :8080
```

### Services not starting

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml logs
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
```

### Open WebUI not connecting to MCP

Check `CMS_API_KEY` matches in `.env` and that cms-api is healthy:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml logs cms-api
docker compose -f docker-compose.yml -f docker-compose.local.yml exec cms-api wget -qO- http://127.0.0.1:3000/health
```

### chat.localhost / preview.localhost does not resolve

Add to `/etc/hosts` if needed:

```
127.0.0.1 chat.localhost preview.localhost www.localhost
```

### preview.localhost opens Tailscale login / 502 Bad Gateway

**Cause:** With `STORAGE_BACKEND=sftp`, preview reads pages over SSH from your VPS. If the VPS was set up with `tailscale up --ssh`, **Tailscale SSH** intercepts port 22 and requires a browser login at `login.tailscale.com` — cms-api cannot complete that, times out (~10s), and edge-router returns 502.

**Fix (VPS — keep SFTP backend):** On the Hetzner machine, disable Tailscale SSH so regular sshd + your SFTP key in `authorized_keys` handles connections:

```bash
tailscale set --ssh=false
```

Verify from your laptop (should print `ok`, not a Tailscale login URL):

```bash
ssh -i ~/.ssh/capuz_hetzner_sftp root@YOUR_MACHINE.tailXXXX.ts.net echo ok
```

**Alternative (local multi-service stack only):** Use the default local volume instead of remote SFTP — in `.env` set `STORAGE_BACKEND=fs` and start without `docker-compose.local.sftp.yml`. SFTP + remote publish uses `docker-compose.bundled.yml` with `CAPUZ_SERVE_SITE=false` and `docker-compose.bundled.sftp.yml`.

## Next Steps

- Edit pages via Open WebUI at http://chat.localhost:8080
- Preview drafts at http://preview.localhost:8080
- Publish to make pages live at http://localhost:8080
- See [docs/DEPLOY-HETZNER.md](docs/DEPLOY-HETZNER.md) for production deploy
