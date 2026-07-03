import { describe, it, expect, vi } from 'vitest';
import { resolveWhatsappForTenant } from '../../src/apis/whatsapp.api.js';
import { WhatsappSettingService } from '../../src/services/whatsapp-setting.service.js';

describe('resolveWhatsappForTenant', () => {
  it('usa log quando provider != cloud', () => {
    expect(resolveWhatsappForTenant({ provider: 'log' }).name).toBe('log');
  });

  it('cai em log quando cloud mas sem token/phoneNumberId', () => {
    expect(resolveWhatsappForTenant({ provider: 'cloud' }).name).toBe('log');
    expect(resolveWhatsappForTenant({ provider: 'cloud', token: 't' }).name).toBe('log');
  });

  it('usa cloud quando tem token e phoneNumberId', () => {
    const p = resolveWhatsappForTenant({
      provider: 'cloud',
      token: 'tok',
      phoneNumberId: '123',
    });
    expect(p.name).toBe('cloud');
  });
});

describe('WhatsappSettingService.getMasked', () => {
  function make() {
    const repository = { findByTenant: vi.fn(), upsert: vi.fn() };
    const service = new WhatsappSettingService({ repository: repository as any });
    return { service, repository };
  }

  it('NUNCA devolve o token — só indica se está setado', async () => {
    const { service, repository } = make();
    repository.findByTenant.mockResolvedValue({
      provider: 'cloud',
      phoneNumberId: '123',
      token: 'SECRETO',
      apiVersion: 'v20.0',
    });

    const masked = await service.getMasked();

    expect(masked).toEqual({
      provider: 'cloud',
      phoneNumberId: '123',
      apiVersion: 'v20.0',
      hasToken: true,
    });
    expect(JSON.stringify(masked)).not.toContain('SECRETO');
  });

  it('default log quando o tenant não configurou', async () => {
    const { service, repository } = make();
    repository.findByTenant.mockResolvedValue(null);

    const masked = await service.getMasked();

    expect(masked.provider).toBe('log');
    expect(masked.hasToken).toBe(false);
  });
});
