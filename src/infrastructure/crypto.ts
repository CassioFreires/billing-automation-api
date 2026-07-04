import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Cifra de segredos em repouso (D-17). AES-256-GCM (autenticado: detecta
 * adulteração). Usado para tokens por tenant (WhatsApp, futuro MP) que hoje
 * ficavam em texto puro no banco.
 *
 * Formato guardado: `enc:v1:<base64(iv|authTag|ciphertext)>`.
 * O prefixo versionado permite:
 *   - saber se um valor está cifrado (rollout tolerante a legado);
 *   - evoluir o esquema no futuro (v2...).
 *
 * Chave: `ENCRYPTION_KEY` no .env — 64 hex (32 bytes) é o ideal
 * (`openssl rand -hex 32`); qualquer outra string é derivada via SHA-256.
 */
const PREFIX = 'enc:v1:';
const IV_LEN = 12; // GCM recomenda 96 bits
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY não configurada — necessária para cifrar segredos por tenant.'
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  // Fallback: deriva 32 bytes de qualquer passphrase.
  return createHash('sha256').update(raw).digest();
}

/** true se o valor já está cifrado (tem o prefixo de versão). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decifra um valor. TOLERANTE A LEGADO: se o valor não tem o prefixo (texto
 * puro salvo antes da cifra), devolve como está — assim o rollout não quebra
 * tokens antigos (que são recifrados no próximo save).
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);

  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
