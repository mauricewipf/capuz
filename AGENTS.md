# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project overview

Capuz CMS API is an **Open WebUI plugin** — a publishable MCP / OpenAPI tool server that lets LLMs read, write, and delete `.html` and `.xml` pages on a static site. A Bun/Hono API exposes REST and MCP endpoints; Open WebUI (or any MCP client) connects to it with bearer auth.

This repo contains two things:

1. **The plugin** — `cms-api` (`api/`), distributable as the Docker image `ghcr.io/mauricewipf/capuz-cms-api`. Users run it standalone and connect their own Open WebUI instance.
2. **A reference demo stack** — nginx + cms-api + openwebui via `docker-compose.yml`, showing local AI editing with the default `fs` backend.

The site content lives in `pages/` (seed data) and is copied into a shared Docker volume at runtime. The API only manages HTML/XML; nginx serves everything else (CSS, JS, images).

Read `README.md` for plugin install, storage backends, and Open WebUI configuration. Read `ARCHITECTURE.md` for service topology and data flow.

## Open WebUI plugin

`cms-api` is the plugin artifact. It is **not** tied to the demo stack — users can deploy it anywhere and point Open WebUI at it.

| Integration | Endpoint | Auth |
|-------------|----------|------|
| MCP tool server | `POST /mcp` | `Authorization: Bearer <CMS_API_KEY>` |
| OpenAPI tool server | `GET /openapi.json` | Bearer on write/delete |
| REST API | `/api/pages/*` | Bearer on PUT/DELETE |

**MCP tools:** `list_pages`, `read_page`, `write_page`, `delete_page`

**Storage backends** (selected via `STORAGE_BACKEND` env var):

| Backend | Use case |
|---------|----------|
| `fs` (default) | cms-api colocated with nginx via shared volume — local demo and VPS setups |
| `sftp` | Remote nginx host over SSH |
| `git` | Commit/push to a repo connected to Pages, Netlify, Vercel, GitHub Pages |
| `s3` | Direct writes to Cloudflare R2, AWS S3, or any S3-compatible bucket |

Plugin-only deployment: `docker-compose.plugin.yml` (cms-api service only, no nginx/openwebui).

Publishing: tag `v*.*.*` triggers `.github/workflows/publish.yml` → GHCR `ghcr.io/mauricewipf/capuz-cms-api`. Listing notes in `docs/openwebui-listing.md`.

When changing plugin behavior, keep MCP tools, REST routes, and OpenAPI spec in sync.

## Tech stack

| Area | Stack |
|------|-------|
| API runtime | Bun 1.x |
| API framework | Hono |
| MCP | `@modelcontextprotocol/sdk` |
| Validation | Zod |
| Storage | fs, sftp, git, or s3 (env-driven) |
| Static site | Hand-written HTML + Bootstrap 5 |
| Orchestration | Docker Compose |

There is no frontend build step, no TypeScript, and no test runner configured.

## Repository layout

```
api/src/
  server.js       # Hono routes
  mcp.js          # MCP tool definitions
  pages.js        # Shared path error handling
  paths.js        # Path normalization and traversal guards
  auth.js         # Bearer token middleware
  openapi.js      # OpenAPI spec
  storage/        # Backend implementations (fs, sftp, git, s3)
pages/            # Seed HTML/XML for the demo site
nginx.conf        # Static server config (extensionless URLs)
docker-compose.yml          # Reference demo stack (nginx + cms-api + openwebui)
docker-compose.plugin.yml   # Plugin-only (cms-api standalone)
Dockerfile.api | Dockerfile.nginx | Dockerfile.openwebui
```

## Commands

### Local demo stack (reference — uses `fs` backend, no extra config)

```bash
cp .env.example .env   # set OPENROUTER_API_KEY
docker compose up --build -d
```

The demo uses `STORAGE_BACKEND=fs`, shared volume `site-data`, and `CMS_API_KEY=dev-local-key`. No sftp/git/s3 setup needed.

| Service | URL |
|---------|-----|
| Public site | http://localhost:8080 |
| Open WebUI | http://localhost:8081 |
| CMS API | http://localhost:3000 |

```bash
docker compose logs -f cms-api     # API logs
docker compose build cms-api       # Rebuild after api/ changes
docker compose exec cms-api sh     # Shell in API container
curl http://localhost:3000/health  # Health check
curl http://localhost:3000/api/pages
```

### API (inside container or with Bun locally)

```bash
cd api && bun install && bun run start
```

Dev API key default: `dev-local-key` (from `docker-compose.yml` / `.env.example`).

### Publish cms-api plugin image

Tag push triggers `.github/workflows/publish.yml` → GHCR `ghcr.io/mauricewipf/capuz-cms-api` (multi-arch `linux/amd64`, `linux/arm64`).

## Coding conventions

### API (`api/src/`)

- ESM only (`import`/`export`, `"type": "module"`).
- Plain JavaScript — do not introduce TypeScript unless explicitly requested.
- New storage backends: implement the same interface as `storage/fs.js`, register in `storage/index.js`.
- Path handling must go through `paths.js` — never resolve user paths outside `DATA_ROOT`.
- Only `.html` and `.xml` extensions are allowed for page operations.
- MCP tools mirror REST: `list_pages`, `read_page`, `write_page`, `delete_page`.
- Keep dependencies minimal; prefer Bun-compatible packages.

### Site pages (`pages/`)

- Static HTML files — what you write is what nginx serves.
- Match existing patterns: Bootstrap 5, `/assets/css/theme.css`, semantic sections, mobile-friendly layout.
- Use relative or root-absolute asset paths consistent with neighboring pages.
- Extensionless URLs work via nginx rewrite (`/about` → `/about.html`); prefer `.html` in API/MCP paths.

### Docker / config

- API image builds from `Dockerfile.api` (context: repo root, copies `api/`).
- nginx image seeds `pages/` into the volume on first run (`seed-data.sh`).
- Environment variables are documented in `.env.example` and `README.md`.

## Guardrails

**Do not:**

- Add Next.js, Astro, Hugo, or any build-step framework — this project targets raw HTML/XML.
- Commit secrets (`.env`, API keys, deploy keys).
- Bypass path validation or allow extensions other than `.html`/`.xml`.
- Proxy API traffic through nginx — services stay separate.
- Expand scope beyond the requested change; no drive-by refactors.
- Add markdown docs the user did not ask for.
- Create git commits or push unless explicitly requested.

**Do:**

- Keep changes small and match surrounding style.
- Fix root causes, not symptoms.
- Update `README.md` or `ARCHITECTURE.md` when behavior or env vars change.
- Preserve backward compatibility for MCP tools and REST endpoints.

## Verification

There are no automated tests. After API changes:

1. Rebuild: `docker compose build cms-api && docker compose up -d cms-api`
2. `curl http://localhost:3000/health` → `{"ok":true}`
3. `curl http://localhost:3000/api/pages` → lists pages
4. Write test: `curl -H "Authorization: Bearer dev-local-key" -X PUT -H "Content-Type: text/html" -d '<!DOCTYPE html><html><body>ok</body></html>' http://localhost:3000/api/pages/agent-test.html`
5. Confirm at http://localhost:8080/agent-test.html, then delete the test page.

After HTML changes in `pages/`, rebuild nginx or restart compose so seed/volume reflects updates.

## MCP / integration context

Open WebUI connects to `http://cms-api:3000/mcp` with bearer auth (`CMS_API_KEY`). Tool server config is in `docker-compose.yml` (`TOOL_SERVER_CONNECTIONS`). External users configure the same JSON in their own Open WebUI instance, pointing at wherever they host cms-api.

The API is also consumable as an OpenAPI tool server at `/openapi.json`.

When editing MCP or OpenAPI surfaces, keep tool names, parameters, and REST routes in sync.

## Further reading

- `QUICKSTART.md` — first-run and troubleshooting
- `ARCHITECTURE.md` — multi-service design
- `CHANGELOG.md` — release history
- `docs/openwebui-listing.md` — community listing notes
