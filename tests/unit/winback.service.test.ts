import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WinbackService } from '../../src/services/winback.service.js';

const DIA = 86_400_000;

function makeMocks() {
  return {
    accounts: { findActiveTenantIds: vi.fn().mockResolvedValue(['t1']) },
    repo: {
      getSettings: vi.fn().mockResolvedValue({ enabled: true, daysAfter: 15, discountPercent: 10, message: null }),
      upsertSettings: vi.fn(),
      findCanceledSubsWithoutCase: vi.fn().mockResolvedValue([]),
      createCase: vi.fn().mockResolvedValue({}),
      findDueCases: vi.fn().mockResolvedValue([]),
      claimForSending: vi.fn().mockResolvedValue(true), // claim atômico (spec 0054)
      revertToPending: vi.fn().mockResolvedValue(undefined),
      markSent: vi.fn().mockResolvedValue({}),
      markSkipped: vi.fn().mockResolvedValue({}),
      summary: vi.fn(),
    },
    invoices: {
      create: vi.fn().mockResolvedValue({ id: 'wb-inv-1' }),
      attachCharge: vi.fn().mockResolvedValue({ id: 'wb-inv-1', status: 'PENDING', pixCopyPaste: 'PIX' }),
    },
    paymentSettings: { getForCurrentTenant: vi.fn().mockResolvedValue({}) },
    notifications: { queueOverdueInvoices: vi.fn().mockResolvedValue(undefined) },
    gateway: { createCharge: vi.fn().mockResolvedValue({ gatewayId: 'g1', pixCopyPaste: 'PIX', pixQrCode: null, checkoutUrl: null }) },
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new WinbackService(m as any);

const dueCase = (over: any = {}) => ({
  id: 'wc1', eligibleAt: new Date('2026-07-01T00:00:00Z'),
  clientId: 'c1',
  subscription: { amount: 100, description: 'Plano Mensal' },
  client: { name: 'Ana', phone: '11999999999', document: '12345678900' },
  ...over,
});

describe('WinbackService (spec 0045 — F5)', () => {
  let m: ReturnType<typeof makeMocks>;
  const now = new Date('2026-07-20T00:00:00Z'); // 19 dias depois do eligibleAt
  beforeEach(() => (m = makeMocks()));

  it('desligado → não faz nada', async () => {
    m.repo.getSettings.mockResolvedValue({ enabled: false, daysAfter: 15, discountPercent: 10, message: null });
    m.repo.findCanceledSubsWithoutCase.mockResolvedValue([{ id: 's1', clientId: 'c1' }]);
    const r = await svc(m).runAllTenants(now);
    expect(r.enrolled).toBe(0);
    expect(m.repo.createCase).not.toHaveBeenCalled();
  });

  it('inscreve assinaturas canceladas sem caso (relógio começa agora)', async () => {
    m.repo.findCanceledSubsWithoutCase.mockResolvedValue([{ id: 's1', clientId: 'c1' }, { id: 's2', clientId: 'c2' }]);
    const r = await svc(m).runAllTenants(now);
    expect(r.enrolled).toBe(2);
    expect(m.repo.createCase).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: 's1', eligibleAt: now }));
  });

  it('dispara oferta de retorno: cobrança com desconto + mensagem + markSent', async () => {
    m.repo.findDueCases.mockResolvedValue([dueCase()]);
    const r = await svc(m).runAllTenants(now);
    expect(r.sent).toBe(1);
    // valor cobrado = 100 - 10% = 90
    expect(Number(m.invoices.create.mock.calls[0][0].value)).toBe(90);
    expect(m.gateway.createCharge).toHaveBeenCalledWith(expect.objectContaining({ amount: 90 }));
    // mensagem enfileirada pro cliente certo
    const dto = m.notifications.queueOverdueInvoices.mock.calls[0][0][0];
    expect(dto).toMatchObject({ id: 'wb-inv-1', phone: '11999999999', clientName: 'Ana', value: 90 });
    expect(dto.message).toContain('Ana');
    expect(m.repo.markSent).toHaveBeenCalledWith('wc1', 'wb-inv-1', now);
  });

  it('não cobra quando o claim atômico falha (outro sweep já pegou) — anti-cobrança-dupla (spec 0054)', async () => {
    m.repo.findDueCases.mockResolvedValue([dueCase()]);
    m.repo.claimForSending.mockResolvedValue(false); // corrida perdida
    const r = await svc(m).runAllTenants(now);
    expect(r.sent).toBe(0);
    expect(m.invoices.create).not.toHaveBeenCalled();
    expect(m.gateway.createCharge).not.toHaveBeenCalled();
  });

  it('cobrança falha antes de criar → devolve o caso a pending (retry) e não deixa fatura órfã', async () => {
    m.repo.findDueCases.mockResolvedValue([dueCase()]);
    m.gateway.createCharge.mockRejectedValue(new Error('gateway down'));
    const r = await svc(m).runAllTenants(now);
    expect(r.skipped).toBe(1);
    expect(m.repo.revertToPending).toHaveBeenCalledWith('wc1');
    expect(m.repo.markSent).not.toHaveBeenCalled();
  });

  it('pula caso sem telefone (não cobra, marca skipped)', async () => {
    m.repo.findDueCases.mockResolvedValue([dueCase({ client: { name: 'Sem Fone', phone: '', document: 'x' } })]);
    const r = await svc(m).runAllTenants(now);
    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(1);
    expect(m.invoices.create).not.toHaveBeenCalled();
    expect(m.repo.markSkipped).toHaveBeenCalledWith('wc1');
  });

  it('não dispara caso ainda dentro da janela (eligibleAt recente)', async () => {
    // eligibleAt só 5 dias atrás, janela 15 → isDueForWinback false
    m.repo.findDueCases.mockResolvedValue([dueCase({ eligibleAt: new Date(now.getTime() - 5 * DIA) })]);
    const r = await svc(m).runAllTenants(now);
    expect(r.sent).toBe(0);
    expect(m.invoices.create).not.toHaveBeenCalled();
  });

  it('updateSettings clampa dias (0..180) e desconto (0..90)', async () => {
    m.repo.upsertSettings.mockResolvedValue({});
    await svc(m).updateSettings({ daysAfter: 999, discountPercent: 200 });
    expect(m.repo.upsertSettings).toHaveBeenCalledWith(expect.objectContaining({ daysAfter: 180, discountPercent: 90 }));
  });
});
