#!/usr/bin/env bash
# One-command local start: env → deps → Postgres → migrate → seed (first run) → dev servers.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
  SIGN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|; s|^STORAGE_SIGNING_SECRET=.*|STORAGE_SIGNING_SECRET=${SIGN}|" .env && rm -f .env.bak
  echo "› Created .env with fresh secrets"
fi

[ -d node_modules ] || npm install

echo "› Starting Postgres"
docker compose up -d --wait postgres

echo "› Applying migrations"
npm run db:migrate

if [ ! -f .seeded ]; then
  echo "› Seeding demo data"
  npm run db:seed && touch .seeded
fi

echo "› Web: http://localhost:3000   API: http://localhost:4000/api/v1   Docs: http://localhost:4000/docs"
npm run dev
