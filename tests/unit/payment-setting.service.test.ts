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

describe('PaymentSettingService.update', () => {
  it('delega o upsert ao repositório', async () => {
    const { service, repository } = make();
    repository.upsert.mockResolvedValue({ id: 'p1' });

    await service.update({
      provider: 'infinitepay',
      infinitepayHandle: 'loja',
      redirectUrl: null,
    } as any);

    expect(repository.upsert).toHaveBeenCalledWith({
      provider: 'infinitepay',
      infinitepayHandle: 'loja',
      redirectUrl: null,
    });
  });
});
