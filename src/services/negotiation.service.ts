import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { AgreementRepository } from '../repositories/agreement.repository.js';
import { InteractionEventRepository } from '../repositories/interaction-event.repository.js';
import { NegotiationSettingService } from './negotiation-setting.service.js';
import { PaymentSettingService } from './payment-setting.service.js';
import {
  PaymentGatewayProvider,
  resolvePaymentGatewayForTenant,
} from '../apis/payment/index.js';
import { runWithTenant } from '../context/tenant-context.js';
import { InteractionType, isHesitating } from '../domain/interaction.js';
import {
  computeOptions,
  computeTerms,
  agreementDescription,
  isReliefEligibleStatus,
  AgreementType,
} from '../domain/negotiation.js';
import { AcceptAgreementDTO } from '../dtos/acceptAgreement.dto.js';

/** Erros de fluxo mapeados para HTTP no controller. */
export const NegotiationError = {
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND', // → 404
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',           // → 409 (fatura paga/renegociada / alívio off)
} as const;

/**
 * Autonegociação (spec 0018 — M2, "Botão de Alívio de Caixa").
 * Rotas PÚBLICAS resolvem o tenant pela FATURA (linkToken, RN-NEG7) e rodam a
 * lógica dentro de `runWithTenant`, para os repositórios enxergarem o escopo.
 */
export class NegotiationService {
  private invoiceRepository: InvoiceRepository;
  private agreements: AgreementRepository;
  private events: InteractionEventRepository;
  private negotiationSettings: NegotiationSettingService;
  private paymentSettings: PaymentSettingService;
  private injectedGateway?: PaymentGatewayProvider;

  constructor(deps?: {
    invoiceRepository?: InvoiceRepository;
    agreements?: AgreementRepository;
    events?: InteractionEventRepository;
    negotiationSettings?: NegotiationSettingService;
    paymentSettings?: PaymentSettingService;
    gateway?: PaymentGatewayProvider;
  }) {
    this.invoiceRepository = deps?.invoiceRepository ?? new InvoiceRepository();
    this.agreements = deps?.agreements ?? new AgreementRepository();
    this.events = deps?.events ?? new InteractionEventRepository();
    this.negotiationSettings = deps?.negotiationSettings ?? new NegotiationSettingService();
    this.paymentSettings = deps?.paymentSettings ?? new PaymentSettingService();
    this.injectedGateway = deps?.gateway;
  }

  private async gatewayForTenant(): Promise<PaymentGatewayProvider> {
    if (this.injectedGateway) return this.injectedGateway;
    const config = await this.paymentSettings.getForCurrentTenant();
    return resolvePaymentGatewayForTenant(config);
  }

  /**
   * Dados da página de acordo (pública). Se a fatura está "hesitando", o alívio
   * está ligado e a fatura é elegível, calcula as opções e registra `relief_offered`.
   */
  async getOptions(token: string) {
    const invoice = await this.invoiceRepository.findByLinkToken(token);
    if (!invoice) throw new Error(NegotiationError.INVOICE_NOT_FOUND);

    return runWithTenant(invoice.tenantId, async () => {
      // Já existe acordo ativo? Então o pagador deve ir para a NOVA cobrança
      // (a original foi superseded). O front usa isto para apontar o pagamento.
      const activeAgreement = await this.agreements.findActiveByOriginal(invoice.id);

      const counts = await this.events.countsByInvoice(invoice.id);
      const rules = await this.negotiationSettings.getRules();
      const eligible = isReliefEligibleStatus(invoice.status);
      const hesitating = isHesitating(counts, rules.hesitationOpens);
      // Não reoferece se já há acordo em aberto.
      const reliefAvailable = rules.enabled && eligible && hesitating && !activeAgreement;

      const options = reliefAvailable
        ? computeOptions(rules, { value: invoice.value, dueDate: invoice.dueDate })
        : [];

      if (reliefAvailable) {
        // Elo (spec 0016): a oferta foi exibida (best-effort, não bloqueia a página).
        await this.events
          .record({
            type: InteractionType.RELIEF_OFFERED,
            tenantId: invoice.tenantId,
            invoiceId: invoice.id,
            clientId: invoice.clientId,
            channel: 'web',
          })
          .catch((err) => console.error('⚠️ Falha ao registrar relief_offered (segue):', err));
      }

      return {
        invoice: {
          value: Number(invoice.value),
          dueDate: invoice.dueDate,
          status: invoice.status,
          checkoutUrl: invoice.checkoutUrl ?? null,
          pixCopyPaste: invoice.pixCopyPaste ?? null,
        },
        opens: counts[InteractionType.OPEN] ?? 0,
        hesitating,
        reliefAvailable,
        options,
        activeAgreement: activeAgreement ?? null,
      };
    });
  }

  /**
   * Aceita uma opção de alívio: gera a NOVA cobrança (gateway por tenant) e
   * supersede a original. Idempotente por fatura (RN-NEG3). Lança:
   * - Error('INVOICE_NOT_FOUND') → 404
   * - Error('NOT_ELIGIBLE')      → 409
   * - NegotiationRuleError       → 422 (fora do teto do dono)
   */
  async accept(token: string, dto: AcceptAgreementDTO) {
    const invoice = await this.invoiceRepository.findByLinkToken(token);
    if (!invoice) throw new Error(NegotiationError.INVOICE_NOT_FOUND);

    return runWithTenant(invoice.tenantId, async () => {
      // Idempotência PRIMEIRO (RN-NEG3): se já há acordo ativo, devolve o vigente.
      // (Precede a checagem de elegibilidade: após o 1º acordo a original vira
      // RENEGOTIATED — reabrir o link deve devolver o acordo, não dar 409.)
      const active = await this.agreements.findActiveByOriginal(invoice.id);
      if (active) return { created: false, agreement: active };

      if (!isReliefEligibleStatus(invoice.status)) throw new Error(NegotiationError.NOT_ELIGIBLE);

      const rules = await this.negotiationSettings.getRules();
      if (!rules.enabled) throw new Error(NegotiationError.NOT_ELIGIBLE);

      // Termos exatos, validados contra o teto do tenant (lança NegotiationRuleError).
      const terms = computeTerms(
        rules,
        { value: invoice.value },
        dto.type as AgreementType,
        dto.installments
      );

      // Reserva a nova fatura ANTES de cobrar (mesmo padrão do createPayment).
      const finalValue = new Prisma.Decimal(terms.finalValue);
      const description = agreementDescription(terms);
      const reserved = await this.invoiceRepository.create({
        clientId: invoice.clientId,
        value: finalValue,
        dueDate: new Date(terms.newDueDate),
        items: [{ description, quantity: 1, unitPrice: finalValue }],
      });

      try {
        const gateway = await this.gatewayForTenant();
        const charge = await gateway.createCharge({
          reference: randomUUID(),
          amount: terms.finalValue,
          dueDate: new Date(terms.newDueDate),
          description,
        });

        const newInvoice = await this.invoiceRepository.attachCharge(reserved.id, {
          gatewayId: charge.gatewayId,
          pixCopyPaste: charge.pixCopyPaste,
          pixQrCode: charge.pixQrCode,
          checkoutUrl: charge.checkoutUrl,
        });

        const result = await this.agreements.finalize({
          tenantId: invoice.tenantId,
          clientId: invoice.clientId,
          originalInvoiceId: invoice.id,
          newInvoiceId: newInvoice.id,
          type: dto.type,
          terms,
        });

        // Corrida perdida (RN-NEG3): desfaz a nova reserva e devolve o acordo vigente.
        if (result.conflict) {
          await this.invoiceRepository.deleteById(newInvoice.id).catch(() => {});
          return { created: false, agreement: result.agreement };
        }

        return { created: true, agreement: result.agreement };
      } catch (error) {
        await this.invoiceRepository.deleteById(reserved.id).catch(() => {});
        throw error;
      }
    });
  }

  /**
   * Tentativa de pagamento (pública): registra `pay_attempt` (preciso, RN-NEG8)
   * e devolve o destino de pagamento para o front redirecionar.
   */
  async payAttempt(token: string) {
    const invoice = await this.invoiceRepository.findByLinkToken(token);
    if (!invoice) throw new Error(NegotiationError.INVOICE_NOT_FOUND);

    await this.events
      .record({
        type: InteractionType.PAY_ATTEMPT,
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        channel: 'web',
      })
      .catch((err) => console.error('⚠️ Falha ao registrar pay_attempt (segue):', err));

    return {
      checkoutUrl: invoice.checkoutUrl ?? null,
      pixCopyPaste: invoice.pixCopyPaste ?? null,
    };
  }

  /** Acordo (mais recente) de uma fatura — para o painel do dono (JWT). null se a fatura não é do tenant. */
  async getAgreementForInvoice(id: string) {
    const invoice = await this.invoiceRepository.findById(id);
    if (!invoice) return null;
    const agreement = await this.agreements.findByOriginal(id);
    return { agreement };
  }
}
