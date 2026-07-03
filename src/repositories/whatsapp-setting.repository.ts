import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/** Acesso à config de WhatsApp do tenant (spec 0014). Escopo por tenant. */
export class WhatsappSettingRepository {
  async findByTenant() {
    return prisma.whatsappSetting.findUnique({
      where: { tenantId: requireTenantId() },
    });
  }

  /**
   * Cria/atualiza a config do tenant. Quando `token` vem `undefined`, NÃO
   * sobrescreve o token existente (permite salvar sem reenviar o segredo).
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
    const tokenUpdate = data.token !== undefined ? { token: data.token } : {};

    return prisma.whatsappSetting.upsert({
      where: { tenantId },
      update: { ...base, ...tokenUpdate },
      create: { tenantId, ...base, token: data.token ?? null },
    });
  }
}
