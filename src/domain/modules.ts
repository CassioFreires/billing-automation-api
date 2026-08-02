/**
 * Módulos vendáveis da plataforma (spec 0051 — modularização). Módulo PURO (sem I/O).
 *
 * Camada de TITULARIDADE (entitlement): responde "o tenant TEM o módulo?", distinta do
 * `*Setting.enabled` de cada feature ("o tenant LIGOU o que possui?"). Ajuste o catálogo
 * aqui — o resto do sistema (gate, upsell, admin) deriva daqui.
 *
 * Núcleo é sempre disponível (não é um add-on): clientes, faturas, assinaturas, cobrança,
 * régua, portal do pagador, recuperação de pagamento falho (F1), contrato e white-label.
 */

export const ModuleKey = {
  FISCAL: 'fiscal',
  ACCESS: 'access',
  GROWTH: 'growth',
  RECOVERY: 'recovery',
} as const;
export type ModuleKey = (typeof ModuleKey)[keyof typeof ModuleKey];

/** Add-ons vendáveis, na ordem de exibição. */
export const ADDON_MODULES: ModuleKey[] = ['fiscal', 'access', 'growth', 'recovery'];

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  /** Frase curta de upsell (o que o módulo entrega). */
  description: string;
  /** Features (specs) que este módulo agrupa — documentação/rastreio. */
  features: string[];
  /** Preço sugerido em centavos (BRL) — informativo p/ o upsell (cobrança é follow-up). */
  priceCents: number;
}

/** Catálogo dos add-ons. */
export const MODULES: Record<ModuleKey, ModuleDef> = {
  fiscal: {
    key: 'fiscal',
    label: 'Nota Fiscal (NFS-e)',
    description: 'Emita NFS-e automaticamente quando a fatura é paga, com reemissão e cancelamento.',
    features: ['0047'],
    priceCents: 6900, // reposicionamento de mercado (spec 0055)
  },
  access: {
    key: 'access',
    label: 'Controle de Acesso',
    description: 'Liga/desliga o acesso do cliente conforme o pagamento — inclusive catracas e IoT.',
    features: ['0042', '0043'],
    priceCents: 8900, // integração de hardware — maior valor (spec 0055)
  },
  growth: {
    key: 'growth',
    label: 'Crescimento',
    description: 'Winback de inadimplentes, Indique e Ganhe e Loja no Pagamento (order-bump).',
    features: ['0044', '0045', '0046'],
    priceCents: 6900,
  },
  recovery: {
    key: 'recovery',
    label: 'Recuperação',
    description: 'Botão de Alívio (autonegociação) e retenção no cancelamento com desconto/pausa.',
    features: ['0018', '0038'],
    priceCents: 11900, // maior ROI (recupera receita) — suporta preço (spec 0055)
  },
};

export function isModuleKey(value: unknown): value is ModuleKey {
  return value === 'fiscal' || value === 'access' || value === 'growth' || value === 'recovery';
}

/**
 * Add-ons concedidos por DEFAULT pelo plano (spec 0020). O trial vale como Pro — quem
 * resolve isso é o `plan` EFETIVO vindo de `resolveEntitlements`.
 */
export function planDefaultModules(plan: string): ModuleKey[] {
  return plan === 'pro' ? [...ADDON_MODULES] : [];
}

/** Origem da titularidade de um módulo, para a tela do admin. */
export type ModuleSource = 'plan' | 'grant';

export interface ModuleGrant {
  moduleKey: string;
  granted: boolean;
}

/**
 * Módulos EFETIVOS do tenant (RN-M3): se existe grant explícito p/ o módulo, vale ele;
 * senão, vale o default do plano. Determinístico e livre de I/O.
 */
export function resolveModules(plan: string, grants: ModuleGrant[]): ModuleKey[] {
  const byKey = new Map(grants.filter((g) => isModuleKey(g.moduleKey)).map((g) => [g.moduleKey, g.granted]));
  const planDefaults = new Set(planDefaultModules(plan));
  return ADDON_MODULES.filter((key) => (byKey.has(key) ? byKey.get(key)! : planDefaults.has(key)));
}

/** Um módulo específico está efetivamente concedido? */
export function hasModule(key: ModuleKey, plan: string, grants: ModuleGrant[]): boolean {
  return resolveModules(plan, grants).includes(key);
}

/**
 * Visão detalhada p/ o console do admin: cada add-on com seu estado efetivo e a origem
 * (default do plano vs grant explícito).
 */
export function describeModules(
  plan: string,
  grants: ModuleGrant[]
): Array<{ key: ModuleKey; label: string; granted: boolean; source: ModuleSource }> {
  const byKey = new Map(grants.filter((g) => isModuleKey(g.moduleKey)).map((g) => [g.moduleKey, g.granted]));
  const planDefaults = new Set(planDefaultModules(plan));
  return ADDON_MODULES.map((key) => {
    const hasGrant = byKey.has(key);
    return {
      key,
      label: MODULES[key].label,
      granted: hasGrant ? byKey.get(key)! : planDefaults.has(key),
      source: hasGrant ? 'grant' : 'plan',
    };
  });
}
