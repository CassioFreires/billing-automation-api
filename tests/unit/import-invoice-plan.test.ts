import { describe, it, expect } from 'vitest';
import { planInvoiceImport } from '../../src/utils/import-invoice-plan.js';

const row = (clientPhone: string, value = 100) => ({
  clientPhone,
  value,
  dueDate: new Date('2026-08-01'),
  description: 'Mensalidade',
});

describe('planInvoiceImport (spec 0024)', () => {
  it('separa linhas com cliente conhecido das desconhecidas', () => {
    const map = new Map([
      ['5511999990000', 'c1'],
      ['5511999991111', 'c2'],
    ]);
    const rows = [row('5511999990000'), row('5511000000000'), row('5511999991111')];

    const plan = planInvoiceImport(rows, map);

    expect(plan.toCreate.map((p) => p.clientId)).toEqual(['c1', 'c2']);
    expect(plan.erros).toHaveLength(1);
    expect(plan.erros[0]).toMatchObject({ linha: 2, clientPhone: '5511000000000' });
  });

  it('reporta a linha 1-based e mantém o índice para o service', () => {
    const map = new Map([['5511999990000', 'c1']]);
    const plan = planInvoiceImport([row('desconhecido'), row('5511999990000')], map);
    expect(plan.erros[0].linha).toBe(1);
    expect(plan.toCreate[0].index).toBe(1);
  });

  it('lote todo desconhecido → nada a criar', () => {
    const plan = planInvoiceImport([row('x'), row('y')], new Map());
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.erros).toHaveLength(2);
  });
});
