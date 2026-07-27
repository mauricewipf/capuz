# Architecture Overview

## Multi-Service Design

This application uses a microservices architecture with separate Docker services (nginx, cms-api, openwebui, and a Caddy editor router).

### Services

#### 1. nginx (Static Web Server)
- **Image**: `nginx:alpine`
- **Port**: 8080 (maps to internal 80)
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
- **Port**: 3000
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

#### 3. editor-router (Caddy)
- **Image**: `caddy:2-alpine`
- **Port**: 8081
- **Purpose**: Routes by hostname on the editor port
- **Config**: `Caddyfile`

**Routing**:
- `preview.localhost:8081` → cms-api:3000 (preview vhost)
- `:8081` → openwebui:8080 (AI editor)

#### 4. openwebui (AI Editor)
- **Image**: `openwebui/open-webui`
- **Internal port**: 8080 (exposed via editor-router on 8081)
- **Purpose**: AI-powered content editor
- **Dockerfile**: `Dockerfile.openwebui`

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
User Browser → nginx:80 → /app/data/index.html → Response
```

### Editing Content via AI
```
User → openwebui → MCP → cms-api:3000 → /app/data/.drafts/page.html (draft)
User → preview.localhost:8081 → cms-api preview vhost → draft or published HTML
User publishes → cms-api → /app/data/page.html → nginx:80 serves live file
```

### Preview Browsing
```
User Browser → preview.localhost:8081 → Caddy → cms-api:3000 (PREVIEW_HOST)
  → read .drafts/page.html if present, else published page
  → assets from /app/data/assets/ (published)
```

### Direct API Access
```
curl → cms-api:3000/api/pages → /app/data → JSON Response
```

## Shared Storage

All three services mount the same Docker volume:
- **Volume Name**: `site-data`
- **Mount Point**: `/app/data`
- **Contents**:
  - HTML pages (root level and subdirectories)
  - `.drafts/` - unpublished page drafts (cms-api only; hidden from published listings)
  - `.components/` - reusable HTML component library (hidden from published listings; blocked by nginx)
  - CSS, JS, images under `assets/`, etc.
- **Seed source** (repo): `public/pages/` → `/app/data/`, `public/assets/` → `/app/data/assets/` via `seed-data.sh` on first nginx start

## Network Communication

Services communicate via Docker's internal bridge network:
- Service names resolve via Docker DNS
- `http://cms-api:3000` - API accessible from openwebui
- `http://nginx:80` - Web server accessible from other services
- `http://openwebui:8080` - Editor accessible from other services

External access:
- `localhost:8080` → nginx (public site)
- `localhost:8081` → editor-router → Open WebUI
- `preview.localhost:8081` → editor-router → cms-api preview
- `localhost:3000` → cms-api (optional, for direct API access)

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

### Editor stack (single container)
For a lightweight editor-only deploy, use `Dockerfile.stack` with `docker-compose.stack.yml`. One container runs Open WebUI, cms-api, and Caddy host routing for chat and draft preview. The public static site is **not** included — pair with remote nginx via `STORAGE_BACKEND=sftp` and `docker-compose.stack.sftp.yml` (Hetzner **minimal** mode in [docs/DEPLOY-HETZNER.md](docs/DEPLOY-HETZNER.md)), or use the reference or bundled VPS setups below.

### Reference stack on Hetzner VPS
Deploy the same multi-service layout as local `docker compose up` (`docker-compose.yml`) to a VPS with **host Caddy** for TLS. Production uses `deploy/hetzner/docker-compose.reference.production.yml`:

| Component | Role |
|-----------|------|
| Host Caddy | TLS on `:443`; routes `SITE_HOST` / `www` → nginx, `EDITOR_HOST` → openwebui, `PREVIEW_HOST` → cms-api |
| `nginx` | Live published pages (`127.0.0.1:8080`); **`CAPUZ_SKIP_SEED=1`** — no demo seed from `public/` |
| `cms-api` | API, MCP, preview vhost (`127.0.0.1:3000`) |
| `openwebui` | Chat UI (`127.0.0.1:8082` → container `:8080`) |

The in-compose **`editor-router`** (Caddy on `:8081`) runs locally only; on the VPS, host Caddy replaces it. Set `CAPUZ_STACK=reference` in production env. See [docs/DEPLOY-HETZNER.md](docs/DEPLOY-HETZNER.md).

### Bundled setup (Render or VPS)
For platforms like Render that prefer a single web service with live pages, use `Dockerfile.bundled` with `docker-compose.bundled.yml` / `render.bundled.yaml`. On a **Hetzner VPS**, use **minimal** (local stack + remote nginx), **reference** (`docker-compose.yml` + `docker-compose.reference.production.yml`), or **bundled** behind host Caddy (`deploy/hetzner/docker-compose.production.yml`) — see [docs/DEPLOY-HETZNER.md](docs/DEPLOY-HETZNER.md). Bundled one container runs:

| Host | Backend |
|------|---------|
| `SITE_HOST` (apex / default) | nginx — live published pages |
| `EDITOR_HOST` (`chat.*` locally, or your editor subdomain) | Open WebUI |
| `PREVIEW_HOST` (`preview.*`) | cms-api preview vhost (drafts) |

Caddy listens on `$PORT` and routes by `Host`. Shared disk at `/app/data` holds published pages, `.drafts/`, and Open WebUI data. Plugin-only deployment remains `Dockerfile.api` + `docker-compose.plugin.yml`.

## Development vs Production

### Local Development
```bash
docker compose up --build
```

### Production Considerations
1. **Add a reverse proxy** (Traefik, Caddy) for SSL/TLS
2. **Separate the data volume** backup strategy
3. **Environment-specific configs** using docker-compose.override.yml
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
