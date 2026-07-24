# Spec 0039 — Previsão de Caixa (F4)

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-24
- **Relacionada**: 0017 (Cockpit), 0035 (Radar/F2 — comportamento do pagador),
  0009 (assinaturas), 0038 (desconto ativo). Roadmap: `motor-protecao-receita.md` (**F4**).

## 1. Problema / Motivação

O Cockpit mostra o **agora** e a Lista do Dia mostra **o que fazer**. Falta o **futuro**:
*quanto entra e quando*. O dono voa às cegas para planejar (pagar fornecedor, pró-labore).
E uma média cega ("some tudo que vence") mente: quem sempre atrasa **não** paga no dia.
Precisamos projetar com **confiança**, usando o comportamento de **cada** pagador.

## 2. Objetivo

Projetar a **entrada de caixa dos próximos 30 dias** (por semana), com duas linhas:
- **Esperado** (bruto): o que está agendado — faturas em aberto que vencem na janela +
  faturas que as **assinaturas ativas vão gerar** na janela (com desconto ativo aplicado).
- **Provável** (ajustado): o esperado **ponderado pela chance de pagar** de cada cliente
  (faixa do Radar/F2 + atraso médio). É o número em que o dono pode confiar.

E um **total** com **% de confiança** (provável ÷ esperado).

**Fora de escopo (v1):** previsão por ML/série temporal; considerar sazonalidade;
recebíveis de gateway em processamento; projeção além de 30 dias.

## 3. Regras de negócio

- **RN-3901** — Janela padrão **30 dias**, em **baldes semanais** (7 dias). `now`/`days` injetáveis.
- **RN-3902** — **Esperado** por balde = Σ dos valores com `dueDate` no balde. Fontes:
  (a) faturas **em aberto** (PENDING/OVERDUE) com `dueDate < now+dias`; (b) **assinaturas
  ATIVAS** cuja `nextRunDate` cai na janela (valor já com **desconto ativo**, spec 0038).
  Sem duplicar: a geração futura ainda **não** virou fatura (nextRunDate é a próxima).
- **RN-3903** — **Vencidas** (`dueDate < now`) entram no **1º balde** (dinheiro que já
  deveria ter entrado; conta com probabilidade **reduzida**).
- **RN-3904** — **Provável** = Σ `valor × payProbability`. `payProbability` (0..1) é por
  **regra transparente**: base pela faixa (healthy 0.95 / watch 0.75 / at_risk 0.45 /
  sem score 0.8) × fator de atraso (decai com o atraso médio do cliente, satura em ~60d).
- **RN-3905** — **Confiança** global = `provável ÷ esperado` (0 se esperado 0).
- **RN-3906** — Só leitura, escopo por tenant. Projeção é **função pura testável**.

## 4. Impacto no modelo de dados

**Nenhuma migração.** Combina `Invoice` (aberta) + `Subscription` (ativa, com desconto) +
`Client.health` (F2). Materializar só se performance exigir (follow-up).

## 5. Contrato de API

```
GET /api/cockpit/forecast?days=30   (JWT) → {
  geradoEm, dias,
  total: { esperado, provavel, confianca },   // confianca 0..1
  baldes: [{ de, ate, label, esperado, provavel }]
}
```

## 6. Fluxo

`GET /api/cockpit/forecast` → `ForecastService.getForTenant(now, days)`:
1. Lê faturas em aberto (até `now+dias`) e assinaturas ativas (nextRunDate na janela),
   cada uma com faixa de saúde + atraso médio do cliente (do Radar/F2).
2. `projectCashflow(items, now, days)` (domínio puro): distribui em baldes semanais,
   calcula esperado/provável por balde e o total/confiança.

## 7. Camadas afetadas

- [ ] Domínio — `src/domain/cashflow.ts`: `projectCashflow(items, now, days)` + `payProbability` (puras, testadas).
- [ ] Repository — `forecast.repository.ts`: inputs (faturas + assinaturas + saúde do cliente).
- [ ] Service — `forecast.service.ts`: `getForTenant(now, days)`.
- [ ] Controller/Router — `GET /api/cockpit/forecast`.
- [ ] Frontend — bloco "Previsão de caixa" no Dashboard (baldes semanais + total + confiança).
- [ ] Testes — buckets por semana; vencidas no 1º; probabilidade por faixa/atraso; confiança.
- [ ] Contexto — `domain-model.md` / marcar F4 no roadmap.

## 8. Critérios de aceite

- [ ] Projeta 30 dias em 4–5 baldes semanais com esperado e provável.
- [ ] Cliente `at_risk`/atrasador reduz o provável (não é média cega).
- [ ] Vencidas entram no 1º balde. Confiança = provável ÷ esperado.
- [ ] Assinatura ativa que vai gerar na janela entra no esperado (com desconto). Suíte verde.

## 9. Notas de implementação

_(preencher: ML/sazonalidade como follow-up; incluir recebíveis do gateway quando houver
webhook de status; alargar janela configurável.)_
