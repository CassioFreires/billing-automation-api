import { describe, it, expect } from 'vitest';
import {
  ADDON_MODULES,
  isModuleKey,
  planDefaultModules,
  resolveModules,
  hasModule,
  describeModules,
} from '../../src/domain/modules.js';

describe('modules domain (spec 0051 — modularização)', () => {
  it('reconhece só as 4 chaves de add-on', () => {
    for (const k of ADDON_MODULES) expect(isModuleKey(k)).toBe(true);
    expect(isModuleKey('nucleo')).toBe(false);
    expect(isModuleKey('')).toBe(false);
    expect(isModuleKey(undefined)).toBe(false);
  });

  it('default do plano: pro tem todos; free/essencial não têm add-on', () => {
    expect(planDefaultModules('pro')).toEqual(ADDON_MODULES);
    expect(planDefaultModules('free')).toEqual([]);
    expect(planDefaultModules('essencial')).toEqual([]);
  });

  it('sem grants: módulos efetivos = default do plano', () => {
    expect(resolveModules('pro', [])).toEqual(ADDON_MODULES);
    expect(resolveModules('free', [])).toEqual([]);
  });

  it('grant explícito libera add-on num plano que não daria (à la carte)', () => {
    const mods = resolveModules('free', [{ moduleKey: 'fiscal', granted: true }]);
    expect(mods).toEqual(['fiscal']);
    expect(hasModule('fiscal', 'free', [{ moduleKey: 'fiscal', granted: true }])).toBe(true);
    expect(hasModule('growth', 'free', [{ moduleKey: 'fiscal', granted: true }])).toBe(false);
  });

  it('grant granted=false revoga um add-on que o plano daria', () => {
    const mods = resolveModules('pro', [{ moduleKey: 'fiscal', granted: false }]);
    expect(mods).not.toContain('fiscal');
    expect(mods).toContain('growth');
  });

  it('ignora grants de chave inválida', () => {
    expect(resolveModules('free', [{ moduleKey: 'foo', granted: true }])).toEqual([]);
  });

  it('describeModules marca a origem (plan vs grant)', () => {
    const desc = describeModules('free', [{ moduleKey: 'fiscal', granted: true }]);
    const fiscal = desc.find((d) => d.key === 'fiscal')!;
    const growth = desc.find((d) => d.key === 'growth')!;
    expect(fiscal).toMatchObject({ granted: true, source: 'grant' });
    expect(growth).toMatchObject({ granted: false, source: 'plan' });
    expect(desc).toHaveLength(4);
  });
});
