# Changelog

All notable changes to the Capuz CMS API plugin are documented here.

## Unreleased

### Added

- `import_chat_file` MCP tool and `POST /api/assets/import-chat` — copy chat-attached Open WebUI files into site assets via shared disk (bundled/stack; uses existing `DATA_DIR` or `${DATA_ROOT}/.open-webui`, no new env vars)
- Bundled setup (`Dockerfile.bundled`, `docker-compose.bundled.yml`, `render.bundled.yaml`) — one port with host-based routing:
  - `SITE_HOST` → nginx (published pages)
  - `EDITOR_HOST` → Open WebUI
  - `PREVIEW_HOST` → cms-api draft preview
- On Render, bundled hosts default from `RENDER_EXTERNAL_HOSTNAME` when unset

### Note

- Editor stack (`Dockerfile.stack`, `docker-compose.stack.yml`) is unchanged: Open WebUI + cms-api preview on one port, no bundled live site

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
- Caddy `editor-router` on port 8081 for `preview.localhost` + Open WebUI in reference stack

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
- Open WebUI reference stack now uses bearer auth for MCP connection

### Security

- MCP endpoints now require `Authorization: Bearer <CMS_API_KEY>`
