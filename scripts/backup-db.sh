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

# Rotação: mantém os KEEP mais recentes desse banco.
ls -1t "$BACKUP_DIR/${PG_DB}"-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "✔ Rotação: mantendo os $KEEP backups mais recentes em $BACKUP_DIR"

# =============================================================================
# AGENDAR NO CRON (uma vez):
#   crontab -e
# e adicione a linha (backup diário às 03:00, log em billing-backups/backup.log):
#
#   0 3 * * * /home/ec2-user/billing-automation-api/scripts/backup-db.sh >> /home/ec2-user/billing-backups/backup.log 2>&1
# =============================================================================
