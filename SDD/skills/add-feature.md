# Playbook: Criar uma Feature End-to-End

Use quando uma nova capacidade cruza várias camadas (rota → controller → service → repositório, e possivelmente worker/fila).

## Antes de começar

1. **Escreva a spec.** Copie `SDD/specs/_TEMPLATE.md` → `SDD/specs/NNNN-nome.md` e preencha objetivo, regras e critérios de aceite.
2. Releia `context/architecture.md`, `context/domain-model.md` e `context/conventions.md`.
3. Verifique em `context/tech-debt.md` se a área que vai tocar tem dívida relevante.

## Ordem de implementação (de dentro para fora)

Implemente da camada mais interna para a externa — cada camada é testável antes da próxima.

### 1. Modelo de dados (se necessário)
- Alterou entidade/campo? Siga `skills/db-migration.md`.
- Atualize `context/domain-model.md` (campos, estados, regras RN-*).

### 2. DTO / validação
- Crie `src/dtos/<ação><Entidade>.dto.ts` usando **Zod** (padrão preferido):
  ```ts
  import { z } from 'zod';
  export const xSchema = z.object({ /* campos */ });
  export type XDTO = z.infer<typeof xSchema>;
  ```

### 3. Repository
- Adicione o método em `src/repositories/<domínio>.repository.ts`.
- **Único lugar** que fala com o Prisma. Se a leitura for cacheável, siga o padrão de `findPendingInvoices` (chave, TTL, invalidação).

### 4. Service
- Regra de negócio em `src/services/<domínio>.service.ts`.
- Sem `req`/`res`, sem Prisma direto. Lança `Error` com mensagem clara em erros de negócio.
- Se a feature for assíncrona, enfileire via `publishRabbitMql` (ver `add-worker-consumer.md`).

### 5. Controller
- `src/controllers/<domínio>.controller.ts`. ✅ Preferir **arrow function como propriedade** (dispensa `.bind`).
- Valida com o DTO, chama o service, mapeia erros → status HTTP (ver tabela em `conventions.md`).

### 6. Router
- Registre a rota em `src/routers/<domínio>.router.ts`.
- Se for um domínio novo, plugue o router no agregador `appRouter` (hoje em `dist/index.js` — ver dívida **D-01**).

## Depois de implementar

1. **Testes**: escreva testes da regra de negócio (ver `skills/testing.md`) e rode `npm test`.
2. **Build**: `npm run build` — não pode haver erro de TS.
3. **Rodar e testar manualmente**: siga `skills/run-and-debug.md` e exercite o fluxo com `curl`/Insomnia.
4. **Atualizar contexto**: reflita a feature em `overview.md` (tabela de capacidades) e no que mais mudou.
5. **Marcar a spec** como implementada e listar o que ficou de fora.

## Checklist de conclusão

- [ ] Spec escrita e critérios de aceite atendidos
- [ ] Imports internos com extensão `.js`
- [ ] Validação via Zod
- [ ] Sem regra de negócio no controller / sem Prisma fora do repository
- [ ] Testes cobrindo a regra (feliz + erro) — `npm test` verde
- [ ] `npm run build` limpo
- [ ] Testado manualmente (fluxo feliz + erro)
- [ ] `SDD/context/` atualizado
- [ ] Sem `console.log` de depuração esquecido
