#!/bin/sh
# Container entrypoint: optionally apply database migrations, then start the API.
# Hosts without a separate "release" step (e.g. Render free) set RUN_MIGRATIONS=true.
set -e
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo '{"event":"migrations_start"}'
  npx prisma migrate deploy
  echo '{"event":"migrations_done"}'
fi
exec node dist/main.js
