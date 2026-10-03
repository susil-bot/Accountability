#!/usr/bin/env bash
# From your Mac: copy the code to the VM and deploy it.
#   ./deploy/push.sh ubuntu@<server-ip> [~/.ssh/oracle_key]
set -euo pipefail
HOST=${1:?usage: push.sh ubuntu@<server-ip> [ssh-key]}
KEY=${2:-}
SSH="ssh ${KEY:+-i $KEY}"
cd "$(dirname "$0")/.."
[ -f deploy/.env.production ] || { echo "Run ./deploy/make-env.sh first."; exit 1; }
rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude .next --exclude out --exclude dist --exclude storage --exclude storage-test \
  --exclude test-results --exclude playwright-report --exclude .env --exclude '*.tsbuildinfo' \
  ./ "$HOST:~/accountability/"
$SSH "$HOST" 'chmod 600 ~/accountability/deploy/.env.production && bash ~/accountability/deploy/deploy.sh'
