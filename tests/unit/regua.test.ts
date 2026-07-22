import { describe, it, expect } from 'vitest';
import { selectDueStep, daysFromDue, applyTemplate } from '../../src/domain/regua.js';

describe('regua.daysFromDue', () => {
  it('conta dias desde o vencimento (negativo se ainda vai vencer)', () => {
    expect(daysFromDue(new Date('2026-08-10T12:00:00Z'), new Date('2026-08-07T12:00:00Z'))).toBe(3);
    expect(daysFromDue(new Date('2026-08-05T12:00:00Z'), new Date('2026-08-08T12:00:00Z'))).toBe(-3);
    expect(daysFromDue(new Date('2026-08-08T12:00:00Z'), new Date('2026-08-08T12:00:00Z'))).toBe(0);
  });
});

describe('regua.selectDueStep', () => {
  const offsets = [-3, 0, 3, 7];

  it('envia o próximo passo quando já é devido', () => {
    // nenhum enviado, já venceu há 5 dias → próximo é o passo 1 (offset -3)
    expect(selectDueStep(offsets, 5, 0)).toBe(1);
    // passo 1 já enviado → próximo é o 2 (offset 0), devido em d>=0
    expect(selectDueStep(offsets, 5, 1)).toBe(2);
    expect(selectDueStep(offsets, 3, 2)).toBe(3); // offset 3 devido em d=3
  });

  it('não envia se o offset do próximo passo ainda não chegou', () => {
    expect(selectDueStep(offsets, -5, 0)).toBeNull(); // faltam 5 dias, offset -3 não chegou
    expect(selectDueStep(offsets, 3, 3)).toBeNull(); // próximo é offset 7, d=3
  });

  it('retorna null quando todos os passos já foram enviados', () => {
    expect(selectDueStep(offsets, 30, 4)).toBeNull();
  });
});

describe('regua.applyTemplate', () => {
  it('substitui {nome} e {valor}', () => {
    expect(applyTemplate('Oi {nome}, deve {valor}', { nome: 'Ana', valor: 89.9 })).toBe(
      'Oi Ana, deve R$ 89.90'
    );
  });

  it('é case-insensitive e global', () => {
    expect(applyTemplate('{NOME} {nome}', { nome: 'X', valor: 0 })).toBe('X X');
  });
});
