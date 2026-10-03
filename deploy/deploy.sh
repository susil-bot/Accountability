#!/usr/bin/env bash
# Runs ON THE VM (push.sh calls it): build → migrate → start → smoke test. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
export RELEASE=$(date -u +%Y%m%d%H%M)

echo "▶ Building release $RELEASE"
$COMPOSE build api backup
docker tag "accountability-api:$RELEASE" accountability-api:latest

echo "▶ Starting database"
$COMPOSE up -d postgres

echo "▶ Applying database migrations"
$COMPOSE run --rm --no-deps api npx prisma migrate deploy

echo "▶ Starting services"
$COMPOSE up -d --remove-orphans

echo "▶ Waiting for the API to report healthy"
for i in $(seq 1 30); do
  if $COMPOSE exec -T api wget -qO- http://127.0.0.1:4000/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "✓ Healthy. Release $RELEASE is live."
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done
echo "✗ API did not become healthy. Logs:"; $COMPOSE logs --tail 80 api; exit 1
