import { describe, it, expect } from 'vitest';
import { decideSaveOffer } from '../../src/domain/save-offer.js';

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
