import { describe, it, expect } from 'vitest';
import { mapProviderStatus, canTransitionFiscal, canCancelFiscal, validateEmission, FiscalValidationError } from '../../src/domain/fiscal.js';

describe('fiscal domain (spec 0047 — F7)', () => {
  it('mapProviderStatus mapeia o enum da NFE.io', () => {
    expect(mapProviderStatus('Issued')).toBe('issued');
    expect(mapProviderStatus('Cancelled')).toBe('cancelled');
    expect(mapProviderStatus('Error')).toBe('error');
    expect(mapProviderStatus('Created')).toBe('processing');
    expect(mapProviderStatus('None')).toBe('processing');
    expect(mapProviderStatus(undefined)).toBe('processing');
  });

  it('canTransitionFiscal: emitida só vai pra cancelada; erro/cancelada são terminais', () => {
    expect(canTransitionFiscal('processing', 'issued')).toBe(true);
    expect(canTransitionFiscal('processing', 'error')).toBe(true);
    expect(canTransitionFiscal('issued', 'cancelled')).toBe(true);
    expect(canTransitionFiscal('issued', 'processing')).toBe(false); // não desemite
    expect(canTransitionFiscal('cancelled', 'issued')).toBe(false);
    expect(canTransitionFiscal('error', 'issued')).toBe(false);
    expect(canTransitionFiscal('issued', 'issued')).toBe(true); // idempotente
  });

  it('canCancelFiscal só permite cancelar nota emitida', () => {
    expect(canCancelFiscal('issued')).toBe(true);
    expect(canCancelFiscal('processing')).toBe(false);
    expect(canCancelFiscal('cancelled')).toBe(false);
  });

  it('validateEmission aceita CPF (11) e CNPJ (14) e exige os campos', () => {
    const ok = { borrowerName: 'Fulano', borrowerDocument: '123.456.789-00', amount: 100, description: 'Consultoria', cityServiceCode: '10677' };
    expect(() => validateEmission(ok)).not.toThrow();
    expect(() => validateEmission({ ...ok, borrowerDocument: '12345678000199' })).not.toThrow();
  });

  it('validateEmission rejeita documento, valor, código ou descrição inválidos', () => {
    const base = { borrowerName: 'F', borrowerDocument: '12345678900', amount: 100, description: 'x', cityServiceCode: '10677' };
    expect(() => validateEmission({ ...base, borrowerDocument: '123' })).toThrow(FiscalValidationError);
    expect(() => validateEmission({ ...base, borrowerName: '' })).toThrow(FiscalValidationError);
    expect(() => validateEmission({ ...base, amount: 0 })).toThrow(FiscalValidationError);
    expect(() => validateEmission({ ...base, cityServiceCode: '' })).toThrow(FiscalValidationError);
    expect(() => validateEmission({ ...base, description: '' })).toThrow(FiscalValidationError);
  });
});
