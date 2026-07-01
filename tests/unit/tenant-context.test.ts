import { describe, it, expect } from 'vitest';
import {
  runWithTenant,
  getTenantId,
  requireTenantId,
} from '../../src/context/tenant-context.js';

describe('tenant-context', () => {
  it('getTenantId retorna undefined fora de contexto', () => {
    expect(getTenantId()).toBeUndefined();
  });

  it('requireTenantId lança fora de contexto', () => {
    expect(() => requireTenantId()).toThrow('TENANT_CONTEXT_MISSING');
  });

  it('expõe o tenant dentro de runWithTenant', () => {
    runWithTenant('t1', () => {
      expect(getTenantId()).toBe('t1');
      expect(requireTenantId()).toBe('t1');
    });
  });

  it('propaga o tenant através de await', async () => {
    await runWithTenant('t2', async () => {
      await Promise.resolve();
      expect(getTenantId()).toBe('t2');
    });
  });

  it('isola tenants entre contextos aninhados', () => {
    runWithTenant('outer', () => {
      expect(getTenantId()).toBe('outer');
      runWithTenant('inner', () => {
        expect(getTenantId()).toBe('inner');
      });
      expect(getTenantId()).toBe('outer');
    });
  });
});
