# Changelog

All notable changes to the Capuz CMS API plugin are documented here.

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
