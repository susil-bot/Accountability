#!/usr/bin/env bash
# From your Mac: build the static web app and publish it to Cloudflare Pages.
#   ./deploy/deploy-web.sh [project-name]      (default project: accountability)
# First run opens a browser to log in to Cloudflare. API_ORIGIN and ORIGIN_SECRET are read from
# deploy/.env.production and stored as encrypted Pages secrets before each deploy.
set -euo pipefail
PROJECT=${1:-accountability}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="$ROOT/deploy/.env.production"
[ -f "$ENVF" ] || { echo "Run ./deploy/make-env.sh first."; exit 1; }
val() { grep "^$1=" "$ENVF" | head -1 | cut -d= -f2-; }
WRANGLER="npx --yes wrangler@4"

$WRANGLER pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 || true
printf '%s' "https://$(val API_HOST)" | $WRANGLER pages secret put API_ORIGIN --project-name "$PROJECT" >/dev/null
printf '%s' "$(val ORIGIN_SECRET)" | $WRANGLER pages secret put ORIGIN_SECRET --project-name "$PROJECT" >/dev/null
echo "✓ Pages secrets set (API_ORIGIN=https://$(val API_HOST))"

cd "$ROOT/apps/web"
npm run build
# functions/ (the /api/v1 proxy) is picked up from this directory automatically.
$WRANGLER pages deploy out --project-name "$PROJECT" --branch main --commit-dirty=true
echo "✓ Web app published. Check: $(val APP_URL)/api/v1/auth/session should return {\"success\":true,\"data\":null}"
