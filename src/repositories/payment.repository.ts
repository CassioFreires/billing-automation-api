import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Leitura de pagamentos (spec 0015). Escopo por tenant.
 * Os WRITES que precisam ser atômicos com o status da fatura (baixa manual e
 * pagamento de gateway) ficam em `InvoiceRepository` — dentro da mesma
 * transação da fatura (`settleManually` / `applyWebhookAtomic`).
 */
export class PaymentRepository {
  async findByInvoice(invoiceId: string) {
    return prisma.payment.findMany({
      where: { invoiceId, tenantId: requireTenantId() },
      orderBy: { paidAt: 'desc' },
    });
  }
}
