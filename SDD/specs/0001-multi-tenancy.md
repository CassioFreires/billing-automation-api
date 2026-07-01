# Spec 0001 — Multi-tenancy (isolamento por cliente/conta)

- **Status**: Rascunho
- **Autor**: —
- **Data**: 2026-07-01
- **Roadmap**: PR-04 (e habilita PR-05) em `context/production-readiness.md`
- **Dívida relacionada**: D-16 (auth por conta de serviço única)

## 1. Problema / Motivação

Hoje a aplicação é **mono-tenant**: todos os `Client` e `Invoice` vivem num único espaço plano. Para vender como SaaS, cada negócio contratante (tenant) precisa enxergar e operar **apenas os próprios dados**. Sem isolamento não é possível onboard de múltiplos clientes com segurança — e retrofitar isolamento depois de já haver dados de produção é caro e arriscado.

## 2. Objetivo

Introduzir o conceito de **conta (tenant)** e garantir que **todo dado de negócio pertença a um tenant** e **toda leitura/escrita seja escopada** por ele.

**Fora de escopo** (specs próprias depois):
- Modelo completo de `User`/login/papéis (PR-05) — esta spec cria o gancho (`tenantId` no token), mas o CRUD de usuários fica para outra spec.
- Billing/planos/quotas por tenant (PR-16).
- Onboarding self-service / signup (PR-17).

## 3. Regras de negócio

- **RN-T1**: Todo `Client` e `Invoice` pertence a exatamente um `Account` (`tenantId` obrigatório).
- **RN-T2**: Toda consulta e escrita nos repositórios é **obrigatoriamente filtrada por `tenantId`**. Nunca há acesso cross-tenant.
- **RN-T3**: A unicidade que hoje é global passa a ser **por tenant**: `Client.phone` é único **dentro do tenant** (dois tenants podem ter o mesmo telefone).
- **RN-T4**: O `tenantId` vem do **contexto autenticado** (claim do JWT), nunca do corpo/params da requisição — o cliente não escolhe o tenant.
- **RN-T5**: O worker, ao processar a fila, opera no tenant da mensagem (o `tenantId` viaja no payload enfileirado).
- **RN-T6**: O webhook do gateway resolve o tenant pela fatura (`gatewayId` → `Invoice.tenantId`), não por header de tenant.

## 4. Impacto no modelo de dados

Nova entidade e coluna discriminadora (abordagem **shared-DB / shared-schema / coluna `tenantId`** — ver §10):

```prisma
model Account {
  id        String   @id @default(uuid())
  name      String
  status    String   @default("ACTIVE") // ACTIVE, SUSPENDED
  createdAt DateTime @default(now())
  clients   Client[]
  invoices  Invoice[]
}

model Client {
  // ...campos atuais...
  tenantId  String
  account   Account @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, phone])   // era @unique global em phone
  @@index([tenantId, status])
}

model Invoice {
  // ...campos atuais...
  tenantId  String
  account   Account @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, status])
  @@index([tenantId, clientId])
}
```

**Migração de dados existentes**: criar um `Account` "default", preencher `tenantId` de todos os registros atuais com o id dele, e só então tornar a coluna `NOT NULL` e trocar os índices de unicidade. Fazer em passos (add nullable → backfill → not null → drop old unique → add composite unique).

## 5. Contrato de API

- **Resolução do tenant**: o `AuthService.login` passa a incluir `tenantId` no JWT. O middleware `jwtAuth` extrai `req.auth.tenantId` e o disponibiliza no contexto da request.
- **Nenhuma rota interna recebe `tenantId` no body/params** (RN-T4). Payloads de criação continuam iguais; o `tenantId` é injetado pela camada de serviço a partir do contexto.
- **Webhook** permanece sem tenant no header (RN-T6): resolve pela fatura.

Exemplo (inalterado para o cliente, tenant implícito):
```
POST /api/clients
Authorization: Bearer <jwt com tenantId>
{ "name": "...", "phone": "...", "document": "..." }   // sem tenantId
```

## 6. Fluxo / Processamento

1. Login → JWT assinado com `{ sub, role, tenantId }`.
2. `jwtAuth` valida e injeta o tenant no contexto da request (ex.: `req.auth.tenantId`).
3. Controller repassa o `tenantId` ao service; service repassa ao repository.
4. Repository **sempre** inclui `where: { tenantId }` (idealmente forçado — ver §10).
5. Ao enfileirar notificação, o payload inclui `tenantId` (RN-T5); o worker usa-o nas escritas.
6. Webhook: encontra a `Invoice` por `gatewayId`, deriva o `tenantId` dela e opera nesse escopo.

## 7. Camadas afetadas

- [ ] Schema Prisma / migration — `Account`, `tenantId`, índices/unicidade compostos
- [ ] DTO — nenhum campo novo exposto (tenant é implícito)
- [ ] Auth — `login` inclui `tenantId` no JWT; `jwtAuth` expõe no contexto
- [ ] Repositories — **todos** passam a exigir/aplicar `tenantId`
- [ ] Services — propagam o `tenantId` do contexto
- [ ] Controllers — repassam `req.auth.tenantId`
- [ ] Messaging — `tenantId` no payload da fila; worker consome com escopo
- [ ] Testes — cobrir isolamento (um tenant não lê dados de outro)

## 8. Critérios de aceite

- [ ] Criar `Client` autenticado como tenant A → não aparece em nenhuma listagem do tenant B.
- [ ] `Client.phone` pode repetir entre tenants distintos, mas não dentro do mesmo (RN-T3).
- [ ] Nenhum endpoint aceita `tenantId` vindo do cliente (RN-T4).
- [ ] Faturas em atraso, disparo de cobrança e webhook operam sempre no tenant correto.
- [ ] Teste automatizado prova que uma consulta sem `tenantId` é impossível/rejeitada.
- [ ] Migração aplica-se sobre dados existentes sem perda (backfill no Account default).

## 9. Riscos / considerações

- **Vazamento cross-tenant**: o maior risco. Um único repositório que esqueça o `where tenantId` expõe dados de outro cliente. Mitigar com mecanismo que **force** o filtro (ver §10), não confiar em disciplina manual.
- **Migração**: mudança de `@unique(phone)` para `@@unique([tenantId, phone])` exige backfill antes; se houver telefones duplicados hoje, resolver antes.
- **Performance**: índices passam a ser compostos com `tenantId` na frente — revisar as queries quentes (`findPendingInvoices`).
- **Cache Redis**: chaves de cache (`pending-invoices:*`) precisam incluir o `tenantId` para não misturar tenants.

## 10. Notas de implementação

- **Modelo recomendado**: *shared database, shared schema, coluna `tenantId`*. É o mais simples e barato para o estágio atual; migração para schema-por-tenant/DB-por-tenant só se algum cliente exigir isolamento físico.
- **Forçar o escopo (reduzir risco de RN-T2)**: usar **Prisma Client Extensions** (`$extends` com `query` hooks) para injetar `tenantId` automaticamente nas operations dos models `Client`/`Invoice`, a partir de um contexto de request (AsyncLocalStorage). Alternativa de defesa em profundidade: **Row-Level Security (RLS)** no Postgres com `SET app.tenant_id`.
- **Contexto de request**: `AsyncLocalStorage` para carregar o `tenantId` do JWT sem ter que passá-lo manualmente por todas as assinaturas.
- **Ordem de implementação** (ver `skills/db-migration.md` e `skills/add-feature.md`): migration em passos → contexto/AsyncLocalStorage → auth inclui `tenantId` → extension do Prisma → ajustar repositórios/serviços → payload da fila → cache por tenant → testes de isolamento.
- **Follow-up**: esta spec assume um tenant por token. Usuário pertencer a múltiplos tenants (troca de conta) fica para a spec de `User` (PR-05).
