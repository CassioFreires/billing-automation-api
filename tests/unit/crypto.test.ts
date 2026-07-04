import { describe, it, expect, beforeAll } from 'vitest';

// Chave de teste (32 bytes hex) ANTES de importar o módulo.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { encryptSecret, decryptSecret, isEncrypted } = await import(
  '../../src/infrastructure/crypto.js'
);

describe('crypto (segredos em repouso, D-17)', () => {
  it('roundtrip: cifra e decifra de volta ao original', () => {
    const secret = 'EAAG-token-super-secreto-123';
    const enc = encryptSecret(secret);

    expect(enc).not.toBe(secret);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('duas cifras do mesmo texto são diferentes (IV aleatório)', () => {
    const a = encryptSecret('mesmo');
    const b = encryptSecret('mesmo');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('mesmo');
    expect(decryptSecret(b)).toBe('mesmo');
  });

  it('decifra é tolerante a legado: texto puro (sem prefixo) passa direto', () => {
    expect(isEncrypted('token-antigo-em-texto')).toBe(false);
    expect(decryptSecret('token-antigo-em-texto')).toBe('token-antigo-em-texto');
  });

  it('detecta adulteração (GCM auth tag) ao decifrar', () => {
    const enc = encryptSecret('valor');
    // corrompe o último caractere do payload base64
    const tampered = enc.slice(0, -2) + (enc.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
