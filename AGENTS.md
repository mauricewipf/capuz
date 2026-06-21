# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project overview

Capuzzella CMS API is an AI-editable static site stack. A Bun/Hono API exposes REST and MCP endpoints so LLM tools can read, write, and delete `.html` and `.xml` pages. This repo ships:

- **cms-api** — file-management API + MCP server (`api/`)
- **nginx** — static file server for the public site
- **openwebui** — reference AI editor (demo stack only)

The site content lives in `pages/` (seed data) and is copied into a shared Docker volume at runtime. The API only manages HTML/XML; nginx serves everything else (CSS, JS, images).

Read `README.md` for deployment and storage backends. Read `ARCHITECTURE.md` for service topology and data flow.

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
docker-compose.yml
Dockerfile.api | Dockerfile.nginx | Dockerfile.openwebui
```

## Commands

### Local demo stack

```bash
cp .env.example .env   # set OPENROUTER_API_KEY
docker compose up --build -d
```

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

### Publish cms-api image

Tag push triggers `.github/workflows/publish.yml` → Docker Hub `capuzzella/cms-api`.

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

Open WebUI connects to `http://cms-api:3000/mcp` with bearer auth. Tool server config lives in `docker-compose.yml` (`TOOL_SERVER_CONNECTIONS`). The API is also consumable via OpenAPI at `/openapi.json`.

When editing MCP or OpenAPI surfaces, keep tool names, parameters, and REST routes in sync.

## Further reading

- `QUICKSTART.md` — first-run and troubleshooting
- `ARCHITECTURE.md` — multi-service design
- `CHANGELOG.md` — release history
- `docs/openwebui-listing.md` — community listing notes
