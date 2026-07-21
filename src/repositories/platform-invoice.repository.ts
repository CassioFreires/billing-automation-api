import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { nextPeriodEnd } from '../domain/plans.js';

/**
 * Cobranças da PLATAFORMA (spec 0020). A confirmação de pagamento é idempotente
 * e ATÔMICA: marca a PlatformInvoice como paga E ativa/renova a assinatura na
 * MESMA transação (espelha invoice.repository.applyWebhookAtomic). Idempotência
 * pela própria PlatformInvoice (só transiciona PENDING→PAID uma vez).
 */
export class PlatformInvoiceRepository {
  /** Cria uma cobrança pendente (tenant atual). */
  async create(data: {
    plan: string;
    amountCents: number;
    period: string;
    gatewayId: string;
    checkoutUrl?: string | null;
    pixCopyPaste?: string | null;
  }) {
    return prisma.platformInvoice.create({
      data: {
        tenantId: requireTenantId(),
        plan: data.plan,
        amountCents: data.amountCents,
        period: data.period,
        gatewayId: data.gatewayId,
        checkoutUrl: data.checkoutUrl ?? null,
        pixCopyPaste: data.pixCopyPaste ?? null,
      },
    });
  }

  /** Localiza pela referência do gateway (GLOBAL — webhook sem contexto). */
  async findByGatewayId(gatewayId: string) {
    return prisma.platformInvoice.findUnique({ where: { gatewayId } });
  }

  /** Faturas de plataforma do tenant atual (tela). */
  async listByTenant() {
    return prisma.platformInvoice.findMany({
      where: { tenantId: requireTenantId() },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Confirma o pagamento e ATIVA/RENOVA a assinatura, atômico e idempotente.
   * Retorna { duplicate } — duplicate=true quando a cobrança já estava paga.
   */
  async confirmPaidAtomic(params: { invoiceId: string; tenantId: string; plan: string; paidAt?: Date }) {
    return prisma.$transaction(async (tx) => {
      const inv = await tx.platformInvoice.findUnique({ where: { id: params.invoiceId } });
      if (!inv || inv.status === 'PAID') {
        return { duplicate: true };
      }

      const paidAt = params.paidAt ?? new Date();
      await tx.platformInvoice.update({
        where: { id: params.invoiceId },
        data: { status: 'PAID', paidAt },
      });

      // Ativa/renova a assinatura: plano do pagamento, período +1 mês.
      await tx.platformSubscription.update({
        where: { tenantId: params.tenantId },
        data: {
          plan: params.plan,
          status: 'active',
          currentPeriodEnd: nextPeriodEnd(paidAt),
        },
      });

      return { duplicate: false };
    });
  }
}
