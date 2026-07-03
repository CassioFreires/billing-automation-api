#!/usr/bin/env bash
#
# Disparo diário da cobrança recorrente (spec 0010).
#
# Chama o endpoint de sistema que faz o fan-out da geração de faturas para
# TODOS os tenants. Autentica por segredo (x-cron-secret) — não precisa logar
# como nenhum tenant. Ideal para o cron do Linux; consome ~0 de RAM.
#
# Uso no cron (exemplo: todo dia às 08:00):
#   0 8 * * * CRON_SECRET=xxxx /caminho/scripts/run-daily-billing.sh >> /var/log/billing-cron.log 2>&1
#
# Variáveis:
#   BASE_URL     (opcional) default http://localhost:3000
#   CRON_SECRET  (obrigatório) o mesmo valor de CRON_SECRET no .env da API
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERRO: CRON_SECRET não definido." >&2
  exit 1
fi

# Dispara um endpoint de sistema e loga o resultado. $1 = caminho, $2 = rótulo.
run_step() {
  local path="$1"
  local label="$2"
  local out="/tmp/system-run.out"

  echo "$(date '+%Y-%m-%d %H:%M:%S') ${label}: POST ${BASE_URL}${path} ..."
  local http_code
  http_code=$(curl -sS -o "$out" -w '%{http_code}' \
    -X POST "${BASE_URL}${path}" \
    -H "x-cron-secret: ${CRON_SECRET}")
  local body
  body=$(cat "$out" 2>/dev/null || true)

  if [ "$http_code" = "202" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') OK (202): ${body}"
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') FALHOU (HTTP ${http_code}): ${body}" >&2
    return 1
  fi
}

# 1) Gera as faturas recorrentes (assinaturas vencidas).
run_step "/api/system/billing/run" "Cobrança recorrente"

# 2) Enfileira as notificações dos vencidos (envio roda no worker).
run_step "/api/system/notifications/run" "Notificações de vencidos"
