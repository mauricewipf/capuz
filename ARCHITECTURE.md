# Architecture Overview

## Multi-Service Design

This application has been refactored from a monolithic single-container design to a microservices architecture with 3 separate Docker services.

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
- REST API for page CRUD operations (`/api/pages`)
- MCP server for Open WebUI integration (`/mcp`)
- Health check endpoint (`/health`)
- File system operations on HTML/XML files

**Key Endpoints**:
- `GET /api/pages` - List all pages
- `GET /api/pages/{path}` - Read page content
- `PUT /api/pages/{path}` - Write/update page
- `DELETE /api/pages/{path}` - Delete page
- `POST /mcp` - MCP protocol handler

#### 3. openwebui (AI Editor)
- **Image**: `python:3.11-slim` + Open WebUI
- **Port**: 8081 (maps to internal 8080)
- **Purpose**: AI-powered content editor
- **Volume**: Reads/writes shared `site-data:/app/data`
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
User → openwebui:8080 → MCP → cms-api:3000 → /app/data/page.html
                                                    ↓
nginx:80 serves updated file ←─────────────────────┘
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
  - `.open-webui/` - Open WebUI data (SQLite, uploads, etc.)

## Network Communication

Services communicate via Docker's internal bridge network:
- Service names resolve via Docker DNS
- `http://cms-api:3000` - API accessible from openwebui
- `http://nginx:80` - Web server accessible from other services
- `http://openwebui:8080` - Editor accessible from other services

External access:
- `localhost:8080` → nginx (public site)
- `localhost:8081` → openwebui (editor)
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

### Monolithic Alternative
For platforms like Render that prefer single containers, use `Dockerfile.monolithic.old` which combines all three services into one container.

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
