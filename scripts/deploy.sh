#!/usr/bin/env bash
# =============================================================================
# deploy.sh — atualização segura do Billing na VM (free tier, docker compose)
#
# O que faz, em ordem, priorizando memória/custo/segurança e MENOR downtime:
#   1. Pré-checagens (docker, compose, .env, git, disco).
#   2. git pull --ff-only (só avança, nunca faz merge/rebase surpresa).
#   3. Build da imagem NOVA com a antiga AINDA no ar (sem derrubar nada).
#   4. Migrations em container efêmero (prisma migrate deploy) — ANTES de trocar a app.
#   5. Recria só api + worker (--no-deps: não toca postgres/rabbit/redis) e espera ficar healthy.
#   6. Health check; se falhar, ROLLBACK automático pra imagem anterior.
#   7. Limpa imagens órfãs (libera disco).
#
# Uso na VM:
#   ./scripts/deploy.sh            # atualiza a partir da branch main
#   FORCE_BUILD=1 ./scripts/deploy.sh   # rebuild mesmo sem mudança de código
#
# NUNCA usa `-v` (não apaga volumes/dados). Segredos vêm do .env (não versionado).
# =============================================================================
set -euo pipefail

# ---- Config (sobrescreva via env: VAR=... ./scripts/deploy.sh) --------------
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.free.yml}"
IMAGE="${IMAGE:-billing-api:latest}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"   # tentativas de health check
HEALTH_DELAY="${HEALTH_DELAY:-3}"        # segundos entre tentativas
FORCE_BUILD="${FORCE_BUILD:-0}"

# ---- Log helpers ------------------------------------------------------------
if [ -t 1 ]; then C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else C_G=; C_Y=; C_R=; C_B=; C_0=; fi
log()  { echo "${C_B}▶ $*${C_0}"; }
ok()   { echo "${C_G}✔ $*${C_0}"; }
warn() { echo "${C_Y}⚠ $*${C_0}"; }
err()  { echo "${C_R}✖ $*${C_0}" >&2; }
die()  { err "$*"; exit 1; }

# ---- Vai pra raiz do repo (funciona de qualquer cwd) ------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Não é um repositório git."
cd "$REPO_ROOT"

# ---- Detecta `docker compose` (v2) vs `docker-compose` (v1) -----------------
if docker compose version >/dev/null 2>&1; then
  dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  dc() { docker-compose -f "$COMPOSE_FILE" "$@"; }
else
  die "Docker Compose não encontrado (nem plugin v2 nem binário v1)."
fi

# ---------------------------------------------------------------------------
# 1) Pré-checagens
# ---------------------------------------------------------------------------
log "Pré-checagens…"
docker info >/dev/null 2>&1 || die "Docker daemon não está rodando (systemctl start docker)."
[ -f "$COMPOSE_FILE" ] || die "Arquivo $COMPOSE_FILE não encontrado na raiz do repo."
[ -f .env ] || die ".env não encontrado. Copie de .env.example e preencha os segredos."

# Aviso de disco baixo (build precisa de espaço; disco cheio derruba tudo)
AVAIL_KB="$(df -Pk . | awk 'NR==2 {print $4}')"
if [ "${AVAIL_KB:-0}" -lt 1572864 ]; then   # < 1.5 GiB livres
  warn "Pouco espaço em disco livre ($((AVAIL_KB/1024)) MiB). O build pode falhar; considere 'docker system prune'."
fi
ok "Ambiente OK."

# Carrega o .env para a interpolação do compose (POSTGRES_*, RABBITMQ_* etc.)
set -a; . ./.env; set +a

# ---------------------------------------------------------------------------
# 2) Atualiza o código (fast-forward apenas)
# ---------------------------------------------------------------------------
log "Atualizando código (branch $BRANCH)…"
BEFORE="$(git rev-parse HEAD)"
git fetch --prune origin "$BRANCH"
git pull --ff-only origin "$BRANCH" || die "git pull --ff-only falhou (há commits locais divergentes?)."
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ] && [ "$FORCE_BUILD" != "1" ]; then
  ok "Já está na versão mais recente ($AFTER). Nada a fazer. (Use FORCE_BUILD=1 para forçar rebuild.)"
  exit 0
fi
[ "$BEFORE" != "$AFTER" ] && ok "Código: ${BEFORE:0:7} → ${AFTER:0:7}" || warn "FORCE_BUILD=1: rebuild sem mudança de código."

# ---------------------------------------------------------------------------
# 3) Build da imagem NOVA (a antiga continua servindo enquanto isso)
#    Guardamos o ID da imagem atual para rollback.
# ---------------------------------------------------------------------------
PREV_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || true)"
log "Construindo imagem $IMAGE (cache de camadas acelera)…"
docker build -t "$IMAGE" . || die "docker build falhou. Nada foi trocado; app antiga segue no ar."
ok "Imagem construída."

# ---------------------------------------------------------------------------
# 4) Migrations em container efêmero, ANTES de trocar a app.
#    Regra de ouro: migrations devem ser aditivas/compatíveis (expand→contract),
#    para a app ANTIGA (ainda no ar) não quebrar enquanto migram.
# ---------------------------------------------------------------------------
log "Aplicando migrations (prisma migrate deploy)…"
if ! dc run --rm migrate; then
  err "Migrations falharam. App antiga segue no ar (não foi trocada)."
  die "Corrija a migration e rode de novo. Nenhum downtime causado."
fi
ok "Migrations aplicadas."

# ---------------------------------------------------------------------------
# 5) Recria api + worker com a imagem nova e garante o caddy no ar.
#    --no-deps: não recria postgres/rabbit/redis (menos churn, menos risco).
#    O `caddy` (reverse proxy/HTTPS) usa imagem própria e não muda a cada
#    deploy — o compose só o recria se a config mudar; senão fica intacto
#    (certificados preservados no volume caddy_data).
#    NÃO usa --wait: o worker não tem healthcheck (não é HTTP) e o --wait
#    falharia por isso. A prontidão real da API é validada pelo curl abaixo.
#    A app tem graceful shutdown (SIGTERM + stop_grace_period 30s): requisições
#    em andamento terminam antes do container sair.
# ---------------------------------------------------------------------------
log "Recriando api + worker (graceful) e garantindo o caddy…"
dc up -d --no-deps api worker caddy || warn "compose up retornou erro; validando via health check…"

# ---------------------------------------------------------------------------
# 6) Health check da API; rollback se não subir saudável.
# ---------------------------------------------------------------------------
log "Verificando saúde em $HEALTH_URL…"
healthy=0
for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
  sleep "$HEALTH_DELAY"
done

if [ "$healthy" != "1" ]; then
  err "API não respondeu saudável após $((HEALTH_RETRIES*HEALTH_DELAY))s."
  if [ -n "$PREV_IMAGE_ID" ]; then
    warn "ROLLBACK: revertendo para a imagem anterior…"
    docker tag "$PREV_IMAGE_ID" "$IMAGE"
    dc up -d --no-deps --wait api worker || true
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      err "Rollback concluído: versão anterior restaurada. Deploy ABORTADO."
    else
      err "Rollback tentado mas a API segue fora. Investigue: dc logs api"
    fi
  else
    err "Sem imagem anterior para rollback. Investigue: dc logs api"
  fi
  echo; dc ps -a
  exit 1
fi
ok "API saudável."

# ---------------------------------------------------------------------------
# 7) Limpeza: remove imagens órfãs (dangling) para liberar disco.
# ---------------------------------------------------------------------------
log "Limpando imagens órfãs…"
docker image prune -f >/dev/null 2>&1 || true
ok "Limpeza feita."

echo
ok "Deploy concluído com sucesso → versão ${AFTER:0:7}"
dc ps
