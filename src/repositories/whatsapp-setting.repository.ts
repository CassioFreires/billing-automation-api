import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { encryptSecret, decryptSecret } from '../infrastructure/crypto.js';

/** Cifra o token quando é uma string não-vazia; mantém null/undefined. */
function encToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return encryptSecret(token);
}

/** Acesso à config de WhatsApp do tenant (spec 0014). Escopo por tenant. */
export class WhatsappSettingRepository {
  async findByTenant() {
    const s = await prisma.whatsappSetting.findUnique({
      where: { tenantId: requireTenantId() },
    });
    // Token é cifrado em repouso (D-17): decifra ao ler (tolerante a legado).
    if (s?.token) {
      return { ...s, token: decryptSecret(s.token) };
    }
    return s;
  }

  /**
   * Cria/atualiza a config do tenant. Quando `token` vem `undefined`, NÃO
   * sobrescreve o token existente (permite salvar sem reenviar o segredo).
   * O token é CIFRADO antes de persistir.
   */
  async upsert(data: {
    provider: string;
    phoneNumberId?: string | null;
    token?: string | null;
    apiVersion?: string | null;
  }) {
    const tenantId = requireTenantId();

    const base = {
      provider: data.provider,
      phoneNumberId: data.phoneNumberId ?? null,
      apiVersion: data.apiVersion ?? null,
    };

    // token: só entra no update quando enviado (não apaga o salvo sem querer).
    const tokenUpdate = data.token !== undefined ? { token: encToken(data.token) } : {};

    return prisma.whatsappSetting.upsert({
      where: { tenantId },
      update: { ...base, ...tokenUpdate },
      create: { tenantId, ...base, token: encToken(data.token) },
    });
  }
}
