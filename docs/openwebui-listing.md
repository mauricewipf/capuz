# Open WebUI Community Listing — Capuz CMS API

Use this document when submitting the plugin to [openwebui.com](https://openwebui.com).

## Listing metadata

| Field | Value |
|-------|-------|
| **Name** | Capuz CMS Pages |
| **Category** | Tool Server (MCP) |
| **One-line description** | AI-editable HTML pages for static sites via MCP — fs, SFTP, Git, or S3/R2 backends |
| **GitHub** | `https://github.com/mauricewipf/capuz` |
| **Docker Hub** | `mauricewipf/capuz-cms-api:latest` |
| **License** | MIT |

## Long description

Capuz CMS API is an Open WebUI tool server that lets AI models read, write, and delete HTML/XML pages on your static site.

Connect it once, then ask Open WebUI to edit your site in natural language:

> Read index.html, change the hero heading to "Welcome", and save the file.

### Supported storage backends

- **fs (default)** — shared volume with nginx on the same host
- **sftp** — push to a remote VPS over SSH
- **git** — commit and push to a repo connected to GitHub Pages, Cloudflare Pages, Netlify, or Vercel
- **s3** — write directly to Cloudflare R2 or AWS S3 for instant edge deploys

### MCP tools

- `list_pages` — list all page paths
- `read_page` — read page HTML
- `write_page` — save page HTML
- `delete_page` — remove a page

## Install snippet

```bash
export CMS_API_KEY=$(openssl rand -hex 32)

docker run -d \
  --name cms-api \
  -p 3000:3000 \
  -e CMS_API_KEY="$CMS_API_KEY" \
  -e STORAGE_BACKEND=fs \
  -e DATA_ROOT=/app/data \
  -v /var/www/site:/app/data \
  mauricewipf/capuz-cms-api:latest
```

## Open WebUI configuration

Add under **Admin → Settings → Integrations → Tool Servers**:

```json
[
  {
    "type": "mcp",
    "url": "http://cms-api:3000/mcp",
    "path": "/mcp",
    "auth_type": "bearer",
    "key": "YOUR_CMS_API_KEY",
    "config": { "enable": 1 },
    "info": {
      "id": "cms-pages",
      "name": "CMS Pages",
      "description": "Read and write HTML files on the site"
    }
  }
]
```

## Screenshots to capture before submission

1. Open WebUI chat editing a page with the CMS Pages tool enabled
2. Tool call showing `read_page` / `write_page` in the conversation
3. Updated page visible in the browser
4. Admin → Integrations showing the connected MCP server

## Submission checklist

1. **Create Docker Hub repository** — [hub.docker.com](https://hub.docker.com) → create `mauricewipf/capuz-cms-api`
2. **Add GitHub Actions secrets** — repo **Settings → Secrets and variables → Actions**:
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN` (access token, not account password)
3. **Tag and push release** — triggers [.github/workflows/publish.yml](../.github/workflows/publish.yml):
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. **Verify image** — `docker pull mauricewipf/capuz-cms-api:0.1.0`
5. **Create GitHub Release** — `gh release create v0.1.0 --title "v0.1.0" --notes-file CHANGELOG.md`
6. **Capture screenshots** — see list above
7. **Submit listing** — [openwebui.com](https://openwebui.com) → Tools / Tool Servers; include GitHub and Docker Hub links
