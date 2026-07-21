import { describe, it, expect } from 'vitest';
import { validateUpdateOnboarding } from '../../src/dtos/onboarding.dto.js';

describe('onboarding DTO (spec 0021)', () => {
  it('aceita dismiss', () => {
    expect(validateUpdateOnboarding({ dismiss: true }).dismiss).toBe(true);
  });

  it('aceita skipWhatsapp', () => {
    expect(validateUpdateOnboarding({ skipWhatsapp: true }).skipWhatsapp).toBe(true);
  });

  it('aceita ambos', () => {
    const dto = validateUpdateOnboarding({ dismiss: false, skipWhatsapp: true });
    expect(dto.dismiss).toBe(false);
    expect(dto.skipWhatsapp).toBe(true);
  });

  it('rejeita corpo vazio', () => {
    expect(() => validateUpdateOnboarding({})).toThrow();
  });
});
