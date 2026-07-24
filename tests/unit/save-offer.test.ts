import { describe, it, expect } from 'vitest';
import {
  decideSaveOffer,
  applyDiscount,
  isDiscountActive,
  addMonths,
} from '../../src/domain/save-offer.js';

describe('decideSaveOffer (spec 0037 — retenção no cancelamento)', () => {
  it('preço → desconto (cliente saudável)', () => {
    expect(decideSaveOffer('preco', 'healthy').offer).toBe('discount');
  });

  it('preço + at_risk → pausar (não queima margem com quem já está de saída)', () => {
    expect(decideSaveOffer('preco', 'at_risk').offer).toBe('pause');
  });

  it('não uso → pausar', () => {
    expect(decideSaveOffer('nao_uso').offer).toBe('pause');
  });

  it('mudança → voltar depois (winback)', () => {
    expect(decideSaveOffer('mudanca').offer).toBe('winback_later');
  });

  it('insatisfação → downgrade', () => {
    expect(decideSaveOffer('insatisfacao').offer).toBe('downgrade');
  });

  it('motivo desconhecido/ausente → pausar (default seguro)', () => {
    expect(decideSaveOffer('outro').offer).toBe('pause');
    expect(decideSaveOffer(null).offer).toBe('pause');
    expect(decideSaveOffer(undefined).offer).toBe('pause');
  });

  it('sempre acompanha uma mensagem para mostrar ao cliente', () => {
    const d = decideSaveOffer('nao_uso');
    expect(d.message).toContain('pausar');
  });
});

describe('desconto de retenção (spec 0038 — funções puras)', () => {
  it('applyDiscount aplica o percentual com 2 casas', () => {
    expect(applyDiscount(100, 30)).toBe(70);
    expect(applyDiscount(99.9, 10)).toBe(89.91);
  });

  it('applyDiscount ignora percentual inválido (sem desconto)', () => {
    expect(applyDiscount(100, 0)).toBe(100);
    expect(applyDiscount(100, null)).toBe(100);
    expect(applyDiscount(100, 150)).toBe(100);
    expect(applyDiscount(100, -5)).toBe(100);
  });

  it('isDiscountActive respeita a validade (competência dentro da janela)', () => {
    const until = new Date('2026-09-30T00:00:00Z');
    expect(isDiscountActive(until, new Date('2026-08-10T00:00:00Z'))).toBe(true);
    expect(isDiscountActive(until, new Date('2026-10-10T00:00:00Z'))).toBe(false);
    expect(isDiscountActive(null, new Date())).toBe(false);
  });

  it('addMonths soma meses sem mutar a base', () => {
    const base = new Date('2026-07-24T00:00:00Z');
    const out = addMonths(base, 2);
    expect(out.getUTCMonth()).toBe(8); // setembro (0-based)
    expect(base.getUTCMonth()).toBe(6); // base intacta (julho)
  });
});
