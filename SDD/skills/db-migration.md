# Playbook: Alterar Schema e Migrar o Banco (Prisma)

Fonte: `prisma/schema.prisma`. Migrations versionadas em `prisma/migrations/`.

## Fluxo padrão (desenvolvimento)

1. **Editar o schema** em `prisma/schema.prisma` (adicionar campo, índice, modelo, relação).

2. **Criar a migration** (aplica no banco de dev e gera o SQL versionado):
   ```bash
   npx prisma migrate dev --name descricao_curta_da_mudanca
   ```
   Isso também **regenera o Prisma Client** automaticamente.

3. **Se só quiser regenerar o client** (sem migrar):
   ```bash
   npx prisma generate
   ```

4. **Inspecionar o banco** (opcional):
   ```bash
   npx prisma studio
   ```

## Produção / deploy

Nunca use `migrate dev` em produção. Aplique migrations já geradas com:
```bash
npx prisma migrate deploy
```

## Regras e cuidados deste projeto

- **`status` é `String`, não enum** (dívida **D-07**). Se for mexer em status, considere migrar para `enum` do Prisma e centralizar as constantes.
- **`onDelete: Cascade`** em `Invoice.clientId` — apagar cliente apaga faturas. Cuidado ao mudar relações.
- **Índices importam para performance**: `findPendingInvoices` depende de `@@index([status, clientId])`. Ao criar consultas novas com filtro, avalie adicionar índice.
- **Campos únicos**: `Client.phone` e `Invoice.gatewayId`. Migrations que introduzem `@unique` falham se já houver duplicatas — limpe os dados antes.

## Depois da migration

1. Atualize `SDD/context/domain-model.md` (tabela de campos, estados, regras).
2. Ajuste DTOs (Zod) e repositórios afetados.
3. `npm run build` e teste os fluxos que tocam a entidade alterada.
4. Commit **junto** o `schema.prisma` + a pasta nova em `prisma/migrations/`.

## Reset local (destrutivo — só em dev)

Apaga e recria o banco de desenvolvimento:
```bash
npx prisma migrate reset
```
⚠️ Perde todos os dados locais. Nunca em produção.
