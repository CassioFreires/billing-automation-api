import { ModuleEntitlementRepository } from '../repositories/module-entitlement.repository.js';
import { PlatformSubscriptionService } from './platform-subscription.service.js';
import {
  ModuleKey,
  resolveModules,
  describeModules,
  isModuleKey,
} from '../domain/modules.js';

/** Erros de domínio da modularização (o controller mapeia p/ HTTP). */
export class ModuleError extends Error {
  constructor(public code: 'INVALID_MODULE') {
    super(code);
  }
}

/**
 * Titularidade de módulos (spec 0051). Compõe o plano EFETIVO (funil único
 * `entitlementsForCurrentTenant`) com os grants explícitos do tenant.
 */
export class ModuleEntitlementService {
  private repo: ModuleEntitlementRepository;
  private platform: PlatformSubscriptionService;

  constructor(deps?: {
    repo?: ModuleEntitlementRepository;
    platform?: PlatformSubscriptionService;
  }) {
    this.repo = deps?.repo ?? new ModuleEntitlementRepository();
    this.platform = deps?.platform ?? new PlatformSubscriptionService();
  }

  /** Add-ons efetivamente concedidos ao tenant corrente. */
  async effectiveModules(now: Date = new Date()): Promise<ModuleKey[]> {
    const ent = await this.platform.entitlementsForCurrentTenant(now);
    const grants = await this.repo.listByTenant();
    return resolveModules(ent.plan, grants);
  }

  /** O tenant corrente tem o módulo? (usado pelo `requireModule`). */
  async has(key: ModuleKey, now: Date = new Date()): Promise<boolean> {
    const mods = await this.effectiveModules(now);
    return mods.includes(key);
  }

  /** Visão detalhada de um tenant explícito p/ o console do admin. */
  async describeForTenant(tenantId: string, now: Date = new Date()) {
    const ent = await this.platform.entitlementsForTenant(tenantId, now);
    const grants = await this.repo.listByTenantId(tenantId);
    return { plan: ent.plan, modules: describeModules(ent.plan, grants) };
  }

  /** Concede/revoga um módulo (admin). */
  async setGrant(tenantId: string, moduleKey: string, granted: boolean) {
    if (!isModuleKey(moduleKey)) throw new ModuleError('INVALID_MODULE');
    const row = await this.repo.upsert(tenantId, moduleKey, granted);
    return { key: row.moduleKey, granted: row.granted };
  }
}
