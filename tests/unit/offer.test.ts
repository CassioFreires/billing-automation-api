import { describe, it, expect } from 'vitest';
import { normalizeOffer, buildAddonCharge, OfferValidationError, MAX_OFFER_PRICE_CENTS } from '../../src/domain/offer.js';

describe('normalizeOffer (spec 0044 — F15)', () => {
  it('normaliza nome (trim) e assume active=true e type=addon por padrão', () => {
    const o = normalizeOffer({ name: '  Personal 1x  ', priceCents: 6000, type: 'addon' });
    expect(o).toEqual({ name: 'Personal 1x', priceCents: 6000, type: 'addon', active: true });
  });

  it('arredonda priceCents para inteiro', () => {
    expect(normalizeOffer({ name: 'Extra', priceCents: 6000.6, type: 'addon' }).priceCents).toBe(6001);
  });

  it('rejeita nome curto', () => {
    expect(() => normalizeOffer({ name: 'A', priceCents: 100, type: 'addon' })).toThrow(OfferValidationError);
  });

  it('rejeita preço zero ou negativo', () => {
    expect(() => normalizeOffer({ name: 'Valido', priceCents: 0, type: 'addon' })).toThrow(OfferValidationError);
    expect(() => normalizeOffer({ name: 'Valido', priceCents: -5, type: 'addon' })).toThrow(OfferValidationError);
  });

  it('rejeita preço acima do teto', () => {
    expect(() => normalizeOffer({ name: 'Valido', priceCents: MAX_OFFER_PRICE_CENTS + 1, type: 'addon' })).toThrow(OfferValidationError);
  });

  it('rejeita tipo inválido', () => {
    expect(() => normalizeOffer({ name: 'Valido', priceCents: 100, type: 'xpto' })).toThrow(OfferValidationError);
  });

  it('respeita active=false explícito', () => {
    expect(normalizeOffer({ name: 'Valido', priceCents: 100, type: 'upgrade', active: false }).active).toBe(false);
  });
});

describe('buildAddonCharge (spec 0044 — F15)', () => {
  it('converte centavos para reais e vence hoje', () => {
    const now = new Date('2026-07-24T12:00:00Z');
    const c = buildAddonCharge({ name: 'Personal', priceCents: 6000 }, now);
    expect(c.value).toBe(60);
    expect(c.description).toBe('Personal');
    expect(c.dueDate).toBe(now);
  });
});
