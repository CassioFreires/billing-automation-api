import { describe, it, expect, vi } from 'vitest';
import { PaymentSettingService } from '../../src/services/payment-setting.service.js';

function make() {
  const repository = { findByTenant: vi.fn(), upsert: vi.fn() };
  const service = new PaymentSettingService({ repository: repository as any });
  return { service, repository };
}

describe('PaymentSettingService.getForCurrentTenant', () => {
  it('retorna a config do tenant quando existe', async () => {
    const { service, repository } = make();
    repository.findByTenant.mockResolvedValue({
      provider: 'infinitepay',
      infinitepayHandle: 'minhaloja',
      redirectUrl: null,
    });

    const config = await service.getForCurrentTenant();

    expect(config).toEqual({
      provider: 'infinitepay',
      infinitepayHandle: 'minhaloja',
      redirectUrl: null,
    });
  });

  it('cai no provider default quando o tenant não configurou', async () => {
    const { service, repository } = make();
    repository.findByTenant.mockResolvedValue(null);

    const config = await service.getForCurrentTenant();

    expect(config.provider).toBeDefined(); // default (infinitepay, salvo env)
    expect(config.infinitepayHandle).toBeUndefined();
  });
});

describe('PaymentSettingService.getForCurrentTenant', () => {
  it('inclui as credenciais decifradas para resolver o gateway', async () => {
    const { service, repository } = make();
    repository.findByTenant.mockResolvedValue({
      provider: 'stripe',
      infinitepayHandle: null,
      redirectUrl: null,
      credentials: { secretKey: 'sk_live_x', webhookSecret: 'whsec_y' },
    });

    const config = await service.getForCurrentTenant();
    expect(config.provider).toBe('stripe');
    expect(config.credentials).toEqual({ secretKey: 'sk_live_x', webhookSecret: 'whsec_y' });
  });
});

describe('PaymentSettingService.get (mascarado)', () => {
  it('NUNCA devolve segredos — só credentialStatus (quais estão setados)', async () => {
    const { service, repository } = make();
    repository.findByTenant.mockResolvedValue({
      provider: 'asaas',
      infinitepayHandle: null,
      redirectUrl: null,
      credentials: { apiKey: 'super-secreto' },
    });

    const masked = await service.get();
    // segredo não vaza em lugar nenhum
    expect(JSON.stringify(masked)).not.toContain('super-secreto');
    expect(masked.provider).toBe('asaas');
    expect(masked.credentialStatus.apiKey).toBe(true);
    expect(masked.credentialStatus.secretKey).toBe(false);
  });
});

describe('PaymentSettingService.update', () => {
  it('delega o upsert ao repositório (incluindo credenciais)', async () => {
    const { service, repository } = make();
    repository.upsert.mockResolvedValue({ id: 'p1' });
    repository.findByTenant.mockResolvedValue(null);

    await service.update({
      provider: 'asaas',
      infinitepayHandle: null,
      redirectUrl: null,
      credentials: { apiKey: 'k1' },
    } as any);

    expect(repository.upsert).toHaveBeenCalledWith({
      provider: 'asaas',
      infinitepayHandle: null,
      redirectUrl: null,
      credentials: { apiKey: 'k1' },
    });
  });
});
