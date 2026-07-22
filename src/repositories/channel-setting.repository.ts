import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { NotifyChannel } from '../domain/channels.js';

/** Acesso ao canal de envio do tenant (spec 0032). Escopo por tenant. */
export class ChannelSettingRepository {
  async findByTenant() {
    return prisma.channelSetting.findUnique({
      where: { tenantId: requireTenantId() },
    });
  }

  async upsert(data: { channel: NotifyChannel }) {
    const tenantId = requireTenantId();
    return prisma.channelSetting.upsert({
      where: { tenantId },
      update: { channel: data.channel },
      create: { tenantId, channel: data.channel },
    });
  }
}
