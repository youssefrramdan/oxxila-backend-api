#!/usr/bin/env bash
# Server-side deploy entry point for Oxxila. Installed at /usr/local/bin/oxxila-deploy.
#
# GitHub Actions logs in with a key that is locked to this script in
# /root/.ssh/authorized_keys (command="/usr/local/bin/oxxila-deploy",restrict),
# so that key can only run one of these two actions and nothing else:
#
#   ssh root@VPS backend             -> git pull + npm ci + pm2 reload
#   ssh root@VPS frontend < dist.tgz -> replace the static site with the tarball
set -euo pipefail

API_DIR=/back/oxxila-backend-api
PM2_APP=oxxila
API_PORT=3000
WEB_DIR=/var/www/dash_oxxilap_usr/data/www/oxxilapharma.com
WEB_BACKUPS=/var/backups/oxxila-web
LOCK=/var/lock/oxxila-deploy.lock

ACTION="${SSH_ORIGINAL_COMMAND:-${1:-}}"

export NVM_DIR=/root/.nvm
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh" >/dev/null

exec 9>"$LOCK"
flock -w 600 9 || { echo "Another deploy is still running"; exit 1; }

log() { echo "[$(date '+%F %T')] $*"; }

deploy_backend() {
  cd "$API_DIR"
  local before
  before=$(git rev-parse --short HEAD)
  log "Fetching main (current: $before)"
  GIT_TERMINAL_PROMPT=0 git fetch --quiet origin main
  # .env and other untracked files are left alone by reset --hard.
  git reset --hard --quiet origin/main
  local after
  after=$(git rev-parse --short HEAD)
  log "Now at $after"

  log "Installing dependencies"
  npm ci --omit=dev --no-audit --no-fund

  log "Reloading PM2 app '$PM2_APP'"
  pm2 reload "$PM2_APP" --update-env
  pm2 save --force >/dev/null

  for _ in $(seq 1 20); do
    if curl -fs -o /dev/null "http://127.0.0.1:${API_PORT}/"; then
      log "API is healthy on :$API_PORT ($before -> $after)"
      return 0
    fi
    sleep 2
  done
  log "API did not answer after reload. Recent logs:"
  pm2 logs "$PM2_APP" --lines 60 --nostream || true
  return 1
}

deploy_frontend() {
  local tmp
  tmp=$(mktemp -d /tmp/oxxila-web.XXXXXX)
  trap 'rm -rf "$tmp"' RETURN
  log "Receiving build"
  tar -xzf - -C "$tmp"
  [[ -f "$tmp/index.html" ]] || { log "Upload has no index.html, aborting"; return 1; }

  # Keep a copy of what is live now, for rollback (last 5 kept).
  local stamp
  stamp=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$WEB_BACKUPS"
  if [[ -d "$WEB_DIR" ]]; then
    cp -a "$WEB_DIR" "$WEB_BACKUPS/$stamp"
    ls -1dt "$WEB_BACKUPS"/* | tail -n +6 | xargs -r rm -rf
  fi

  log "Publishing to $WEB_DIR"
  mkdir -p "$WEB_DIR"
  # --delay-updates swaps files in at the end, so visitors rarely see a mixed build.
  rsync -a --delete --delay-updates "$tmp"/ "$WEB_DIR"/
  log "Frontend is live (backup: $WEB_BACKUPS/$stamp)"
}

case "$ACTION" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  *) echo "Usage: oxxila-deploy backend | frontend"; exit 2 ;;
esac
