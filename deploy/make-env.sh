#!/usr/bin/env bash
# Creates deploy/.env.production with strong random secrets and Web Push keys. Run once, on your Mac.
#   ./deploy/make-env.sh            single-VM setup (Oracle or any Docker host)
#   ./deploy/make-env.sh --cloud    free cloud setup (Render + Supabase, no card)
set -euo pipefail
cd "$(dirname "$0")"
OUT=.env.production
if [ -f "$OUT" ]; then echo "$OUT already exists — not overwriting (delete it first to regenerate)."; exit 1; fi

rand() { node -e "console.log(require('crypto').randomBytes($1).toString('base64url'))"; }
VAPID=$(cd ../apps/api && node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")

if [ "${1:-}" = "--cloud" ]; then
  # Free cloud setup (Render + Supabase): only the values the web app and Render need.
  read -rp "Web address (e.g. https://accountability.pages.dev): " APP_URL
  read -rp "Render API address [https://accountability-api.onrender.com]: " API_URL
  API_URL=${API_URL:-https://accountability-api.onrender.com}
  read -rp "Your email (for push notification contact): " EMAIL
  ORIGIN=$(rand 32)
  cat > "$OUT" <<ENV
APP_URL=${APP_URL%/}
API_HOST=$(echo "${API_URL%/}" | sed -E 's#^https?://##')
ORIGIN_SECRET=$ORIGIN
VAPID_PUBLIC_KEY=${VAPID% *}
VAPID_PRIVATE_KEY=${VAPID#* }
VAPID_SUBJECT=mailto:$EMAIL
ENV
  chmod 600 "$OUT"
  echo
  echo "Created deploy/$OUT. Paste these into Render when it asks (Blueprint → environment):"
  echo "  APP_URL            ${APP_URL%/}"
  echo "  ORIGIN_SECRET      $ORIGIN"
  echo "  VAPID_PUBLIC_KEY   ${VAPID% *}"
  echo "  VAPID_PRIVATE_KEY  ${VAPID#* }"
  echo "  VAPID_SUBJECT      mailto:$EMAIL"
  exit 0
fi

read -rp "Web address (e.g. https://accountability.pages.dev): " APP_URL
read -rp "Server public IP (from Oracle): " IP
read -rp "Email for TLS certificate notices: " ACME_EMAIL
API_HOST="$(echo "$IP" | tr '.' '-').sslip.io"

cat > "$OUT" <<ENV
APP_URL=${APP_URL%/}
API_HOST=$API_HOST
ACME_EMAIL=$ACME_EMAIL

POSTGRES_PASSWORD=$(rand 24)
JWT_SECRET=$(rand 48)
STORAGE_SIGNING_SECRET=$(rand 48)
ORIGIN_SECRET=$(rand 32)
SESSION_TTL_DAYS=7

STORAGE_DRIVER=local
R2_ACCOUNT_ID=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
BACKUP_BUCKET=

VAPID_PUBLIC_KEY=${VAPID% *}
VAPID_PRIVATE_KEY=${VAPID#* }
VAPID_SUBJECT=mailto:$ACME_EMAIL
ENV
chmod 600 "$OUT"
echo
echo "Created deploy/$OUT"
echo "  API origin for Cloudflare Pages:  API_ORIGIN=https://$API_HOST"
echo "  ORIGIN_SECRET for Cloudflare Pages: $(grep ^ORIGIN_SECRET= "$OUT" | cut -d= -f2)"
