#!/usr/bin/env bash
# Deploy / sync the Capuz Blueprint on Render.
# Requires: RENDER_API_KEY (https://dashboard.render.com/u/settings#api-keys)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${RENDER_API_BASE:-https://api.render.com/v1}"
BRANCH="${RENDER_DEPLOY_BRANCH:-cursor/render-chat-preview-hosts-fe5c}"
REPO_URL="${RENDER_REPO_URL:-https://github.com/mauricewipf/capuz}"
SERVICE_NAME="${RENDER_SERVICE_NAME:-capuz}"

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "Set RENDER_API_KEY to deploy." >&2
  exit 1
fi

auth=(-H "Authorization: Bearer ${RENDER_API_KEY}" -H "Accept: application/json" -H "Content-Type: application/json")

echo "Validating blueprint..."
curl -fsS "${API}/blueprints/validate" "${auth[@]}" \
  --data-binary @"${ROOT}/render.yaml" >/dev/null || true

OWNER_ID="$(curl -fsS "${API}/owners" "${auth[@]}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["owner"]["id"] if isinstance(d,list) else d["owner"]["id"])')"
echo "Owner: ${OWNER_ID}"

EXISTING="$(curl -fsS "${API}/services?limit=50&name=${SERVICE_NAME}" "${auth[@]}" || echo '[]')"
SERVICE_ID="$(python3 - <<PY
import json,os
data=json.loads('''${EXISTING}''')
items=data if isinstance(data,list) else data.get('services',data.get('items',[]))
for row in items:
  svc=row.get('service',row)
  if svc.get('name')==os.environ.get('SERVICE_NAME','capuz') or svc.get('name')=='${SERVICE_NAME}':
    print(svc.get('id','')); break
PY
)"

if [ -z "$SERVICE_ID" ]; then
  echo "Creating web service ${SERVICE_NAME} from ${REPO_URL}@${BRANCH}..."
  CREATE_PAYLOAD="$(python3 - <<PY
import json,os
print(json.dumps({
  "type": "web_service",
  "name": "${SERVICE_NAME}",
  "ownerId": "${OWNER_ID}",
  "repo": "${REPO_URL}",
  "branch": "${BRANCH}",
  "autoDeploy": "yes",
  "serviceDetails": {
    "runtime": "docker",
    "plan": "starter",
    "region": "frankfurt",
    "healthCheckPath": "/",
    "dockerContext": ".",
    "dockerfilePath": "./Dockerfile.stack",
    "numInstances": 1,
    "env": "docker",
    "disk": {"name": "data", "mountPath": "/app/data", "sizeGB": 1}
  },
  "envVars": [
    {"key": "APP_NAME", "value": "Capuz CMS"},
    {"key": "OPENAI_API_BASE_URL", "value": "https://openrouter.ai/api/v1"},
    {"key": "OPENROUTER_API_KEY", "value": os.environ.get("OPENROUTER_API_KEY","")},
    {"key": "ENABLE_OPENAI_API", "value": "true"},
    {"key": "DEFAULT_MODELS", "value": "minimax/minimax-m3"},
    {"key": "DEFAULT_MODEL_PARAMS", "value": '{"function_calling":"native"}'},
    {"key": "CMS_API_KEY", "generateValue": True},
    {"key": "WEBUI_SECRET_KEY", "generateValue": True},
    {"key": "ENABLE_SIGNUP", "value": "true"},
    {"key": "DATA_DIR", "value": "/app/data/.open-webui"},
    {"key": "DATA_ROOT", "value": "/app/data"},
    {"key": "STORAGE_BACKEND", "value": "fs"},
    {"key": "DRAFTS_DIR", "value": ".drafts"},
    {"key": "COMPONENTS_DIR", "value": ".components"},
    {"key": "NGINX_PORT", "value": "8088"},
    {"key": "RAG_EMBEDDING_ENGINE", "value": "openai"}
  ]
}))
PY
)"
  RESP="$(curl -fsS "${API}/services" "${auth[@]}" -d "$CREATE_PAYLOAD")"
  SERVICE_ID="$(python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("service",d).get("id",""))' <<<"$RESP")"
  SERVICE_URL="$(python3 -c 'import sys,json; d=json.load(sys.stdin); s=d.get("service",d); print(s.get("serviceDetails",{}).get("url") or s.get("url") or "")' <<<"$RESP")"
else
  echo "Found existing service ${SERVICE_ID}; triggering deploy of ${BRANCH}..."
  curl -fsS "${API}/services/${SERVICE_ID}" "${auth[@]}" \
    -X PATCH -d "{\"branch\":\"${BRANCH}\"}" >/dev/null || true
  RESP="$(curl -fsS "${API}/services/${SERVICE_ID}/deploys" "${auth[@]}" -d '{}')"
  SERVICE_URL="https://${SERVICE_NAME}.onrender.com"
fi

echo "SERVICE_ID=${SERVICE_ID}"
echo "SERVICE_URL=${SERVICE_URL:-https://${SERVICE_NAME}.onrender.com}"

# Poll deploy until live
for i in $(seq 1 90); do
  DEPS="$(curl -fsS "${API}/services/${SERVICE_ID}/deploys?limit=1" "${auth[@]}")"
  STATUS="$(python3 - <<PY
import json
data=json.loads('''${DEPS}''')
items=data if isinstance(data,list) else []
if items:
  d=items[0].get('deploy',items[0])
  print(d.get('status',''))
PY
)"
  echo "deploy status: ${STATUS} (try ${i})"
  case "$STATUS" in
    live) echo "Deploy live at ${SERVICE_URL:-https://${SERVICE_NAME}.onrender.com}"; exit 0 ;;
    build_failed|update_failed|canceled|deactivated) echo "Deploy failed: ${STATUS}" >&2; exit 1 ;;
  esac
  sleep 20
done
echo "Timed out waiting for deploy" >&2
exit 1
