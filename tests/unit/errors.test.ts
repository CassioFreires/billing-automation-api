import { describe, it, expect } from 'vitest';
import { PermanentError, shouldRequeue } from '../../src/infrastructure/errors.js';

describe('classificação de erro do worker (shouldRequeue)', () => {
  it('erro permanente NÃO recoloca na fila (vai direto p/ DLQ)', () => {
    expect(shouldRequeue(new PermanentError('payload inválido'))).toBe(false);
  });

  it('erro comum é transitório → recoloca (retry limitado)', () => {
    expect(shouldRequeue(new Error('timeout de rede'))).toBe(true);
    expect(shouldRequeue('string solta')).toBe(true);
    expect(shouldRequeue(undefined)).toBe(true);
  });

  it('PermanentError tem name e message corretos', () => {
    const e = new PermanentError('malformado');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('PermanentError');
    expect(e.message).toBe('malformado');
  });
});
