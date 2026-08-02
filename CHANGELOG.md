# Changelog

All notable changes to the Capuz CMS API plugin are documented here.

## Unreleased

### Removed
- Removed Hetzner bundled and minimal deploy modes; Hetzner VPS uses multi-service stack only.
- Removed separate editor deploy (`Dockerfile.editor`, `docker-compose.editor.yml`, `render.yaml`); merged into bundled monolith via `CAPUZ_SERVE_SITE`.

### Changed

- **Bundled monolith:** single `Dockerfile.bundled` + `start-bundled.sh` for both local site mode (`CAPUZ_SERVE_SITE=true`, `STORAGE_BACKEND=fs`) and remote-site mode (`CAPUZ_SERVE_SITE=false`, `sftp`/`git`/`s3`). Caddy config generated at runtime.
- **Render:** one blueprint (`render.bundled.yaml`); custom domains required for `SITE_HOST`, `EDITOR_HOST`, `PREVIEW_HOST` (nested `*.onrender.com` subdomains do not resolve).
- Renamed editor deploy files: `docker-compose.editor.yml`, `docker-compose.editor.sftp.yml`, `Dockerfile.editor`, `start-editor.sh`, `Caddyfile.editor` (was `*.stack.*`) — superseded by bundled monolith merge above.
- **Multi-service stack:** single in-compose Caddy (`edge-router`) for local and prod. Local: `docker compose -f docker-compose.yml -f docker-compose.local.yml` (HTTP `:8080`, hostnames `localhost` / `chat.localhost` / `preview.localhost`). Prod: edge-router on `:80`/`:443` with Let's Encrypt (`ACME_EMAIL`, `Caddyfile.prod`, `caddy_data`). Host systemd Caddy removed from stack deploy (bundled still uses host Caddy).
- cms-api / nginx / openwebui no longer publish host ports in the multi-service stack; optional `docker-compose.local-debug.yml` exposes `127.0.0.1:3000`.
- Open WebUI shares `site-data` with `DATA_DIR=/app/data/.open-webui` in the stack base compose (same as prod).
- `install-on-server.sh` stack path: preflight validate, disable host Caddy, never `down -v`.
- Replace `CAPUZ_SKIP_SEED` with `CAPUZ_SEED` (`SKIP` | `SEED` | `FORCE_OVERWRITE`). `FORCE_OVERWRITE` wipes `/app/data/assets` and copies `public/` seed again.

### Fixed

- `list_pages` / `GET /api/pages` now return draft status by default (`published` / `draft` / `modified`), so unpublished preview changes are visible without remembering `detail=status`. Use `changedOnly=true` to list only pages with changes; use `detail=paths` for the old path-only list.
- SFTP `listDrafts` no longer treats listing failures on an existing `.drafts/` directory as an empty draft set.
- Preview HTML `HEAD` responses include `Content-Length` (previously always `0`).
- Minimal nginx config: missing `/assets/*` return 404 instead of falling back to `index.html`.
- `import_chat_file` / `POST /api/assets/import-chat` now always resolves a real file extension (from filename, on-disk upload path, or Content-Type) and returns a ready-to-use `url` (e.g. `/assets/images/hero.jpg`) so `<img src>` keeps the file ending

### Added

- Hetzner **multi-service stack** production deploy (`docker-compose.yml` + `deploy/hetzner/docker-compose.production.yml`) with `CAPUZ_SKIP_SEED` for empty live site (TLS via in-compose edge-router — see Changed above)
- `import_chat_file` MCP tool and `POST /api/assets/import-chat` — copy chat-attached Open WebUI files into site assets via shared disk (bundled/stack; uses existing `DATA_DIR` or `${DATA_ROOT}/.open-webui`, no new env vars)
- Bundled setup (`Dockerfile.bundled`, `docker-compose.bundled.yml`, `render.bundled.yaml`) — one port with host-based routing:
  - `SITE_HOST` → nginx (published pages)
  - `EDITOR_HOST` → Open WebUI
  - `PREVIEW_HOST` → cms-api draft preview
- On Render, bundled hosts default from `RENDER_EXTERNAL_HOSTNAME` when unset

### Note

- Editor (`Dockerfile.editor`, `docker-compose.editor.yml`): superseded by bundled monolith with `CAPUZ_SERVE_SITE=false`

## [0.3.0] - 2026-06-24

### Added

- MCP/REST quick wins: `edit_page`, `move_page`, `rename_page`, `copy_page`, `search_pages`, `diff_page`
- Asset management: `list_assets`, `upload_asset`, `read_asset`, `delete_asset` with extension allowlist
- Reusable components library under `.components/` with `data-capuz-component` embedding
- Component tools: `list_components`, `read_component`, `write_component`, `delete_component`, `insert_component`, `sync_component`
- Reverse-engineering onboarding: `suggest_components` (alias `reverse_engineer`) — read-only UI pattern clustering
- SEO co-pilot: `audit_seo`, `apply_seo`, `regenerate_sitemap`
- Link-graph guardian: `check_links` plus inbound-link warnings on delete/move/rename
- Preview feedback: `render_preview` screenshot tool (optional `SCREENSHOT_RENDERER_URL`)
- Shared HTML helpers (`api/src/html.js`) using `node-html-parser` and `diff`

### Changed

- Storage backends (`fs`, `sftp`, `git`, `s3`) extended with assets and components support
- `.components/` excluded from public page listings (like `.drafts`; not served by nginx)

## [0.2.0] - 2026-06-23

### Added

- Draft workflow: `write_page` / `PUT /api/pages/*` save drafts only; explicit publish required
- Draft REST routes: `/api/drafts/*`, `POST /api/pages/{path}/publish`
- MCP tools: `read_draft`, `list_drafts`, `publish_page`, `discard_draft`
- `GET /api/pages?detail=status` and `list_pages(detail: "status")` for merged page listing
- Preview vhost in cms-api (`PREVIEW_HOST`, `PREVIEW_BASE_URL`, `DRAFTS_DIR`)
- Draft-or-fallback preview browsing with extensionless URL resolution
- Caddy `editor-router` on port 8081 for `preview.localhost` + Open WebUI in multi-service stack

### Changed

- **Breaking:** `PUT /api/pages/{path}` and MCP `write_page` no longer publish directly; use publish endpoints
- Draft storage on all backends (`fs`, `git`, `sftp`, `s3`)

## [0.1.0] - 2026-06-21

### Added

- Pluggable storage backends: `fs` (default), `sftp`, `git`, `s3`
- MCP tool server at `/mcp` with bearer authentication
- Complete OpenAPI 3.1 spec at `/openapi.json`
- `list_pages`, `read_page`, `write_page`, `delete_page` MCP tools
- Startup warning when `CMS_API_KEY` is missing or uses dev default
- Standalone `docker-compose.plugin.yml` for plugin-only deployment
- GitHub Actions workflow for multi-arch GHCR publishing
- Open WebUI community listing documentation

### Changed

- Refactored page operations behind a `Storage` interface
- Open WebUI multi-service stack now uses bearer auth for MCP connection

### Security

- MCP endpoints now require `Authorization: Bearer <CMS_API_KEY>`
