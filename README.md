# Capuz CMS API — Open WebUI Plugin

AI-editable HTML and XML pages for static sites. Connect Open WebUI to this MCP / OpenAPI tool server and let the model read, write, and delete pages on your site.

**Best for:** hand-written HTML sites, landing pages, and static sites where the file in storage is what ships. Not for build-step frameworks (Next.js, Astro, Hugo, etc.).

## Choose a storage backend

```
Where does your site live?

  ├─ Same server as nginx (Docker / VPS)
  │     → STORAGE_BACKEND=fs   (default)
  │
  ├─ Remote Linux server (nginx + filesystem, no Git)
  │     → STORAGE_BACKEND=sftp
  │
  ├─ Static host via Git (Pages, Netlify, Vercel, GitHub Pages)
  │     → STORAGE_BACKEND=git
  │
  └─ S3-compatible bucket (Cloudflare R2, AWS S3, MinIO)
        → STORAGE_BACKEND=s3
```

## Quick start (Docker)

Generate an API key:

```bash
export CMS_API_KEY=$(openssl rand -hex 32)
```

### fs — colocated with nginx (default)

Run cms-api on the same host as your web server and mount the site directory:

```bash
docker run -d \
  --name cms-api \
  -p 3000:3000 \
  -e CMS_API_KEY="$CMS_API_KEY" \
  -e STORAGE_BACKEND=fs \
  -e DATA_ROOT=/app/data \
  -v /var/www/site:/app/data \
  ghcr.io/mauricewipf/capuz-cms-api:latest
```

### sftp — remote nginx VPS

On the VPS, create a deploy user with write access to the web root and add your public key.

```bash
docker run -d \
  --name cms-api \
  -p 3000:3000 \
  -e CMS_API_KEY="$CMS_API_KEY" \
  -e STORAGE_BACKEND=sftp \
  -e SFTP_HOST=vps.example.com \
  -e SFTP_USER=capuzzella \
  -e SFTP_REMOTE_ROOT=/var/www/site \
  -e SFTP_KEY_PATH=/keys/id_ed25519 \
  -v ~/.ssh/capuzzella_deploy_key:/keys/id_ed25519:ro \
  ghcr.io/mauricewipf/capuz-cms-api:latest
```

### git — static host auto-deploy

Add a deploy key with write access to your site repository.

```bash
docker run -d \
  --name cms-api \
  -p 3000:3000 \
  -e CMS_API_KEY="$CMS_API_KEY" \
  -e STORAGE_BACKEND=git \
  -e GIT_REMOTE=git@github.com:you/yoursite.git \
  -e GIT_BRANCH=main \
  -e GIT_KEY_PATH=/keys/id_ed25519 \
  -e GIT_AUTHOR_NAME="Capuzzella AI" \
  -e GIT_AUTHOR_EMAIL=ai@example.com \
  -v ~/.ssh/capuzzella_deploy_key:/keys/id_ed25519:ro \
  -v cms-git-repo:/app/repo \
  ghcr.io/mauricewipf/capuz-cms-api:latest
```

Each write creates a commit and pushes. Deploy latency is typically 20–90 seconds depending on your host.

### s3 — Cloudflare R2 / AWS S3 (instant deploy)

```bash
docker run -d \
  --name cms-api \
  -p 3000:3000 \
  -e CMS_API_KEY="$CMS_API_KEY" \
  -e STORAGE_BACKEND=s3 \
  -e S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  -e S3_REGION=auto \
  -e S3_BUCKET=your-bucket \
  -e S3_ACCESS_KEY_ID=... \
  -e S3_SECRET_ACCESS_KEY=... \
  -e S3_PUBLIC_URL=https://your-site.example.com \
  ghcr.io/mauricewipf/capuz-cms-api:latest
```

For extensionless URLs on R2, front the bucket with a small Cloudflare Worker (same role nginx plays in the fs backend).

## Connect to Open WebUI

In **Admin → Settings → Integrations → Tool Servers**, add an MCP connection:

```json
[
  {
    "type": "mcp",
    "url": "http://cms-api:3000/mcp",
    "path": "/mcp",
    "auth_type": "bearer",
    "key": "YOUR_CMS_API_KEY",
    "config": { "enable": true },
    "info": {
      "id": "cms-pages",
      "name": "CMS Pages",
      "description": "Read and write HTML files on the site"
    }
  }
]
```

Replace the URL with wherever cms-api is reachable from Open WebUI (e.g. `https://cms.example.com/mcp`).

Alternatively, add the OpenAPI Tool Server using `http://cms-api:3000/openapi.json` with the same bearer key.

## MCP tools

| Tool | Description |
|------|-------------|
| `list_pages` | List all `.html` and `.xml` paths |
| `read_page` | Read page content by path |
| `write_page` | Write HTML to a path (creates directories as needed) |
| `delete_page` | Delete a page by path |

## REST API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| GET | `/openapi.json` | — | OpenAPI spec |
| GET | `/api/pages` | — | List pages |
| GET | `/api/pages/{path}` | — | Read page |
| PUT | `/api/pages/{path}` | Bearer | Write page |
| DELETE | `/api/pages/{path}` | Bearer | Delete page |
| POST | `/mcp` | Bearer | MCP protocol |

```bash
curl -H "Authorization: Bearer $CMS_API_KEY" \
  -X PUT http://localhost:3000/api/pages/test.html \
  -H "Content-Type: text/html" \
  -d '<!DOCTYPE html><html><body>Hello</body></html>'
```

## Security

- Generate `CMS_API_KEY` with `openssl rand -hex 32`. Do not use the dev default in production.
- Expose port 3000 only on a private network or behind TLS (reverse proxy).
- MCP and write endpoints require bearer auth.
- Path validation blocks traversal and restricts extensions to `.html` and `.xml`.

## Reference stack (this repo)

This repository includes a full demo with nginx + cms-api + Open WebUI:

```bash
cp .env.example .env
# set OPENROUTER_API_KEY
docker compose up --build
```

- Public site: http://localhost:8080
- Open WebUI: http://localhost:8081
- CMS API: http://localhost:3000

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_BACKEND` | `fs` | `fs`, `sftp`, `git`, or `s3` |
| `CMS_API_KEY` | — | Bearer token for MCP and write endpoints |
| `API_PORT` | `3000` | HTTP port |
| `DATA_ROOT` | `/app/data` | Site root (fs backend) |
| `SFTP_*` | — | SFTP connection settings |
| `GIT_*` | — | Git remote and deploy key settings |
| `S3_*` | — | S3-compatible bucket settings |

See [.env.example](.env.example) for the full list.

## Publish / install

- Container registry: `docker pull ghcr.io/mauricewipf/capuz-cms-api:latest`
- Open WebUI community listing: see [docs/openwebui-listing.md](docs/openwebui-listing.md)

### First release

Pushing a version tag triggers [.github/workflows/publish.yml](.github/workflows/publish.yml), which builds multi-arch images and pushes:

- `ghcr.io/mauricewipf/capuz-cms-api:latest`
- `ghcr.io/mauricewipf/capuz-cms-api:<version>` (e.g. `0.1.0`)

Prerequisites: public GHCR package `ghcr.io/mauricewipf/capuz-cms-api` (created automatically on first tag push). Full steps are in [docs/openwebui-listing.md](docs/openwebui-listing.md).

```bash
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes-file CHANGELOG.md
```

## License

MIT — see [LICENSE](LICENSE).

## Limitations

- HTML and XML files only
- No build-step framework support (Next.js, Astro, Hugo, etc.)
- Git backend: deploy latency depends on your host CI (typically 20–90s)
