# Playbook: Testes (Vitest)

O projeto usa **Vitest** (ESM/TS nativo, sem passo de build para testar). Config em `vitest.config.ts`; testes em `tests/**/*.test.ts`.

```bash
npm test         # roda tudo uma vez
npm run test:watch
npx vitest run tests/unit/auth.service.test.ts   # um arquivo
```

## O que já existe

`tests/unit/` cobre a **lógica de negócio pura**, sem infra:
- **Services** (`clients`, `invoice`, `notification`) — regras (RN-*) com o repositório **mockado**.
- **Auth** — `AuthService.login`/`register` e middleware `jwtAuth`.
- **Gateway de pagamento** — `MockPaymentGateway`, mapeamento de status do MP e assinatura do webhook (`fetch` mockado via `vi.stubGlobal`).
- **DTOs** — schemas Zod (aceite/recusa).

## Padrões deste projeto

### 1. Import do fonte com extensão `.js`
Igual ao código: `import { X } from '../../src/services/x.service.js'`. O Vitest resolve para o `.ts`.

### 2. Mockar o repositório de um service (mock por classe)
Os services fazem `new XRepository()` no construtor. Mocke o **módulo** com uma **classe** (sempre é construtor válido) e exponha `vi.fn()` criados via `vi.hoisted`:

```ts
const mocks = vi.hoisted(() => ({ findById: vi.fn(), create: vi.fn() }));

vi.mock('../../src/repositories/x.repository.js', () => ({
  XRepository: class {
    findById = mocks.findById;
    create = mocks.create;
  },
}));

const { XService } = await import('../../src/services/x.service.js');

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});
```
> ⚠️ Evite `vi.fn(() => ({...}))` como construtor — no Vitest 4 dá "is not a constructor". Use `class`.

### 3. Config lida no import (auth)
`auth.config.ts` captura `process.env` **no import**. Para testar variações, defina o env e recarregue o módulo:
```ts
vi.resetModules();
process.env.JWT_SECRET = 'test';
const { AuthService } = await import('../../src/services/auth.service.js');
```

### 4. Middlewares Express
Fabrique `req`/`res` fake e um `next` espião:
```ts
const res: any = {};
res.status = vi.fn(() => res);
res.json = vi.fn(() => res);
const next = vi.fn();
mw({ headers: {} } as any, res, next);
expect(next).toHaveBeenCalledOnce();
```

## Ao adicionar uma feature (ver `add-feature.md`)
Escreva pelo menos:
- 1 teste por **regra de negócio** no service (caminho feliz + erro).
- Validação do **DTO** novo.
- Se mexeu em auth/rota protegida, cubra 401/permissão.

## Follow-ups (não cobertos ainda)
- **Repositórios**: precisam de um Postgres de teste (ex.: testcontainers) — hoje o Prisma não é exercido.
- **E2E dos fluxos A–D**: subir a app + broker + banco e bater nos endpoints com token. Candidato a um `tests/e2e/` futuro.
