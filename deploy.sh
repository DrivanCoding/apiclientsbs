#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

APP_NAME="${APP_NAME:-apiclient-test}"
APP_PORT="${APP_PORT:-3206}"
APP_DOMAIN="${APP_DOMAIN:-apiclientteste.mifide.com}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_DELAY_SECONDS="${HEALTH_DELAY_SECONDS:-2}"
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_HEALTH_URL="http://127.0.0.1:${APP_PORT}/"
PUBLIC_HEALTH_URL="https://${APP_DOMAIN}/"
BACKUP_DIR=""
PROCESS_EXISTED=0

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERREUR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Commande requise introuvable: $1"
}

read_env_value() {
  local key="$1"
  awk -F= -v wanted="$key" '
    /^[[:space:]]*#/ { next }
    {
      current=$1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", current)
      if (current == wanted) {
        value=substr($0, index($0, "=") + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        print value
      }
    }
  ' .env | tail -n 1
}

validate_configuration() {
  [[ -f .env ]] || fail "Fichier .env absent dans ${PROJECT_DIR}"

  local configured_port
  configured_port="$(read_env_value PORT)"
  if [[ -n "$configured_port" && "$configured_port" != "$APP_PORT" ]]; then
    fail ".env contient PORT=${configured_port}, mais ce deploiement utilise le port ${APP_PORT}"
  fi

  local configured_node_env
  configured_node_env="$(read_env_value NODE_ENV | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$configured_node_env" && "$configured_node_env" != "production" ]]; then
    fail ".env contient NODE_ENV=${configured_node_env}; la version PM2 doit utiliser production"
  fi

  local payment_provider
  payment_provider="$(read_env_value MYAPIOPERATOR | tr '[:upper:]' '[:lower:]')"
  if [[ "$payment_provider" == "paynote" ]]; then
    local webhook_secret webhook_url orange_webhook_url mtn_webhook_url
    webhook_secret="$(read_env_value PAYNOTE_WEBHOOK_SECRET)"
    webhook_url="$(read_env_value PAYNOTE_NOTIF_URL)"

    [[ -n "$webhook_secret" ]] || fail "PAYNOTE_WEBHOOK_SECRET est obligatoire lorsque Paynote est actif"
    if [[ -n "$webhook_url" ]]; then
      [[ "$webhook_url" == "https://${APP_DOMAIN}/api/paynote/webhook"* ]] ||
        fail "PAYNOTE_NOTIF_URL doit utiliser https://${APP_DOMAIN}/api/paynote/webhook"
    else
      orange_webhook_url="$(read_env_value PAYNOTE_ORANGE_NOTIF_URL)"
      mtn_webhook_url="$(read_env_value PAYNOTE_MTN_NOTIF_URL)"
      [[ "$orange_webhook_url" == "https://${APP_DOMAIN}/api/paynote/webhook"* ]] ||
        fail "PAYNOTE_ORANGE_NOTIF_URL doit utiliser https://${APP_DOMAIN}/api/paynote/webhook"
      [[ "$mtn_webhook_url" == "https://${APP_DOMAIN}/api/paynote/webhook"* ]] ||
        fail "PAYNOTE_MTN_NOTIF_URL doit utiliser https://${APP_DOMAIN}/api/paynote/webhook"
    fi
  fi
}

wait_for_health() {
  local attempt
  for ((attempt = 1; attempt <= HEALTH_RETRIES; attempt++)); do
    if curl --silent --show-error --fail --max-time 10 "$LOCAL_HEALTH_URL" >/dev/null; then
      return 0
    fi
    log "Service pas encore pret (${attempt}/${HEALTH_RETRIES})"
    sleep "$HEALTH_DELAY_SECONDS"
  done
  return 1
}

rollback_runtime() {
  log "Echec du controle local, restauration de la version precedente"
  if [[ "$PROCESS_EXISTED" -eq 1 && -n "$BACKUP_DIR" && -d "$BACKUP_DIR/dist" ]]; then
    [[ "$PROJECT_DIR" != "/" ]] || fail "Chemin projet invalide pour la restauration"
    rm -rf -- "$PROJECT_DIR/dist"
    cp -a -- "$BACKUP_DIR/dist" "$PROJECT_DIR/dist"
    PORT="$APP_PORT" NODE_ENV=production pm2 reload "$APP_NAME" --update-env
  else
    pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  fi
}

main() {
  cd "$PROJECT_DIR"

  require_command node
  require_command npm
  require_command pm2
  require_command curl
  require_command awk
  require_command tail
  require_command tr
  require_command mktemp
  require_command npx
  if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
    require_command git
  fi

  if command -v flock >/dev/null 2>&1; then
    exec 9>"${TMPDIR:-/tmp}/${APP_NAME}.deploy.lock"
    flock -n 9 || fail "Un autre deploiement ${APP_NAME} est deja en cours"
  fi

  validate_configuration

  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    PROCESS_EXISTED=1
  fi

  BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${APP_NAME}.deploy.XXXXXX")"
  trap 'rm -rf -- "$BACKUP_DIR"' EXIT
  if [[ -d dist ]]; then
    cp -a -- dist "$BACKUP_DIR/dist"
  fi

  if [[ "${SKIP_GIT_PULL:-0}" != "1" ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if ! git diff --quiet || ! git diff --cached --quiet; then
      fail "Le depot contient des modifications suivies non validees; deploiement annule"
    fi
    log "Mise a jour de la branche ${DEPLOY_BRANCH}"
    git fetch --prune origin "$DEPLOY_BRANCH"
    git merge --ff-only "origin/${DEPLOY_BRANCH}"
  fi

  log "Installation reproductible des dependances"
  npm ci --no-audit --no-fund

  if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
    log "Execution des tests"
    npm test -- --runInBand --forceExit
  fi

  log "Compilation de l API"
  npm run build

  log "Application des migrations"
  npx typeorm migration:run -d dist/data-source.js

  export PORT="$APP_PORT"
  export NODE_ENV=production

  if [[ "$PROCESS_EXISTED" -eq 1 ]]; then
    log "Rechargement PM2 sans interruption: ${APP_NAME}"
    pm2 reload "$APP_NAME" --update-env
  else
    log "Demarrage du processus PM2: ${APP_NAME}"
    pm2 start "$PROJECT_DIR/dist/main.js" \
      --name "$APP_NAME" \
      --cwd "$PROJECT_DIR" \
      --time
  fi

  if ! wait_for_health; then
    pm2 logs "$APP_NAME" --lines 80 --nostream || true
    rollback_runtime
    fail "Le service ne repond pas sur ${LOCAL_HEALTH_URL}"
  fi

  pm2 save
  log "Controle local reussi: ${LOCAL_HEALTH_URL}"

  if [[ "${SKIP_PUBLIC_CHECK:-0}" != "1" ]]; then
    if curl --silent --show-error --fail --max-time 15 "$PUBLIC_HEALTH_URL" >/dev/null; then
      log "Controle public reussi: ${PUBLIC_HEALTH_URL}"
    else
      log "ATTENTION: le service local fonctionne, mais ${PUBLIC_HEALTH_URL} ne repond pas. Verifiez Nginx, DNS et TLS."
    fi
  fi

  log "Deploiement termine. Processus PM2=${APP_NAME}, port=${APP_PORT}, domaine=${APP_DOMAIN}"
}

main "$@"
