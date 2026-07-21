import { Prisma } from '@prisma/client';
import { InvoiceStatus } from './status.js';

/**
 * Regras de AUTONEGOCIAÇÃO (spec 0018 — M2). Funções PURAS: dadas as regras do
 * tenant (NegotiationSetting) e a fatura, calculam as opções de alívio e os
 * termos de um acordo — sem tocar banco/gateway, para serem 100% testáveis.
 *
 * Dinheiro sempre em Prisma.Decimal (nunca float — RN-P6/RN-NEG9).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tipos de acordo oferecíveis. */
export const AgreementType = {
  DISCOUNT: 'discount',
  INSTALLMENTS: 'installments',
  DEFER: 'defer',
} as const;
export type AgreementType = (typeof AgreementType)[keyof typeof AgreementType];

/** As regras do tenant, no formato puro que estas funções consomem. */
export interface NegotiationRules {
  enabled: boolean;
  hesitationOpens: number;
  discountEnabled: boolean;
  discountPercent: Prisma.Decimal | number; // 0..1
  installmentsEnabled: boolean;
  maxInstallments: number;
  deferEnabled: boolean;
  deferMaxDays: number;
  deferFeePercent: Prisma.Decimal | number; // 0..1
}

/** Uma opção de alívio já calculada, pronta para a página do pagador. */
export interface AgreementOption {
  type: AgreementType;
  finalValue: number;         // valor total a pagar nessa opção
  discountPercent?: number;   // discount
  installments?: number;      // installments
  installmentValue?: number;  // installments
  newDueDate?: string;        // ISO (discount/installments = hoje; defer = +N dias)
  feePercent?: number;        // defer
}

/** Snapshot dos termos aplicados, guardado no Agreement (RN-NEG11). */
export interface AgreementTerms {
  type: AgreementType;
  originalValue: number;
  finalValue: number;
  discountPercent?: number;
  installments?: number;
  installmentValue?: number;
  feePercent?: number;
  newDueDate: string; // ISO
}

/** Arredonda para 2 casas (centavos) de forma exata via Decimal. */
function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function dec(v: Prisma.Decimal | number): Prisma.Decimal {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

/** Só faturas EM ABERTO podem virar acordo (RN-NEG1). */
export function isReliefEligibleStatus(status: string): boolean {
  return status === InvoiceStatus.PENDING || status === InvoiceStatus.OVERDUE;
}

/**
 * Calcula TODAS as opções elegíveis (dentro do teto do dono) para exibir na
 * página. Não inclui opções desabilitadas nem com parâmetros zerados.
 */
export function computeOptions(
  rules: NegotiationRules,
  invoice: { value: Prisma.Decimal | number; dueDate: Date },
  now: Date = new Date()
): AgreementOption[] {
  if (!rules.enabled) return [];
  const value = dec(invoice.value);
  const options: AgreementOption[] = [];

  // Desconto à vista.
  if (rules.discountEnabled && dec(rules.discountPercent).gt(0)) {
    const pct = dec(rules.discountPercent);
    const finalValue = round2(value.times(new Prisma.Decimal(1).minus(pct)));
    options.push({
      type: AgreementType.DISCOUNT,
      finalValue: finalValue.toNumber(),
      discountPercent: pct.toNumber(),
      newDueDate: now.toISOString(),
    });
  }

  // Parcelamento (sem juros no v1 — o valor total não muda, só divide).
  if (rules.installmentsEnabled && rules.maxInstallments >= 2) {
    const n = rules.maxInstallments;
    const installmentValue = round2(value.dividedBy(n));
    options.push({
      type: AgreementType.INSTALLMENTS,
      finalValue: value.toNumber(),
      installments: n,
      installmentValue: installmentValue.toNumber(),
      newDueDate: now.toISOString(),
    });
  }

  // Adiar vencimento (com taxa opcional sobre o valor).
  if (rules.deferEnabled && rules.deferMaxDays >= 1) {
    const fee = dec(rules.deferFeePercent);
    const finalValue = round2(value.times(new Prisma.Decimal(1).plus(fee)));
    const newDueDate = new Date(now.getTime() + rules.deferMaxDays * DAY_MS);
    options.push({
      type: AgreementType.DEFER,
      finalValue: finalValue.toNumber(),
      feePercent: fee.toNumber(),
      newDueDate: newDueDate.toISOString(),
    });
  }

  return options;
}

/** Erro de regra: opção fora do que o dono habilitou/permitiu (→ 422). */
export class NegotiationRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NegotiationRuleError';
  }
}

/**
 * Calcula os termos EXATOS de um acordo escolhido, validando contra o teto do
 * tenant (RN-NEG2). Lança `NegotiationRuleError` se a opção não é permitida.
 * `installments` só é usado quando `type === 'installments'`.
 */
export function computeTerms(
  rules: NegotiationRules,
  invoice: { value: Prisma.Decimal | number },
  type: AgreementType,
  installments: number | undefined,
  now: Date = new Date()
): AgreementTerms {
  if (!rules.enabled) throw new NegotiationRuleError('Autonegociação desabilitada.');
  const value = dec(invoice.value);
  const originalValue = round2(value).toNumber();

  if (type === AgreementType.DISCOUNT) {
    if (!rules.discountEnabled || !dec(rules.discountPercent).gt(0)) {
      throw new NegotiationRuleError('Desconto não disponível.');
    }
    const pct = dec(rules.discountPercent);
    const finalValue = round2(value.times(new Prisma.Decimal(1).minus(pct)));
    return {
      type,
      originalValue,
      finalValue: finalValue.toNumber(),
      discountPercent: pct.toNumber(),
      newDueDate: now.toISOString(),
    };
  }

  if (type === AgreementType.INSTALLMENTS) {
    if (!rules.installmentsEnabled || rules.maxInstallments < 2) {
      throw new NegotiationRuleError('Parcelamento não disponível.');
    }
    const n = installments ?? rules.maxInstallments;
    if (!Number.isInteger(n) || n < 2 || n > rules.maxInstallments) {
      throw new NegotiationRuleError(
        `Número de parcelas inválido (máximo ${rules.maxInstallments}).`
      );
    }
    const installmentValue = round2(value.dividedBy(n));
    return {
      type,
      originalValue,
      finalValue: round2(value).toNumber(),
      installments: n,
      installmentValue: installmentValue.toNumber(),
      newDueDate: now.toISOString(),
    };
  }

  if (type === AgreementType.DEFER) {
    if (!rules.deferEnabled || rules.deferMaxDays < 1) {
      throw new NegotiationRuleError('Adiamento não disponível.');
    }
    const fee = dec(rules.deferFeePercent);
    const finalValue = round2(value.times(new Prisma.Decimal(1).plus(fee)));
    const newDueDate = new Date(now.getTime() + rules.deferMaxDays * DAY_MS);
    return {
      type,
      originalValue,
      finalValue: finalValue.toNumber(),
      feePercent: fee.toNumber(),
      newDueDate: newDueDate.toISOString(),
    };
  }

  throw new NegotiationRuleError('Tipo de acordo desconhecido.');
}

/** Descrição legível do item da nova fatura gerada pelo acordo. */
export function agreementDescription(terms: AgreementTerms): string {
  switch (terms.type) {
    case AgreementType.DISCOUNT:
      return `Acordo — pagamento à vista com ${Math.round((terms.discountPercent ?? 0) * 100)}% de desconto`;
    case AgreementType.INSTALLMENTS:
      return `Acordo — parcelamento em ${terms.installments}x`;
    case AgreementType.DEFER:
      return `Acordo — novo vencimento`;
    default:
      return 'Acordo';
  }
}
