import { describe, it, expect, vi } from 'vitest';
import { OnboardingService } from '../../src/services/onboarding.service.js';

function makeService(overrides: Record<string, any> = {}) {
  const repo = {
    findState: vi.fn().mockResolvedValue(null),
    upsertState: vi.fn().mockResolvedValue(undefined),
    hasPaymentSetting: vi.fn().mockResolvedValue(false),
    hasWhatsappSetting: vi.fn().mockResolvedValue(false),
    hasClients: vi.fn().mockResolvedValue(false),
    hasInvoices: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
  const service = new OnboardingService({ repo: repo as any });
  return { service, repo };
}

const stepByKey = (status: any, key: string) =>
  status.steps.find((s: any) => s.key === key);

describe('OnboardingService.getStatus', () => {
  it('conta nova: 4 passos, nada feito, não completo', async () => {
    const { service } = makeService();
    const status = await service.getStatus();

    expect(status.steps).toHaveLength(4);
    expect(status.completed).toBe(false);
    expect(status.dismissed).toBe(false);
    expect(status.progress).toEqual({ done: 0, total: 4 });
    expect(status.steps.every((s) => !s.done)).toBe(true);
  });

  it('gateway conta com qualquer provider salvo (prod-ready)', async () => {
    const { service } = makeService({ hasPaymentSetting: vi.fn().mockResolvedValue(true) });
    const status = await service.getStatus();
    expect(stepByKey(status, 'gateway').done).toBe(true);
    expect(status.progress.done).toBe(1);
  });

  it('cliente e fatura derivam de dados reais', async () => {
    const { service } = makeService({
      hasClients: vi.fn().mockResolvedValue(true),
      hasInvoices: vi.fn().mockResolvedValue(true),
    });
    const status = await service.getStatus();
    expect(stepByKey(status, 'client').done).toBe(true);
    expect(stepByKey(status, 'invoice').done).toBe(true);
  });

  it('WhatsApp fica feito ao pular (opcional)', async () => {
    const { service } = makeService({
      findState: vi.fn().mockResolvedValue({ dismissed: false, whatsappSkipped: true }),
    });
    const status = await service.getStatus();
    const wa = stepByKey(status, 'whatsapp');
    expect(wa.done).toBe(true);
    expect(wa.skipped).toBe(true);
    expect(wa.optional).toBe(true);
  });

  it('completo quando obrigatórios feitos + WhatsApp pulado', async () => {
    const { service } = makeService({
      findState: vi.fn().mockResolvedValue({ dismissed: false, whatsappSkipped: true }),
      hasPaymentSetting: vi.fn().mockResolvedValue(true),
      hasClients: vi.fn().mockResolvedValue(true),
      hasInvoices: vi.fn().mockResolvedValue(true),
    });
    const status = await service.getStatus();
    expect(status.completed).toBe(true);
    expect(status.progress).toEqual({ done: 4, total: 4 });
  });

  it('expõe dismissed da linha de estado', async () => {
    const { service } = makeService({
      findState: vi.fn().mockResolvedValue({ dismissed: true, whatsappSkipped: false }),
    });
    const status = await service.getStatus();
    expect(status.dismissed).toBe(true);
  });
});

describe('OnboardingService.update', () => {
  it('dispensa: faz upsert e devolve status com dismissed', async () => {
    const state = { dismissed: false, whatsappSkipped: false };
    const repo = {
      findState: vi.fn(async () => state),
      upsertState: vi.fn(async (d: any) => {
        if (d.dismissed !== undefined) state.dismissed = d.dismissed;
        if (d.whatsappSkipped !== undefined) state.whatsappSkipped = d.whatsappSkipped;
      }),
      hasPaymentSetting: vi.fn().mockResolvedValue(false),
      hasWhatsappSetting: vi.fn().mockResolvedValue(false),
      hasClients: vi.fn().mockResolvedValue(false),
      hasInvoices: vi.fn().mockResolvedValue(false),
    };
    const service = new OnboardingService({ repo: repo as any });

    const status = await service.update({ dismiss: true });
    expect(repo.upsertState).toHaveBeenCalledWith({ dismissed: true });
    expect(status.dismissed).toBe(true);
  });

  it('pular WhatsApp: faz upsert de whatsappSkipped', async () => {
    const { service, repo } = makeService();
    await service.update({ skipWhatsapp: true });
    expect(repo.upsertState).toHaveBeenCalledWith({ whatsappSkipped: true });
  });
});
