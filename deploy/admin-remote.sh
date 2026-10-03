#!/usr/bin/env bash
# From your Mac: create the first admin directly in the cloud database (Render's free plan has no shell).
#   ./deploy/admin-remote.sh you@example.com "Your Name"
# Asks for the Supabase DATABASE_URL (same value as in Render) and the admin password; nothing is stored.
set -euo pipefail
EMAIL=${1:?email}; NAME=${2:?name}
read -rsp "DATABASE_URL (from Render/Supabase): " DATABASE_URL; echo
read -rsp "Admin password (min 8, a letter and a number): " ADMIN_PASSWORD; echo
cd "$(dirname "$0")/../apps/api"
DATABASE_URL="$DATABASE_URL" ADMIN_PASSWORD="$ADMIN_PASSWORD" JWT_SECRET=cli-only-not-used-for-sessions-000000000000 \
  npx ts-node --transpile-only src/cli/create-admin.ts --email "$EMAIL" --name "$NAME"
