#!/bin/sh
# Restore a database dump:  docker compose ... exec backup restore.sh /backups/db-2026-10-04T0315.dump
# Stop the api first (docker compose ... stop api) so nothing writes during the restore.
set -eu
FILE=${1:?usage: restore.sh /backups/db-<stamp>.dump}
pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" "$FILE"
echo "restored $FILE"
