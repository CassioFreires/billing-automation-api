# Spec 0008 — Importação de clientes em lote (upsert por telefone)

- **Status**: Implementada
- **Autor**: Cassio
- **Data**: 2026-07-03
- **Relacionada**: assistente de importação CSV no frontend (próximo passo), estratégia de ingestão de dados (anti-corruption layer)

## 1. Problema / Motivação

O onboarding de um novo tenant hoje é 100% manual (cadastro cliente a cliente). Quem já tem uma base (planilha de Excel/CSV, export de outro sistema) não tem como trazê-la para a plataforma sem digitar tudo de novo. Isso é fricção de entrada — o cliente precisa ver valor rápido.

Precisamos de uma porta de entrada em lote que seja **idempotente**: reimportar a mesma planilha (corrigida ou não) não pode duplicar clientes.

## 2. Objetivo

Um endpoint que recebe um array de clientes e faz **upsert por telefone** dentro do tenant, retornando quantos foram criados, atualizados e ignorados.

- `POST /api/clients/import` — importa/atualiza em lote.

É a base de tudo: o assistente CSV do frontend (Item 4) e a sincronização via n8n consomem este mesmo endpoint.

**Fora de escopo:** parsing de arquivo (CSV/XLSX) no backend — o frontend/n8n manda JSON já normalizado; mapeamento de colunas (é responsabilidade do cliente que chama).

## 3. Regras de negócio

- RN-C3: A chave de idempotência é o **telefone** (`@@unique([tenantId, phone])`, RN-T3). Telefone já existente → **atualiza** (name/document/status); novo → **cria**.
- RN-C4: Duplicatas de telefone **dentro do mesmo lote** são resolvidas mantendo a **última** ocorrência; as anteriores contam como `ignorados`.
- RN-C5: `status` é opcional por linha; ausente → default do banco (`EM_DIA`) na criação, e **não sobrescreve** o status atual na atualização.
- RN-C6: Lote de 1 a 1000 linhas; fora disso → `400`. Qualquer linha inválida (Zod) → `400` e **nada** é gravado (validação antes da transação).
- RN-C7: Isolamento por tenant garantido por `requireTenantId()` — importa sempre no tenant do token.

## 4. Impacto no modelo de dados

Nenhum. Usa o schema `Client` existente e o índice único `@@unique([tenantId, phone])`.

## 5. Contrato de API

```
POST /api/clients/import                              (JWT)
Body: {
  clients: [
    { name: "Ana Souza", phone: "11999999999", document: "12345678901" },
    { name: "Bia Lima",  phone: "11888888888", document: "98765432100", status: "EM_ATRASO" }
  ]
}
Response: 200 { criados: number, atualizados: number, ignorados: number }
          400 { error }   (lote vazio/grande, linha inválida)
```

Ordem de rotas: `/import` (literal) **antes** de `/:id` (paramétrica), senão cairia no handler de `findById`.

## 6. Fluxo / Processamento

controller (`validateImportClients`) → service (`import`) → repository (`importUpsert`):
1. Dedup interno do lote por telefone (última ocorrência vence; conta `ignorados`).
2. Uma única `prisma.$transaction` interativa: para cada telefone, `findUnique` por `tenantId_phone` → `update` (atualizados++) ou `create` (criados++).
3. Retorna `{ criados, atualizados, ignorados }`.

Transação garante atomicidade: se uma linha falhar no meio, nada é persistido.

## 7. Camadas afetadas

- [x] DTO — `importClients.dto.ts` (`importClientsSchema`, `validateImportClients`)
- [x] Repository — `importUpsert` (dedup + transação upsert por telefone)
- [x] Service — `ClientService.import`
- [x] Controller — `ClientController.import`
- [x] Router — `POST /import` (antes de `/:id`)
- [x] Testes — service (delegação) + DTO (validações)

## 8. Critérios de aceite

- [x] `POST /api/clients/import` com telefones novos → todos em `criados`.
- [x] Reimportar o mesmo lote → todos em `atualizados` (idempotência).
- [x] Telefone repetido no lote → conta em `ignorados`, grava a última ocorrência.
- [x] Lote vazio ou > 1000 → 400.
- [x] Linha com documento/telefone/nome inválido → 400 (nada gravado).
- [x] `status` ausente não zera o status atual na atualização.

## 9. Riscos / considerações

- **Performance**: até 1000 upserts sequenciais numa transação. Para o free tier e o caso de uso (onboarding) é aceitável; se virar gargalo, dá para paralelizar em chunks ou usar `createMany` + `updateMany` segmentado.
- **Idempotência por telefone**: se o cliente tiver dois contatos com o mesmo telefone reais, eles colapsam num só — é o trade-off aceito (telefone é a identidade do devedor no WhatsApp).

## 10. Notas de implementação

Implementado em 2026-07-03. O parsing/mapeamento de CSV fica no frontend (Item 4 do checklist) — o backend só aceita JSON normalizado, mantendo o endpoint reutilizável por n8n e outras origens.
