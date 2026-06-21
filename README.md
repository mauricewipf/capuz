# Capuzzella Simple — static site + Open WebUI editor

Multi-service stack: nginx serves static HTML, Bun CMS API provides file management, and Open WebUI edits pages via natural language (OpenRouter).

## Prerequisites

- Docker Desktop with Docker Compose
- OpenRouter API key

## Setup

1. Copy env file and add your OpenRouter key:

   ```bash
   cp .env.example .env
   # edit .env — set OPENROUTER_API_KEY
   ```

2. Start the stack:

   ```bash
   docker compose up --build
   ```

## Architecture

The application runs as 3 separate Docker services:

- **nginx** (port 8080) - Static file server
- **cms-api** (port 3000) - Bun-based API and MCP server  
- **openwebui** (port 8081) - AI editor interface

All services share the same data volume (`site-data`) mounted at `/app/data`.

## URLs

| URL | Purpose |
|-----|---------|
| http://localhost:8080 | Public site (nginx) |
| http://localhost:8081 | Open WebUI editor |
| http://localhost:3000 | CMS API (optional) |

## First-time editor setup

1. Open http://localhost:8081
2. Create an admin account (signup enabled locally)
3. Confirm **CMS Pages** MCP tool server is connected (Admin → Settings → Integrations)
4. Select an OpenRouter model (e.g. `openai/gpt-4o-mini`)
5. Example prompt:

   > Read index.html, change the main hero heading to "Integration test OK", and save the file.

6. Verify at http://localhost:8080/

## CMS API (optional)

```bash
# List pages
curl http://localhost:8080/api/pages

# Write a page
curl -H "Authorization: Bearer dev-local-key" \
  -X PUT http://localhost:8080/api/pages/test.html \
  -d '<!DOCTYPE html><html><body>Hello</body></html>'
```

## Reset site data

```bash
docker compose down -v
```

This removes the `site-data` volume; the next start re-seeds from `pages/`.

## Deployment

This multi-service architecture requires a platform that supports Docker Compose (e.g., AWS ECS, DigitalOcean App Platform, Railway, or a VPS with Docker Compose).
