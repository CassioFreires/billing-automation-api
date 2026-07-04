import { describe, it, expect } from 'vitest';
import { planImport } from '../../src/utils/import-plan.js';

const row = (phone: string, name = 'X', document = '11111111111', status?: any) => ({
  phone,
  name,
  document,
  ...(status ? { status } : {}),
});

describe('planImport', () => {
  it('separa criar vs atualizar pelo conjunto de telefones existentes', () => {
    const rows = [row('111', 'Ana'), row('222', 'Bruno'), row('333', 'Ciro')];
    const existing = new Set(['222']); // só o 222 já existe

    const plan = planImport(rows, existing);

    expect(plan.toCreate.map((r) => r.phone)).toEqual(['111', '333']);
    expect(plan.toUpdate.map((r) => r.phone)).toEqual(['222']);
    expect(plan.ignorados).toBe(0);
  });

  it('deduplica no lote mantendo a ÚLTIMA ocorrência e conta ignorados', () => {
    const rows = [row('111', 'Primeiro'), row('111', 'Ultimo'), row('222', 'Bruno')];

    const plan = planImport(rows, new Set());

    expect(plan.ignorados).toBe(1); // uma duplicata de '111'
    expect(plan.toCreate).toHaveLength(2);
    const p111 = plan.toCreate.find((r) => r.phone === '111');
    expect(p111?.name).toBe('Ultimo'); // última vence
  });

  it('duplicata de um telefone existente vira 1 update (não cria)', () => {
    const rows = [row('999', 'A'), row('999', 'B')];
    const plan = planImport(rows, new Set(['999']));

    expect(plan.ignorados).toBe(1);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].name).toBe('B');
  });

  it('lote vazio → tudo zero', () => {
    const plan = planImport([], new Set());
    expect(plan).toEqual({ toCreate: [], toUpdate: [], ignorados: 0 });
  });
});
