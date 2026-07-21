import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { encryptSecret, decryptSecret } from '../infrastructure/crypto.js';

type Credentials = Record<string, string | undefined>;

/** Decifra o blob de credenciais (tolerante a legado/null). */
function decodeCredentials(enc: string | null | undefined): Credentials {
  if (!enc) return {};
  try {
    return JSON.parse(decryptSecret(enc)) as Credentials;
  } catch {
    return {};
  }
}

/** Acesso à configuração de pagamento do tenant (spec 0012 + 0019). Escopo por tenant. */
export class PaymentSettingRepository {
  /** Config do tenant com as credenciais JÁ DECIFRADAS (`credentials`). */
  async findByTenant() {
    const s = await prisma.paymentSetting.findUnique({
      where: { tenantId: requireTenantId() },
    });
    if (!s) return null;
    return { ...s, credentials: decodeCredentials(s.credentialsEnc) };
  }

  /**
   * Cria/atualiza a config do tenant. Os segredos são CIFRADOS antes de
   * persistir. Regras de credenciais:
   *  - campo em branco/ausente ⇒ mantém o já salvo (permite salvar sem reenviar);
   *  - troca de provider ⇒ zera a base (não carrega segredo de outro gateway).
   */
  async upsert(data: {
    provider: string;
    infinitepayHandle?: string | null;
    redirectUrl?: string | null;
    credentials?: Credentials;
  }) {
    const tenantId = requireTenantId();
    const existing = await prisma.paymentSetting.findUnique({ where: { tenantId } });

    // Base: credenciais atuais (se mesmo provider) ou vazio (se trocou de provider).
    const base: Credentials =
      existing && existing.provider === data.provider
        ? decodeCredentials(existing.credentialsEnc)
        : {};

    // Overlay: só os campos enviados NÃO-vazios sobrescrevem.
    const incoming = data.credentials ?? {};
    for (const [k, v] of Object.entries(incoming)) {
      if (typeof v === 'string' && v.trim().length > 0) base[k] = v.trim();
    }

    const credentialsEnc =
      Object.keys(base).length > 0 ? encryptSecret(JSON.stringify(base)) : null;

    const fields = {
      provider: data.provider,
      infinitepayHandle: data.infinitepayHandle ?? null,
      redirectUrl: data.redirectUrl ?? null,
      credentialsEnc,
    };

    return prisma.paymentSetting.upsert({
      where: { tenantId },
      update: fields,
      create: { tenantId, ...fields },
    });
  }
}
