#!/usr/bin/env bash
# Runs ON THE VM: create the first admin (asks for the password).
#   bash ~/accountability/deploy/admin.sh you@example.com "Your Name"
set -euo pipefail
cd "$(dirname "$0")"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -it api \
  node dist/cli/create-admin.js --email "${1:?email}" --name "${2:?name}"
