import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

export interface WinbackSettingsView {
  enabled: boolean;
  daysAfter: number;
  discountPercent: number;
  message: string | null;
}

/**
 * Winback / reativação (spec 0045, F5). Config da campanha + casos de retorno
 * (1 por assinatura cancelada). Escopo por tenant.
 */
export class WinbackRepository {
  async getSettings(): Promise<WinbackSettingsView> {
    const s = await prisma.winbackSetting.findUnique({ where: { tenantId: requireTenantId() } });
    return {
      enabled: s?.enabled ?? false,
      daysAfter: s?.daysAfter ?? 15,
      discountPercent: s?.discountPercent ?? 10,
      message: s?.message ?? null,
    };
  }

  async upsertSettings(data: { enabled?: boolean; daysAfter?: number; discountPercent?: number; message?: string | null }) {
    const tenantId = requireTenantId();
    const s = await prisma.winbackSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: { ...data },
    });
    return { enabled: s.enabled, daysAfter: s.daysAfter, discountPercent: s.discountPercent, message: s.message };
  }

  /** Assinaturas CANCELADAS que ainda não têm caso de winback (para inscrever). */
  async findCanceledSubsWithoutCase() {
    return prisma.subscription.findMany({
      where: { tenantId: requireTenantId(), status: 'CANCELED', winbackCase: { is: null } },
      select: { id: true, clientId: true },
    });
  }

  async createCase(data: { subscriptionId: string; clientId: string; eligibleAt: Date }) {
    return prisma.winbackCase.create({ data: { ...data, tenantId: requireTenantId(), status: 'pending' } });
  }

  /** Casos pendentes cuja janela já venceu (eligibleAt <= cutoff), com dados p/ cobrar+avisar. */
  async findDueCases(cutoff: Date) {
    return prisma.winbackCase.findMany({
      where: { tenantId: requireTenantId(), status: 'pending', eligibleAt: { lte: cutoff } },
      include: {
        subscription: { select: { amount: true, description: true } },
        client: { select: { name: true, phone: true, document: true } },
      },
    });
  }

  /**
   * CLAIM atômico do caso antes de cobrar (spec 0054): flipa pending→sending de forma
   * condicional. Só quem vence (count===1) gera a cobrança — evita cobrança dupla por
   * sweeps concorrentes ou replay do cron.
   */
  async claimForSending(caseId: string): Promise<boolean> {
    const r = await prisma.winbackCase.updateMany({
      where: { id: caseId, tenantId: requireTenantId(), status: 'pending' },
      data: { status: 'sending' },
    });
    return r.count === 1;
  }

  /** Devolve o caso a pending quando a cobrança NÃO chegou a ser criada (retry amanhã). */
  async revertToPending(caseId: string) {
    await prisma.winbackCase.updateMany({
      where: { id: caseId, tenantId: requireTenantId(), status: 'sending' },
      data: { status: 'pending' },
    });
  }

  async markSent(caseId: string, invoiceId: string, sentAt: Date) {
    return prisma.winbackCase.update({ where: { id: caseId }, data: { status: 'sent', invoiceId, sentAt } });
  }

  async markSkipped(caseId: string) {
    return prisma.winbackCase.update({ where: { id: caseId }, data: { status: 'skipped' } });
  }

  /** Resumo para o painel: pendentes, enviados e reativados (fatura de retorno PAGA). */
  async summary() {
    const rows = await prisma.winbackCase.findMany({
      where: { tenantId: requireTenantId() },
      select: { status: true, invoice: { select: { status: true } } },
    });
    let pending = 0;
    let sent = 0;
    let reactivated = 0;
    for (const r of rows) {
      if (r.status === 'pending') pending++;
      else if (r.status === 'sent') sent++;
      if (r.invoice?.status === 'PAID') reactivated++;
    }
    return { total: rows.length, pending, sent, reactivated };
  }
}
