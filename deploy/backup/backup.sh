#!/bin/sh
# Nightly backup: database dump + uploaded files. Keeps 14 days locally; copies to Cloudflare R2 when configured.
set -eu
STAMP=$(date -u +%Y-%m-%dT%H%M)
DIR=/backups
mkdir -p "$DIR"
pg_dump --format=custom --no-owner --file="$DIR/db-$STAMP.dump"
if [ -d /data/storage ] && [ "$(ls -A /data/storage 2>/dev/null)" ]; then
  tar -czf "$DIR/files-$STAMP.tgz" -C /data storage
fi
find "$DIR" -type f -mtime +14 -delete
echo "{\"event\":\"backup_done\",\"stamp\":\"$STAMP\",\"size\":\"$(du -sh "$DIR" | cut -f1)\"}"

if [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${BACKUP_BUCKET:-}" ] && [ -n "${STORAGE_ACCESS_KEY:-}" ]; then
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ACL=private \
         RCLONE_CONFIG_R2_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
         RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  rclone copy "$DIR" "r2:${BACKUP_BUCKET}/backups" --max-age 25h --quiet
  rclone delete "r2:${BACKUP_BUCKET}/backups" --min-age 30d --quiet || true
  echo "{\"event\":\"backup_uploaded\",\"bucket\":\"$BACKUP_BUCKET\"}"
fi
