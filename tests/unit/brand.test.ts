import { describe, it, expect } from 'vitest';
import { normalizeBrandColor, BrandValidationError } from '../../src/domain/brand.js';

describe('brand domain (spec 0050 — white-label)', () => {
  it('normaliza #rrggbb (com e sem #, maiúsculas)', () => {
    expect(normalizeBrandColor('#14A08A')).toBe('#14a08a');
    expect(normalizeBrandColor('14a08a')).toBe('#14a08a');
    expect(normalizeBrandColor('  #1F4E6B  ')).toBe('#1f4e6b');
  });

  it('expande #rgb → #rrggbb', () => {
    expect(normalizeBrandColor('#0a5')).toBe('#00aa55');
    expect(normalizeBrandColor('f00')).toBe('#ff0000');
  });

  it('rejeita valor inválido', () => {
    expect(() => normalizeBrandColor('verde')).toThrow(BrandValidationError);
    expect(() => normalizeBrandColor('#12')).toThrow(BrandValidationError);
    expect(() => normalizeBrandColor('#1234z6')).toThrow(BrandValidationError);
  });
});
