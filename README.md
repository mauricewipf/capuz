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

### sftp — remote nginx or shared hosting

Use this when your site runs on a remote server (nginx or Apache serving files from disk) and cms-api connects over SFTP to read and write pages. The SFTP backend uses **SSH key authentication only** — no password auth in cms-api.

Set `SFTP_REMOTE_ROOT` to the absolute path of your **web document root** (where `index.html` lives), not your SSH home directory. On some hosts that looks like `/var/www/site`; on shared hosting it may look like `/customers/…/yourdomain/httpd.www`.

#### 1. Generate a deploy key

On the machine that runs cms-api (your laptop for local dev):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/capuz_deploy_key -C "capuz-cms-api" -N ""
chmod 600 ~/.ssh/capuz_deploy_key
```

Keep `~/.ssh/capuz_deploy_key` private. You will install `~/.ssh/capuz_deploy_key.pub` on the server.

#### 2. Get connection details and enable SFTP

From your hosting control panel (e.g. **Advanced settings → SSH & SFTP**):

- Turn **Allow SSH & SFTP access** on
- Note **hostname**, **username**, and **port**
- Set the SSH/SFTP password via the panel’s reset-email flow if you have not already

Use these values for `SFTP_HOST`, `SFTP_USER`, and `SFTP_PORT` in `.env`.

#### 3. Install your public key on the server

The server must have your public key in `~/.ssh/authorized_keys` for the SFTP user (one key per line, no extra quotes or blank lines).

**Option A — VPS with SSH shell** (recommended when available):

On the VPS, ensure a deploy user exists with write access to the web root, then copy your key:

```bash
# On the VPS (once)
sudo useradd -m -s /bin/bash capuz
sudo mkdir -p /var/www/site
sudo chown capuz:capuz /var/www/site
```

```bash
# On the cms-api host
ssh-copy-id -i ~/.ssh/capuz_deploy_key.pub -p PORT USER@HOST

# Verify
ssh -i ~/.ssh/capuz_deploy_key -p PORT USER@HOST "ls /var/www/site"
```

**Option B — SFTP only** (shared hosting without shell access):

Log in with password once, upload the key file, then switch to key auth.

```bash
# Local: prepare authorized_keys (exactly one line — the contents of your .pub file)
cp ~/.ssh/capuz_deploy_key.pub /tmp/authorized_keys

# Connect with password
sftp -P PORT USER@HOST
```

At the `sftp>` prompt:

```text
pwd                          # note your home directory, e.g. /home/example.com
mkdir .ssh                   # ignore "already exists" if present
put /tmp/authorized_keys .ssh/authorized_keys
quit
```

Tips for shared hosting:

- Put `authorized_keys` in the SFTP user’s **home** directory (`~/.ssh/`), not in the website folder (`httpd.www`).
- If `mkdir .ssh` fails, try the full path shown by `pwd`, e.g. `mkdir /home/example.com/.ssh`.
- Some panels document home as `/home/yourdomain.com` even when the web root is elsewhere.

If you have shell access later, tighten permissions: `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`.

#### 4. Test key-based SFTP

```bash
sftp -o IdentitiesOnly=yes -i ~/.ssh/capuz_deploy_key -P PORT USER@HOST
```

You should connect **without** a password prompt. List your web root to confirm the path for `SFTP_REMOTE_ROOT`:

```text
ls /var/www/site
# or, on shared hosting:
ls /customers/…/yourdomain/httpd.www
quit
```

#### 5. Run cms-api

**Docker (plugin only):**

```bash
docker run -d \
  --name cms-api \
  -p 3000:3000 \
  -e CMS_API_KEY="$CMS_API_KEY" \
  -e STORAGE_BACKEND=sftp \
  -e SFTP_HOST=HOST \
  -e SFTP_PORT=PORT \
  -e SFTP_USER=USER \
  -e SFTP_REMOTE_ROOT=/var/www/site \
  -e SFTP_KEY_PATH=/keys/id_ed25519 \
  -v ~/.ssh/capuz_deploy_key:/keys/id_ed25519:ro \
  ghcr.io/mauricewipf/capuz-cms-api:latest
```

**Bundled editor stack** (`docker-compose.stack.yml`) — set SFTP vars in `.env` and mount the private key:

```yaml
# docker-compose.stack.yml — under stack.volumes
volumes:
  - stack-data:/app/data
  - ~/.ssh/capuz_deploy_key:/keys/id_ed25519:ro
```

```bash
docker compose -f docker-compose.stack.yml up --build
```

#### 6. Verify cms-api

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/pages
```

You should get `{"ok":true}` and a JSON list of pages from the remote site.

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
  -e GIT_AUTHOR_NAME="Capuz AI" \
  -e GIT_AUTHOR_EMAIL=ai@example.com \
  -v ~/.ssh/capuz_deploy_key:/keys/id_ed25519:ro \
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
| `list_pages` | List published `.html` and `.xml` paths; optional `detail: "status"` for draft state |
| `list_drafts` | List paths with unpublished drafts |
| `read_page` | Read **published** page content by path |
| `read_draft` | Read pending draft content |
| `write_page` | Save HTML as a **draft** (returns `previewUrl`); does not publish |
| `publish_page` | Promote a draft to the live site |
| `discard_draft` | Delete a draft without publishing |
| `delete_page` | Delete a published page |

## REST API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| GET | `/openapi.json` | — | OpenAPI spec |
| GET | `/api/pages` | — | List published pages |
| GET | `/api/pages?detail=status` | — | List all pages with `published` / `draft` / `modified` status |
| GET | `/api/pages/{path}` | — | Read published page |
| PUT | `/api/pages/{path}` | Bearer | Save draft |
| POST | `/api/pages/{path}/publish` | Bearer | Publish draft |
| DELETE | `/api/pages/{path}` | Bearer | Delete published page |
| GET | `/api/drafts` | — | List draft paths |
| GET | `/api/drafts/{path}` | — | Read draft |
| PUT | `/api/drafts/{path}` | Bearer | Save draft |
| POST | `/api/drafts/{path}/publish` | Bearer | Publish draft |
| DELETE | `/api/drafts/{path}` | Bearer | Discard draft |
| POST | `/mcp` | Bearer | MCP protocol |

```bash
# Save draft
curl -H "Authorization: Bearer $CMS_API_KEY" \
  -X PUT http://localhost:3000/api/pages/test.html \
  -H "Content-Type: text/html" \
  -d '<!DOCTYPE html><html><body>Hello</body></html>'

# Publish draft
curl -H "Authorization: Bearer $CMS_API_KEY" \
  -X POST http://localhost:3000/api/pages/test.html/publish
```

## Preview

Draft pages are previewed on a separate host (subdomain). cms-api serves preview HTML when the HTTP `Host` matches `PREVIEW_HOST`. Assets load from the published site tree.

| Variable | Default (reference stack) | Description |
|----------|---------------------------|-------------|
| `PREVIEW_HOST` | `preview.localhost` | Hostname for preview vhost |
| `PREVIEW_BASE_URL` | `http://preview.localhost:8081` | Base URL returned in draft write responses |
| `DRAFTS_DIR` | `.drafts` | Draft storage directory name (under `DATA_ROOT` or backend equivalent) |

Reference stack URLs:

- Preview: http://preview.localhost:8081 (via Caddy on port 8081)
- Live site: http://localhost:8080

Plugin-only deployments: point `PREVIEW_BASE_URL` at wherever preview traffic reaches cms-api (e.g. `http://preview.localhost:3000` with `Host: preview.localhost`), or configure your own reverse proxy.

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
- Preview: http://preview.localhost:8081
- CMS API: http://localhost:3000

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_BACKEND` | `fs` | `fs`, `sftp`, `git`, or `s3` |
| `CMS_API_KEY` | — | Bearer token for MCP and write endpoints |
| `API_PORT` | `3000` | HTTP port |
| `DATA_ROOT` | `/app/data` | Site root (fs backend) |
| `DRAFTS_DIR` | `.drafts` | Draft pages directory name |
| `PREVIEW_HOST` | `preview.localhost` | Preview vhost hostname |
| `PREVIEW_BASE_URL` | `http://preview.localhost:8081` | Preview links in API responses |
| `SFTP_HOST` | — | SFTP server hostname |
| `SFTP_PORT` | `22` | SFTP port |
| `SFTP_USER` | — | SFTP username |
| `SFTP_KEY_PATH` | — | Path to private key inside the container |
| `SFTP_REMOTE_ROOT` | — | Absolute path to web document root on the server |
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
