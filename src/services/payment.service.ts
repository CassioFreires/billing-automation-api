import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { PaymentRepository } from '../repositories/payment.repository.js';
import { RecoveryCaseRepository } from '../repositories/recovery-case.repository.js';
import { HealthService } from './health.service.js';
import { RegisterManualPaymentDTO } from '../dtos/payment.dto.js';
import { canTransitionInvoice, InvoiceStatus } from '../domain/status.js';

/** Erros de domínio — o controller mapeia para 404/409. */
export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export class PaymentService {
  private invoices: InvoiceRepository;
  private payments: PaymentRepository;
  private recovery: RecoveryCaseRepository;
  private health: HealthService;

  constructor(deps?: {
    invoices?: InvoiceRepository;
    payments?: PaymentRepository;
    recovery?: RecoveryCaseRepository;
    health?: HealthService;
  }) {
    this.invoices = deps?.invoices ?? new InvoiceRepository();
    this.payments = deps?.payments ?? new PaymentRepository();
    this.recovery = deps?.recovery ?? new RecoveryCaseRepository();
    this.health = deps?.health ?? new HealthService();
  }

  /**
   * Baixa manual (spec 0015): registra o Payment e quita a fatura (v1 = total).
   * - 404 se a fatura não existe no tenant.
   * - 409 se a fatura não aceita a baixa (ex.: já PAID — máquina de estados).
   */
  async registerManual(invoiceId: string, dto: RegisterManualPaymentDTO) {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Fatura não encontrada.');
    }
    // Já paga: canTransition(PAID, PAID) é no-op permitido (idempotência), mas
    // uma NOVA baixa manual sobre fatura paga é conflito (evita pagamento duplo).
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictError('Fatura já está paga.');
    }
    if (!canTransitionInvoice(invoice.status, InvoiceStatus.PAID)) {
      throw new ConflictError('Fatura em estado que não aceita baixa manual.');
    }

    const amount = dto.amount ?? invoice.value; // RN-REC5: default = valor da fatura
    const paidAt = dto.paidAt ?? new Date();

    const settled = await this.invoices.settleManually({
      invoiceId,
      amount,
      method: dto.method,
      paidAt,
      note: dto.note,
      receiptUrl: dto.receiptUrl,
    });

    // Fatura quitada por baixa manual → fecha o caso de recuperação, se houver
    // (spec 0033, RN-3306). Best-effort e idempotente.
    await this.recovery.closeByInvoiceId(invoiceId, 'paid').catch(() => {});

    // Radar de Risco (spec 0035, RN-3505a): a baixa recalcula a saúde do cliente.
    const inv = invoice as { clientId?: string; tenantId?: string };
    if (inv.clientId && inv.tenantId) {
      await this.health.recomputeForClient(inv.clientId, inv.tenantId).catch(() => {});
    }

    return settled;
  }

  /** Lista os pagamentos de uma fatura (escopo tenant). 404 se a fatura não existe. */
  async listByInvoice(invoiceId: string) {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Fatura não encontrada.');
    }
    return this.payments.findByInvoice(invoiceId);
  }
}
