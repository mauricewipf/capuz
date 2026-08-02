# Architecture Overview

## Multi-Service Design

This application uses a microservices architecture with separate Docker services (nginx, cms-api, openwebui, and an in-compose Caddy **edge-router**).

### Services

#### 1. nginx (Static Web Server)
- **Image**: `nginx:alpine`
- **Internal port**: 80 (published only via edge-router)
- **Purpose**: Serves static HTML files only
- **Volume**: Reads from shared `site-data:/app/data`
- **Dockerfile**: `Dockerfile.nginx`

**Responsibilities**:
- Serve static HTML, CSS, JS, and assets
- Handle extensionless URLs (e.g., `/about` → `/about.html`)
- Gzip compression
- No proxying to other services

#### 2. cms-api (Backend API)
- **Image**: `oven/bun:1-alpine`
- **Internal port**: 3000 (not published to the host by default)
- **Purpose**: File management API and MCP server
- **Volume**: Reads/writes shared `site-data:/app/data`
- **Dockerfile**: `Dockerfile.api`

**Responsibilities**:
- REST API for draft and publish operations (`/api/pages`, `/api/drafts`)
- Extended REST/MCP tools: surgical edits, search/diff, assets, components, SEO, link checks, preview screenshots
- MCP server for Open WebUI integration (`/mcp`)
- Preview vhost when `Host` matches `PREVIEW_HOST` (draft-or-fallback HTML + published assets)
- Health check endpoint (`/health`)
- File system operations on HTML/XML files; drafts under `.drafts/`; components under `.components/`

**Key Endpoints**:
- `GET /api/pages` - List published pages (`?detail=status` for draft state)
- `GET /api/drafts` - List draft paths
- `PUT /api/pages/{path}` - Save draft
- `POST /api/pages/{path}/publish` - Publish draft
- `POST /api/pages/{path}/edit` - Find/replace patch on draft
- `GET /api/pages/{path}/diff` - Diff draft vs published
- `GET /api/search` - Search page HTML
- `GET /api/assets`, `PUT /api/assets/{path}` - Asset management
- `GET /api/components`, `GET /api/components/suggest` - Component library and reverse-engineering
- `GET /api/links/check` - Broken link scan
- `GET /api/pages/{path}` - Read published page
- `DELETE /api/pages/{path}` - Delete published page
- `POST /mcp` - MCP protocol handler

#### 3. edge-router (Caddy)
- **Image**: `caddy:2-alpine`
- **Local port**: 8080 (HTTP); **prod ports**: 80 + 443 (HTTPS + Let's Encrypt)
- **Purpose**: Single edge — hostname routing to nginx / openwebui / cms-api
- **Config**: `Caddyfile.dev` (local) or `Caddyfile.prod` (production)

**Routing**:
- `SITE_HOST` / `www` → nginx:80
- `EDITOR_HOST` → openwebui:8080
- `PREVIEW_HOST` → cms-api:3000 (preview vhost)

#### 4. openwebui (AI Editor)
- **Image**: `openwebui/open-webui`
- **Internal port**: 8080 (exposed via edge-router)
- **Purpose**: AI-powered content editor
- **Dockerfile**: `Dockerfile.openwebui`
- **Volume**: shared `site-data:/app/data` with `DATA_DIR=/app/data/.open-webui`

**Responsibilities**:
- Provide web-based AI chat interface
- Connect to OpenRouter for LLM capabilities
- Use MCP to interact with cms-api
- Store user accounts and chat history in `.open-webui/` directory

**MCP Integration**:
Open WebUI connects to cms-api at `http://cms-api:3000/mcp` using Docker's internal network.

## Data Flow

### Reading Content
```
User Browser → edge-router → nginx:80 → /app/data/index.html → Response
```

### Editing Content via AI
```
User → edge-router → openwebui → MCP → cms-api:3000 → /app/data/.drafts/page.html (draft)
User → preview.localhost:8080 → edge-router → cms-api preview vhost → draft or published HTML
User publishes → cms-api → /app/data/page.html → nginx serves live file
```

### Preview Browsing
```
User Browser → PREVIEW_HOST → edge-router → cms-api:3000 (PREVIEW_HOST)
  → read .drafts/page.html if present, else published page
  → assets from /app/data/assets/ (published)
```

### Direct API Access
```
# Optional local debug override publishes 127.0.0.1:3000
curl → cms-api:3000/api/pages → /app/data → JSON Response
```

## Shared Storage

All multi-service stack app services mount the same Docker volume:
- **Volume Name**: `site-data`
- **Mount Point**: `/app/data`
- **Contents**:
  - HTML pages (root level and subdirectories)
  - `.drafts/` - unpublished page drafts (cms-api only; hidden from published listings)
  - `.components/` - reusable HTML component library (hidden from published listings; blocked by nginx)
  - `.open-webui/` - Open WebUI data (chat DB, uploads)
  - CSS, JS, images under `assets/`, etc.
- **Seed source** (repo): `public/` → `/app/data/` via `seed-data.sh` on nginx start (`.open-webui/` on the volume is never touched)

## Network Communication

Services communicate via Docker's internal bridge network:
- Service names resolve via Docker DNS
- `http://cms-api:3000` - API accessible from openwebui
- `http://nginx:80` - Web server accessible from other services
- `http://openwebui:8080` - Editor accessible from other services

External access (local):
- `localhost:8080` → edge-router → nginx (public site)
- `chat.localhost:8080` → edge-router → Open WebUI
- `preview.localhost:8080` → edge-router → cms-api preview
- cms-api is **not** published on the host unless `docker-compose.local-debug.yml` is used

## Advantages of This Architecture

### 1. **Separation of Concerns**
- nginx only serves files (what it does best)
- Bun handles API logic
- Open WebUI is isolated in its own container

### 2. **Independent Scaling**
Each service can be scaled independently:
```yaml
docker compose up --scale cms-api=3
```

### 3. **Easier Development**
- Update one service without rebuilding others
- Faster build times (only rebuild changed service)
- Can replace components easily (e.g., swap nginx for Caddy)

### 4. **Better Resource Management**
- Each service has its own resource limits
- Can monitor CPU/memory per service
- Easier to identify bottlenecks

### 5. **Simplified nginx Configuration**
- No complex proxy rules
- Pure static file serving
- Easier to debug and maintain

## Deployment Considerations

### Docker Compose Platforms
- AWS ECS with Docker Compose support
- DigitalOcean App Platform
- Railway
- Any VPS with Docker Compose

### Alternative: Kubernetes
Each service can be deployed as a separate pod with:
- nginx Deployment + Service
- cms-api Deployment + Service
- openwebui Deployment + Service
- Persistent Volume Claim for shared storage

### Bundled monolith (single container)
One image (`Dockerfile.bundled`, `start-bundled.sh`) runs Open WebUI, cms-api, and Caddy. Mode is set with `CAPUZ_SERVE_SITE`:

| `CAPUZ_SERVE_SITE` | nginx | `STORAGE_BACKEND` | Use case |
|--------------------|-------|-------------------|----------|
| `true` (default) | yes | `fs` only | Local or Render: live site + chat + preview on one port |
| `false` | no | `sftp`, `git`, or `s3` | Laptop editor; live site on remote host |

Caddy config is generated at startup (`prepare_caddy_config` in `start-bundled.sh`). When `CAPUZ_SERVE_SITE=true`, routes `SITE_HOST` → nginx, `EDITOR_HOST` → Open WebUI, `PREVIEW_HOST` → cms-api. When `false`, only editor/preview hosts plus a catch-all to Open WebUI.

Remote-site mode: `docker-compose.bundled.yml` + `docker-compose.bundled.sftp.yml` (for SFTP). For a full VPS deploy, use the multi-service stack below.

**Render:** deploy via `render.bundled.yaml`. Custom domains are required for `SITE_HOST`, `EDITOR_HOST`, and `PREVIEW_HOST` (nested `*.onrender.com` subdomains do not resolve).

### Multi-service stack on Hetzner VPS
Deploy the same four-service layout as local (`docker-compose.yml` + override). Local and prod both use in-compose **edge-router** (Caddy). Production publishes `:80`/`:443` with auto-HTTPS via `Caddyfile.prod` and `ACME_EMAIL`; local publishes `:8080` with `Caddyfile.dev`.

| Component | Role |
|-----------|------|
| `edge-router` | TLS (prod) / HTTP (local); routes by `SITE_HOST` / `EDITOR_HOST` / `PREVIEW_HOST` |
| `nginx` | Live published pages; **`CAPUZ_SEED=SKIP`** in prod — no demo seed from `public/` |
| `cms-api` | API, MCP, preview vhost (Docker network only) |
| `openwebui` | Chat UI on shared `site-data` |

No host systemd Caddy for the multi-service stack. See [docs/DEPLOY-HETZNER.md](docs/DEPLOY-HETZNER.md).

Plugin-only deployment remains `Dockerfile.api` + `docker-compose.plugin.yml`.

## Development vs Production

### Local Development
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

### Production Considerations
1. **Multi-service stack**: in-compose edge-router handles Let's Encrypt (`ACME_EMAIL`, `caddy_data` volume)
2. **Separate the data volume** backup strategy — never `docker compose down -v` in prod
3. **Environment-specific configs** using compose overrides
4. **Health checks** are already configured
5. **Logging**: Use Docker logging drivers or ship to external service

## Troubleshooting

### Check Service Health
```bash
docker compose ps
```

### View Service Logs
```bash
docker compose logs nginx
docker compose logs cms-api
docker compose logs openwebui
```

### Verify Volume Contents
```bash
docker compose exec nginx ls -la /app/data
docker compose exec cms-api ls -la /app/data
```

### Test API Connectivity
```bash
# From host
curl http://localhost:3000/health

# From openwebui container
docker compose exec openwebui wget -O- http://cms-api:3000/health
```

### Rebuild Single Service
```bash
docker compose build nginx
docker compose up -d nginx
```
