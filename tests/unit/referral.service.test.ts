import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReferralService, ReferralError, RE } from '../../src/services/referral.service.js';

function makeMocks() {
  return {
    repo: {
      getSettings: vi.fn().mockResolvedValue({ enabled: true, rewardCents: 1000, rewardWho: 'both' }),
      upsertSettings: vi.fn().mockResolvedValue({}),
      findByReferralCode: vi.fn().mockResolvedValue({ id: 'ref1', name: 'Maria', tenantId: 't1' }),
      getClientCode: vi.fn().mockResolvedValue(null),
      setClientCode: vi.fn().mockResolvedValue(undefined),
      findClientByPhone: vi.fn().mockResolvedValue(null),
      createReferredClient: vi.fn().mockResolvedValue({ id: 'amigo1', name: 'Amigo' }),
      createReferral: vi.fn().mockResolvedValue({ id: 'r1' }),
      findPendingByReferred: vi.fn().mockResolvedValue({ id: 'r1', referrerClientId: 'ref1', referredClientId: 'amigo1' }),
      markConverted: vi.fn().mockResolvedValue({}),
      addCredit: vi.fn().mockResolvedValue(undefined),
      getClientCredit: vi.fn(),
      consumeCredit: vi.fn(),
      list: vi.fn(),
      summary: vi.fn(),
    },
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new ReferralService(m as any);

describe('ReferralService (spec 0046 — F16)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('ensureCode gera código e monta o link público', async () => {
    const { code, link } = await svc(m).ensureCode('c1', 'https://x.com/');
    expect(code).toMatch(/^[A-Z2-9]{7}$/);
    expect(m.repo.setClientCode).toHaveBeenCalledWith('c1', code);
    expect(link).toBe(`https://x.com/indicar/${code}`);
  });

  it('ensureCode reusa o código existente', async () => {
    m.repo.getClientCode.mockResolvedValue('ABC2345');
    const { code } = await svc(m).ensureCode('c1', 'https://x.com');
    expect(code).toBe('ABC2345');
    expect(m.repo.setClientCode).not.toHaveBeenCalled();
  });

  it('capture cria o amigo indicado + a indicação pendente', async () => {
    const r = await svc(m).capture('COD1234', { name: 'Amigo', phone: '11999999999' });
    expect(r).toEqual({ ok: true });
    expect(m.repo.createReferredClient).toHaveBeenCalledWith(expect.objectContaining({ name: 'Amigo', referrerClientId: 'ref1' }));
    expect(m.repo.createReferral).toHaveBeenCalledWith({ referrerClientId: 'ref1', referredClientId: 'amigo1' });
  });

  it('capture recusa telefone que já é cliente', async () => {
    m.repo.findClientByPhone.mockResolvedValue({ id: 'existente' });
    await expect(svc(m).capture('COD1234', { name: 'Amigo', phone: '11999999999' })).rejects.toThrow(RE.ALREADY_CLIENT);
    expect(m.repo.createReferredClient).not.toHaveBeenCalled();
  });

  it('capture recusa quando o programa está desligado', async () => {
    m.repo.getSettings.mockResolvedValue({ enabled: false, rewardCents: 1000, rewardWho: 'both' });
    await expect(svc(m).capture('COD1234', { name: 'A', phone: '11999999999' })).rejects.toThrow(RE.DISABLED);
  });

  it('capture 404 em código inexistente', async () => {
    m.repo.findByReferralCode.mockResolvedValue(null);
    await expect(svc(m).capture('XXX', { name: 'A', phone: '11999999999' })).rejects.toBeInstanceOf(ReferralError);
  });

  it('onInvoicePaid converte e credita os dois (rewardWho=both)', async () => {
    await svc(m).onInvoicePaid('amigo1', 't1', new Date('2026-07-24'));
    expect(m.repo.addCredit).toHaveBeenCalledWith('ref1', 1000); // indicador
    expect(m.repo.addCredit).toHaveBeenCalledWith('amigo1', 1000); // indicado
    expect(m.repo.markConverted).toHaveBeenCalledWith('r1', 2000, expect.any(Date));
  });

  it('onInvoicePaid só credita o indicado quando rewardWho=referred', async () => {
    m.repo.getSettings.mockResolvedValue({ enabled: true, rewardCents: 1500, rewardWho: 'referred' });
    await svc(m).onInvoicePaid('amigo1', 't1');
    expect(m.repo.addCredit).toHaveBeenCalledTimes(1);
    expect(m.repo.addCredit).toHaveBeenCalledWith('amigo1', 1500);
    expect(m.repo.markConverted).toHaveBeenCalledWith('r1', 1500, expect.any(Date));
  });

  it('onInvoicePaid não faz nada sem indicação pendente', async () => {
    m.repo.findPendingByReferred.mockResolvedValue(null);
    await svc(m).onInvoicePaid('qualquer', 't1');
    expect(m.repo.addCredit).not.toHaveBeenCalled();
    expect(m.repo.markConverted).not.toHaveBeenCalled();
  });

  it('updateSettings clampa recompensa e normaliza o público', async () => {
    await svc(m).updateSettings({ rewardCents: -5, rewardWho: 'xpto' as any });
    expect(m.repo.upsertSettings).toHaveBeenCalledWith(expect.objectContaining({ rewardCents: 0, rewardWho: 'both' }));
  });
});
