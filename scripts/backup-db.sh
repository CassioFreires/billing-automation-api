#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — dump diário do Postgres (comprimido) com rotação.
#
# O que faz:
#   1. Roda pg_dump DENTRO do container do Postgres (não precisa de client no host).
#   2. Comprime com gzip e salva em ~/billing-backups (FORA do repo).
#   3. Valida que o arquivo não saiu vazio.
#   4. Rotaciona: mantém os KEEP dumps mais recentes, apaga o resto.
#
# Uso manual (na VM):
#   ./scripts/backup-db.sh
#
# Agendar no cron (diário às 03:00) — ver instruções no fim deste arquivo.
#
# --- RESTAURAR um backup (quando precisar) -----------------------------------
#   # descompacta e injeta no banco (CUIDADO: sobrescreve dados):
#   gunzip -c ~/billing-backups/ARQUIVO.sql.gz | \
#     docker compose -f docker-compose.free.yml exec -T postgres \
#     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
# =============================================================================
set -euo pipefail

# Cron tem PATH mínimo; garante docker/gzip acessíveis.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.free.yml}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/billing-backups}"
KEEP="${KEEP:-14}"   # quantos dumps manter (14 dias)

# Credenciais/DB vêm do .env (mesmo do compose).
[ -f .env ] || { echo "✖ .env não encontrado em $REPO_ROOT" >&2; exit 1; }
set -a; . ./.env; set +a
PG_USER="${POSTGRES_USER:-postgres}"
PG_DB="${POSTGRES_DB:-billing_db}"

if docker compose version >/dev/null 2>&1; then
  dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
else
  dc() { docker-compose -f "$COMPOSE_FILE" "$@"; }
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${PG_DB}-${STAMP}.sql.gz"

echo "▶ Gerando backup de '$PG_DB'…"
dc exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" | gzip > "$OUT"

# Falha se o dump saiu vazio (ex.: container fora do ar).
if [ ! -s "$OUT" ]; then
  echo "✖ Backup vazio — algo deu errado. Removendo $OUT" >&2
  rm -f "$OUT"
  exit 1
fi
echo "✔ Backup OK: $OUT ($(du -h "$OUT" | cut -f1))"

# Rotação LOCAL: mantém os KEEP mais recentes desse banco.
ls -1t "$BACKUP_DIR/${PG_DB}"-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "✔ Rotação: mantendo os $KEEP backups mais recentes em $BACKUP_DIR"

# ---------------------------------------------------------------------------
# Envio OFF-SITE (S3-compatível). Portável: roda o aws-cli em CONTAINER, então
# não precisa instalar nada no host — funciona em qualquer VPS com Docker.
#   - AWS S3 (agora): BACKUP_S3_ENDPOINT vazio + AWS_DEFAULT_REGION da sua região.
#   - Cloudflare R2 (depois): BACKUP_S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com
#                             + AWS_DEFAULT_REGION=auto. MESMO script.
# Ative definindo BACKUP_S3_BUCKET no .env. Sem isso, fica só o backup local.
# ---------------------------------------------------------------------------
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  PREFIX="${BACKUP_S3_PREFIX:-backups}"
  ENDPOINT_ARG=""
  [ -n "${BACKUP_S3_ENDPOINT:-}" ] && ENDPOINT_ARG="--endpoint-url ${BACKUP_S3_ENDPOINT}"

  echo "▶ Enviando off-site para s3://${BACKUP_S3_BUCKET}/${PREFIX}/ …"
  if docker run --rm \
      -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
      -e AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-2}" \
      -v "$BACKUP_DIR:/backups:ro" \
      amazon/aws-cli s3 cp "/backups/$(basename "$OUT")" \
      "s3://${BACKUP_S3_BUCKET}/${PREFIX}/$(basename "$OUT")" $ENDPOINT_ARG; then
    echo "✔ Off-site OK"
  else
    # Não falha o script: o backup LOCAL já está salvo; o off-site é redundância.
    echo "⚠ Falha no envio off-site (backup local mantido). Verifique credenciais/bucket." >&2
  fi
else
  echo "ℹ Off-site desativado (defina BACKUP_S3_BUCKET no .env para ativar)."
fi

# =============================================================================
# AGENDAR NO CRON (uma vez):
#   crontab -e
# e adicione a linha (backup diário às 03:00, log em billing-backups/backup.log):
#
#   0 3 * * * /home/ec2-user/billing-automation-api/scripts/backup-db.sh >> /home/ec2-user/billing-backups/backup.log 2>&1
# =============================================================================
