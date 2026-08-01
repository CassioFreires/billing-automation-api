/**
 * Planos da PLATAFORMA (spec 0020 — cobrança do próprio SaaS). Fonte única do
 * catálogo (preços, limites, recursos) e das regras de entitlement/gating.
 *
 * Módulo PURO (sem I/O). Ajuste preços/limites/recursos aqui — o resto do
 * sistema deriva daqui. Distinto de `Subscription` (recorrência do tenant com
 * os clientes DELE); aqui é a Adimplo cobrando o tenant.
 */

export const PlanId = {
  FREE: 'free',
  ESSENCIAL: 'essencial',
  PRO: 'pro',
} as const;
export type PlanId = (typeof PlanId)[keyof typeof PlanId];

export const PlatformStatus = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
} as const;
export type PlatformStatus = (typeof PlatformStatus)[keyof typeof PlatformStatus];

export interface PlanFeatures {
  /** Botão de Alívio / autonegociação (spec 0018). */
  reliefButton: boolean;
}

export interface PlanDef {
  id: PlanId;
  label: string;
  priceCents: number;
  /** Limite de faturas emitidas por mês. `null` = ilimitado. */
  maxInvoicesPerMonth: number | null;
  /** Assentos (usuários) INCLUSOS no plano. Acima disso, cobra assento extra (spec 0053). */
  maxSeats: number;
  features: PlanFeatures;
  /** Marca "Adimplo" nas cobranças (plano gratuito). */
  adimploBranding: boolean;
}

/** Preço do assento (usuário) adicional além dos inclusos, em centavos (spec 0053). */
export const EXTRA_SEAT_PRICE_CENTS = 1900;

/** Catálogo do Núcleo (base). Preços em centavos (BRL). Módulos são à parte (spec 0051). */
export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    label: 'Núcleo Grátis',
    priceCents: 0,
    maxInvoicesPerMonth: 30,
    maxSeats: 1,
    features: { reliefButton: false },
    adimploBranding: true,
  },
  essencial: {
    id: 'essencial',
    label: 'Núcleo Essencial',
    priceCents: 4900,
    maxInvoicesPerMonth: 200,
    maxSeats: 2,
    features: { reliefButton: false },
    adimploBranding: false,
  },
  pro: {
    id: 'pro',
    label: 'Núcleo Pro',
    priceCents: 9700,
    maxInvoicesPerMonth: null,
    maxSeats: 3,
    features: { reliefButton: true },
    adimploBranding: false,
  },
};

/** Dias de trial (recursos Pro) para toda conta nova. */
export const TRIAL_DAYS = 14;

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'essencial' || value === 'pro';
}

/** Estado mínimo da assinatura de plataforma para resolver o entitlement. */
export interface SubscriptionState {
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

export interface Entitlements {
  /** Plano EFETIVO (no trial, vale Pro). */
  plan: PlanId;
  /** Pode executar ações de escrita? (false = paywall). */
  canWrite: boolean;
  maxInvoicesPerMonth: number | null;
  /** Assentos (usuários) inclusos no plano efetivo (spec 0053). */
  maxSeats: number;
  features: PlanFeatures;
  /** Motivo do bloqueio, quando `canWrite` é false. */
  reason?: 'TRIAL_EXPIRED' | 'PLAN_EXPIRED' | 'SUSPENDED';
}

const READONLY_FALLBACK: Omit<Entitlements, 'reason'> = {
  plan: 'free',
  canWrite: false,
  maxInvoicesPerMonth: PLANS.free.maxInvoicesPerMonth,
  maxSeats: PLANS.free.maxSeats,
  features: PLANS.free.features,
};

/**
 * Resolve o que o tenant PODE fazer agora, a partir do estado da assinatura.
 * - trial vigente → recursos Pro, escrita liberada.
 * - active com período vigente → recursos do plano, escrita liberada.
 * - trial expirado / período vencido / past_due / canceled → só leitura (paywall).
 */
export function resolveEntitlements(
  sub: SubscriptionState | null,
  now: Date,
  accountStatus?: string
): Entitlements {
  // Suspensão pelo super-admin (spec 0023) tem precedência: bloqueia escrita.
  if (accountStatus === 'SUSPENDED') {
    return { ...READONLY_FALLBACK, reason: 'SUSPENDED' };
  }

  if (!sub) {
    // Sem registro: trata como bloqueado (o backfill garante que contas reais têm um).
    return { ...READONLY_FALLBACK, reason: 'PLAN_EXPIRED' };
  }

  if (sub.status === PlatformStatus.TRIALING) {
    if (sub.trialEndsAt && now < sub.trialEndsAt) {
      return {
        plan: 'pro',
        canWrite: true,
        maxInvoicesPerMonth: PLANS.pro.maxInvoicesPerMonth,
        maxSeats: PLANS.pro.maxSeats,
        features: PLANS.pro.features,
      };
    }
    return { ...READONLY_FALLBACK, reason: 'TRIAL_EXPIRED' };
  }

  if (sub.status === PlatformStatus.ACTIVE) {
    const plan = isPlanId(sub.plan) ? sub.plan : 'free';
    if (plan === 'free') {
      // Free é "ativo" sem período: liberado dentro do limite do free.
      return {
        plan: 'free',
        canWrite: true,
        maxInvoicesPerMonth: PLANS.free.maxInvoicesPerMonth,
        maxSeats: PLANS.free.maxSeats,
        features: PLANS.free.features,
      };
    }
    if (sub.currentPeriodEnd && now < sub.currentPeriodEnd) {
      return {
        plan,
        canWrite: true,
        maxInvoicesPerMonth: PLANS[plan].maxInvoicesPerMonth,
        maxSeats: PLANS[plan].maxSeats,
        features: PLANS[plan].features,
      };
    }
    // Pago mas período vencido → inadimplente.
    return { ...READONLY_FALLBACK, reason: 'PLAN_EXPIRED' };
  }

  // past_due | canceled | desconhecido.
  return { ...READONLY_FALLBACK, reason: 'PLAN_EXPIRED' };
}

/** true se a emissão de mais uma fatura estoura o limite do plano vigente. */
export function isOverInvoiceQuota(invoicesThisMonth: number, ent: Entitlements): boolean {
  if (ent.maxInvoicesPerMonth === null) return false;
  return invoicesThisMonth >= ent.maxInvoicesPerMonth;
}

/** true se adicionar mais um usuário estoura os assentos inclusos no plano (spec 0053). */
export function isOverSeatLimit(currentSeats: number, ent: Entitlements): boolean {
  return currentSeats >= ent.maxSeats;
}

/** Fim do próximo período mensal a partir de `from` (renovação da assinatura). */
export function nextPeriodEnd(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate(), 0, 0, 0, 0));
}
