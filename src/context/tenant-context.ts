import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de tenant por request/mensagem (multi-tenancy — spec 0001).
 *
 * O `tenantId` é definido uma vez (middleware `jwtAuth` na API; payload da
 * fila no worker) e lido pelos repositórios via `getTenantId()`/`requireTenantId()`,
 * sem precisar propagar o id por todas as assinaturas de método.
 */

interface TenantStore {
  tenantId: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/** Executa `fn` com o tenant no contexto. Tudo dentro de `fn` (inclusive async) enxerga o tenant. */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/** Retorna o tenant atual, ou `undefined` fora de um contexto. */
export function getTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

/** Retorna o tenant atual ou lança — use em operações que exigem escopo. */
export function requireTenantId(): string {
  const tenantId = getTenantId();
  if (!tenantId) {
    throw new Error('TENANT_CONTEXT_MISSING');
  }
  return tenantId;
}
