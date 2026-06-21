# Open WebUI Community Listing — Capuzzella CMS API

Use this document when submitting the plugin to [openwebui.com](https://openwebui.com).

## Listing metadata

| Field | Value |
|-------|-------|
| **Name** | Capuzzella CMS Pages |
| **Category** | Tool Server (MCP) |
| **One-line description** | AI-editable HTML pages for static sites via MCP — fs, SFTP, Git, or S3/R2 backends |
| **GitHub** | `https://github.com/<your-org>/capuzzella-simple` |
| **Docker Hub** | `capuzzella/cms-api:latest` |
| **License** | (set your license) |

## Long description

Capuzzella CMS API is an Open WebUI tool server that lets AI models read, write, and delete HTML/XML pages on your static site.

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
  capuzzella/cms-api:latest
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

- [ ] Push `capuzzella/cms-api` image to Docker Hub
- [ ] Tag release `v0.1.0` on GitHub
- [ ] Capture 2–3 screenshots
- [ ] Submit listing on openwebui.com (Tools / Tool Servers)
- [ ] Include GitHub and Docker Hub links in the listing

## Optional: Python Tool wrapper

For users who prefer Open WebUI's in-UI tool installer, publish a thin Python Tool that calls the REST API. The user still self-hosts cms-api; the Python wrapper is just a client.

```python
# Requires: pip install requests
# Valves: CMS_API_URL, CMS_API_KEY

import requests

class Tools:
    def __init__(self):
        self.api_url = ""
        self.api_key = ""

    def list_pages(self) -> str:
        r = requests.get(f"{self.api_url}/api/pages", timeout=30)
        r.raise_for_status()
        return str(r.json()["pages"])
```

(Full wrapper can be expanded with read/write/delete methods mirroring the MCP tools.)
