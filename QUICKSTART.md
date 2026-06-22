# Quick Start Guide

## Setup (First Time)

```bash
# 1. Clone and enter directory
cd capuz

# 2. Configure environment
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY

# 3. Start services
docker compose up --build -d

# 4. Open in browser
open http://localhost:8080    # Public site
open http://localhost:8081    # AI Editor
```

## URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **nginx** | http://localhost:8080 | Public website |
| **openwebui** | http://localhost:8081 | AI editor interface |
| **cms-api** | http://localhost:3000 | API (optional) |

## Common Commands

```bash
# Start everything
docker compose up --build -d

# View logs
docker compose logs -f              # All services
docker compose logs -f nginx        # Just nginx
docker compose logs -f cms-api      # Just API

# Check status
docker compose ps

# Stop everything
docker compose down

# Restart services
docker compose restart

# Open shell in a service
docker compose exec nginx sh
docker compose exec cms-api sh
docker compose exec openwebui sh

# Rebuild after code changes
docker compose build                # All services
docker compose build cms-api        # Just API

# Clean up (removes data!)
docker compose down -v
```

## Editor Setup (First Use)

1. Open http://localhost:8081
2. Click "Sign Up" and create an admin account
3. Go to **Settings** → **Integrations**
4. Verify **CMS Pages** MCP server is connected
5. Select a model (e.g., `openai/gpt-4o-mini`)
6. Try a prompt:
   ```
   Read index.html, change the hero heading, and save it.
   ```

## API Usage (Optional)

```bash
# List all pages
curl http://localhost:3000/api/pages

# Read a page
curl http://localhost:3000/api/pages/index.html

# Write a page (requires API key)
curl -H "Authorization: Bearer dev-local-key" \
     -X PUT \
     -d '<html>...</html>' \
     http://localhost:3000/api/pages/test.html

# Delete a page
curl -H "Authorization: Bearer dev-local-key" \
     -X DELETE \
     http://localhost:3000/api/pages/test.html
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
├─────────────────┬─────────────────┬────────────────────┤
│   nginx:8080    │   cms-api:3000  │  openwebui:8081    │
│  Static Server  │   Bun API + MCP │   AI Editor        │
└────────┬────────┴────────┬────────┴─────────┬──────────┘
         │                 │                  │
         └─────────────────┴──────────────────┘
                           │
                   Shared Volume
                   /app/data
```

## Service Details

### nginx
- **Image**: nginx:alpine
- **Port**: 8080 → 80
- **Purpose**: Serve HTML files
- **Dockerfile**: `Dockerfile.nginx`

### cms-api
- **Image**: oven/bun:1-alpine
- **Port**: 3000
- **Purpose**: File management API + MCP server
- **Dockerfile**: `Dockerfile.api`

### openwebui
- **Image**: python:3.11-slim + Open WebUI
- **Port**: 8081 → 8080
- **Purpose**: AI-powered editor
- **Dockerfile**: `Dockerfile.openwebui`

## Directory Structure

```
capuz/
├── api/                    # API source code (JavaScript / Bun)
│   ├── src/
│   │   ├── server.js      # Main API server
│   │   ├── mcp.js         # MCP server implementation
│   │   ├── paths.js       # Path validation
│   │   ├── auth.js        # API key auth
│   │   ├── storage/       # Storage backends (fs, sftp, git, s3)
│   │   └── ...
│   └── package.json
├── pages/                  # Seed HTML files
│   ├── index.html
│   └── ...
├── Dockerfile.nginx        # nginx image
├── Dockerfile.api          # API image
├── Dockerfile.openwebui    # Editor image
├── docker-compose.yml      # Service orchestration
├── nginx.conf              # nginx configuration
├── README.md              # Overview
├── ARCHITECTURE.md        # Detailed architecture
└── QUICKSTART.md         # This file
```

## Environment Variables

Required:
- `OPENROUTER_API_KEY` - Your OpenRouter API key

Optional (with defaults):
- `CMS_API_KEY` - API authentication key (default: dev-local-key)
- `WEBUI_SECRET_KEY` - Session secret (default: dev-secret-change-me)
- `WEBUI_URL` - Editor URL (default: http://localhost:8081)
- `ENABLE_SIGNUP` - Allow account creation (default: true)
- `DEFAULT_MODELS` - Available models (default: openai/gpt-4o-mini)

## Troubleshooting

### Port Already in Use
```bash
# Find what's using the port
lsof -i :8080
lsof -i :8081
lsof -i :3000

# Change ports in docker-compose.yml
ports:
  - "8082:80"  # Use 8082 instead of 8080
```

### Services Not Starting
```bash
# Check Docker is running
docker ps

# View detailed logs
docker compose logs --tail=100

# Rebuild from scratch
docker compose down -v
docker compose up --build
```

### Can't Edit Pages
1. Check Open WebUI MCP connection:
   - Settings → Integrations → CMS Pages
2. Verify API is reachable:
   ```bash
   docker compose exec openwebui wget -O- http://cms-api:3000/health
   ```

### No Pages Showing
```bash
# Verify seed data
docker compose exec nginx ls -la /app/data

# Check API
curl http://localhost:3000/api/pages
```

## Reset Everything

```bash
# Remove all containers and data
docker compose down -v

# Then restart
docker compose up --build -d
```

## Next Steps

- Read `ARCHITECTURE.md` for technical details
- Check `README.md` for deployment options
- Browse code in `api/src/` to understand the API

## Getting Help

1. Check logs: `docker compose logs -f`
2. Check status: `docker compose ps`
3. Review architecture: `ARCHITECTURE.md`
