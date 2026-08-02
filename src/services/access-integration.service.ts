import { createHash, randomBytes } from 'node:crypto';
import { AccessIntegrationRepository } from '../repositories/access-integration.repository.js';
import { AccessRepository } from '../repositories/access.repository.js';
import { AccountRepository } from '../repositories/account.repository.js';
import { runWithTenant } from '../context/tenant-context.js';
import { decideAccess, type AccessOverride } from '../domain/access.js';
import { dispatchAccessWebhook, type AccessWebhookPayload, type WebhookResult } from '../apis/access-webhook.api.js';

export class NotConfiguredError extends Error {}

type Dispatcher = (url: string, secret: string, payload: AccessWebhookPayload) => Promise<WebhookResult>;

export interface SweepResult {
  tenants: number;
  transitions: number;
  sent: number;
  failed: number;
}

/**
 * Conexão IoT/Catracas (spec 0043, F13). A "tomada" que faz o estado do F12 agir
 * no mundo real: (a) PULL — o equipamento consulta com API key; (b) PUSH — o
 * Adimplo dispara webhook assinado quando o acesso de um cliente MUDA, detectado
 * no sweep diário (mesmo cron do F1/F2, DEPOIS da saúde). Config por tenant.
 */
export class AccessIntegrationService {
  private repo: AccessIntegrationRepository;
  private access: AccessRepository;
  private accounts: AccountRepository;
  private dispatch: Dispatcher;

  constructor(deps?: {
    repo?: AccessIntegrationRepository;
    access?: AccessRepository;
    accounts?: AccountRepository;
    dispatch?: Dispatcher;
  }) {
    this.repo = deps?.repo ?? new AccessIntegrationRepository();
    this.access = deps?.access ?? new AccessRepository();
    this.accounts = deps?.accounts ?? new AccountRepository();
    this.dispatch = deps?.dispatch ?? dispatchAccessWebhook;
  }

  /** Visão da integração para o painel (nunca expõe o hash da API key). */
  async getIntegration() {
    const i = await this.repo.get();
    return {
      enabled: i?.enabled ?? false,
      hasApiKey: !!i?.apiKeyHash,
      apiKeyPrefix: i?.apiKeyPrefix ?? null,
      webhookUrl: i?.webhookUrl ?? null,
      webhookConfigured: !!(i?.webhookUrl && i?.webhookSecret),
      webhookSecret: i?.webhookSecret ?? null, // o dono precisa ver p/ validar do lado dele
    };
  }

  async setEnabled(enabled: boolean) {
    await this.repo.upsert({ enabled });
    return this.getIntegration();
  }

  /** Gera uma nova API key. A chave CRUA só é devolvida aqui (nunca mais). */
  async rotateApiKey(): Promise<{ apiKey: string; apiKeyPrefix: string }> {
    const apiKey = `adk_${randomBytes(24).toString('base64url')}`;
    const apiKeyHash = sha256(apiKey);
    const apiKeyPrefix = apiKey.slice(0, 12);
    await this.repo.upsert({ apiKeyHash, apiKeyPrefix });
    return { apiKey, apiKeyPrefix };
  }

  async revokeApiKey() {
    await this.repo.upsert({ apiKeyHash: null, apiKeyPrefix: null });
    return this.getIntegration();
  }

  /** Define a URL do webhook; gera o segredo de assinatura se ainda não existir. */
  async setWebhook(url: string) {
    const current = await this.repo.get();
    const webhookSecret = current?.webhookSecret ?? `whsec_${randomBytes(24).toString('base64url')}`;
    await this.repo.upsert({ webhookUrl: url, webhookSecret });
    return this.getIntegration();
  }

  async clearWebhook() {
    await this.repo.upsert({ webhookUrl: null, webhookSecret: null });
    return this.getIntegration();
  }

  /** Dispara um webhook de TESTE com um payload de exemplo (valida a ponta do cliente). */
  async testWebhook(now: Date = new Date()): Promise<WebhookResult> {
    const i = await this.repo.get();
    if (!i?.webhookUrl || !i?.webhookSecret) throw new NotConfiguredError('Webhook não configurado.');
    return this.dispatch(i.webhookUrl, i.webhookSecret, {
      clientId: 'test',
      clientName: 'Cliente de teste',
      state: 'blocked',
      granted: false,
      previousState: 'allowed',
      reason: 'Disparo de teste do Adimplo.',
      at: now.toISOString(),
    });
  }

  async listEvents(limit = 50) {
    return this.repo.listEvents(limit);
  }

  /**
   * PULL (catraca): decide o acesso de UM cliente do tenant ATUAL. O middleware
   * já resolveu o tenant pela API key. Retorna null se o cliente não existir.
   */
  async computeClientAccess(clientId: string, now: Date = new Date()) {
    const [settings, inputs] = await Promise.all([
      this.access.getSettings(),
      this.access.findAccessInputs(now, clientId),
    ]);
    const i = inputs[0];
    if (!i) return null;
    const d = decideAccess({
      enabled: settings.enabled,
      hasOverdue: i.hasOverdue,
      maxDaysOverdue: i.maxDaysOverdue,
      graceDays: settings.graceDays,
      requireSignedContract: settings.requireSignedContract,
      contractAccepted: i.contractAccepted,
      override: (i.override ?? 'none') as AccessOverride,
    });
    return { clientId, state: d.state, granted: d.granted, reason: d.reason };
  }

  /** PUSH sweep cross-tenant: detecta transições e dispara webhooks. */
  async runAllTenants(now: Date = new Date()): Promise<SweepResult> {
    const tenantIds = await this.accounts.findActiveTenantIds();
    const total: SweepResult = { tenants: tenantIds.length, transitions: 0, sent: 0, failed: 0 };
    for (const tenantId of tenantIds) {
      // Isolamento por tenant (spec 0054): erro de um NÃO derruba a varredura dos demais.
      try {
        const r = await runWithTenant(tenantId, () => this.runForTenant(tenantId, now));
        total.transitions += r.transitions;
        total.sent += r.sent;
        total.failed += r.failed;
      } catch (err) {
        console.error(`⚠️ Acesso: sweep do tenant ${tenantId} falhou (segue):`, err);
      }
    }
    return total;
  }

  /** Sweep do tenant ATUAL. Compara estado atual vs propagado; loga e dispara nas transições. */
  async runForTenant(tenantId: string, now: Date = new Date()) {
    const [settings, integ, inputs] = await Promise.all([
      this.access.getSettings(),
      this.repo.get(),
      this.access.findAccessInputs(now),
    ]);
    const canDispatch = !!(integ?.enabled && integ.webhookUrl && integ.webhookSecret);

    let transitions = 0;
    let sent = 0;
    let failed = 0;

    for (const i of inputs) {
      const d = decideAccess({
        enabled: settings.enabled,
        hasOverdue: i.hasOverdue,
        maxDaysOverdue: i.maxDaysOverdue,
        graceDays: settings.graceDays,
        requireSignedContract: settings.requireSignedContract,
        contractAccepted: i.contractAccepted,
        override: (i.override ?? 'none') as AccessOverride,
      });

      const stored = i.previousState; // coluna crua (null na 1ª vez)
      const prev = stored ?? 'allowed'; // baseline: cliente novo é considerado "liberado"
      const changed = d.state !== prev;

      if (changed) {
        transitions++;
        let webhookStatus = 'skipped';
        let webhookCode: number | null = null;
        if (canDispatch) {
          const res = await this.dispatch(integ!.webhookUrl!, integ!.webhookSecret!, {
            clientId: i.clientId,
            clientName: i.name,
            state: d.state,
            granted: d.granted,
            previousState: prev,
            reason: d.reason,
            at: now.toISOString(),
          });
          webhookStatus = res.status;
          webhookCode = res.code ?? null;
          if (res.status === 'sent') sent++;
          else failed++;
        }
        await this.repo.createEvent({
          clientId: i.clientId,
          tenantId,
          fromState: stored,
          toState: d.state,
          granted: d.granted,
          reason: d.reason,
          webhookStatus,
          webhookCode,
        });
      }

      // Persiste o estado real (inclui o baseline da 1ª vez) para o próximo diff.
      if (d.state !== stored) await this.access.updateClientState(i.clientId, d.state);
    }

    return { transitions, sent, failed };
  }
}

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Exposto para o middleware resolver o tenant a partir da API key crua. */
export function hashApiKey(raw: string): string {
  return sha256(raw);
}
