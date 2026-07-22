import { describe, it, expect, vi } from 'vitest';
import { CockpitService } from '../../src/services/cockpit.service.js';

const NOW = new Date('2026-07-20T12:00:00Z');
const d = (iso: string) => new Date(iso);

function makeService() {
  const repo = {
    findOpenInvoices: vi.fn(),
    sumReceivedSince: vi.fn(),
    sumRecoveredSince: vi.fn().mockResolvedValue(0),
    countByStatus: vi.fn(),
    findHesitating: vi.fn(),
  };
  const service = new CockpitService({ repo: repo as any });
  return { service, repo };
}

describe('CockpitService.getOverview', () => {
  it('compõe KPIs, aging, porStatus e ações', async () => {
    const { service, repo } = makeService();
    repo.findOpenInvoices.mockResolvedValue([
      { id: 'a', value: 100, dueDate: d('2026-07-25T12:00:00Z'), clientName: 'Ana' }, // a vencer (+5d)
      { id: 'b', value: 300, dueDate: d('2026-06-01T12:00:00Z'), clientName: 'Bruno' }, // ~49d atraso
    ]);
    repo.sumReceivedSince.mockResolvedValue(555.5);
    repo.sumRecoveredSince.mockResolvedValue(240);
    repo.countByStatus.mockResolvedValue({ PENDING: 2, PAID: 7 });
    repo.findHesitating.mockResolvedValue([
      { invoiceId: 'b', clientName: 'Bruno', value: 300, opens: 4 },
    ]);

    const r = await service.getOverview(30, NOW);

    expect(r.periodoDias).toBe(30);
    expect(r.kpis.aReceber).toBe(400);
    expect(r.kpis.aVencer).toBe(100);
    expect(r.kpis.emAtraso).toBe(300);
    expect(r.kpis.taxaInadimplencia).toBe(0.75); // 300/400
    expect(r.kpis.recebidoNoPeriodo).toBe(555.5);
    expect(r.kpis.recuperadoNoPeriodo).toBe(240); // pagos após o vencimento (spec 0025)

    // porStatus preenche os 4 status (default 0 nos ausentes)
    expect(r.porStatus).toEqual({ PENDING: 2, PAID: 7, OVERDUE: 0, FAILED: 0 });

    expect(r.aging).toEqual({ aVencer: 100, d0a30: 0, d31a60: 300, d60mais: 0 });

    // ações: só a 'a' vence essa semana; 'b' aparece em hesitando (do Elo)
    expect(r.acoes.vencemEssaSemana.map((i: any) => i.invoiceId)).toEqual(['a']);
    expect(r.acoes.hesitando[0]).toMatchObject({ invoiceId: 'b', opens: 4 });
  });

  it('passa a data de corte correta para os recebimentos (days)', async () => {
    const { service, repo } = makeService();
    repo.findOpenInvoices.mockResolvedValue([]);
    repo.sumReceivedSince.mockResolvedValue(0);
    repo.countByStatus.mockResolvedValue({});
    repo.findHesitating.mockResolvedValue([]);

    await service.getOverview(7, NOW);

    const since = repo.sumReceivedSince.mock.calls[0][0] as Date;
    expect(since.toISOString()).toBe('2026-07-13T12:00:00.000Z'); // NOW - 7d
  });

  it('tudo zero quando não há faturas (sem divisão por zero)', async () => {
    const { service, repo } = makeService();
    repo.findOpenInvoices.mockResolvedValue([]);
    repo.sumReceivedSince.mockResolvedValue(0);
    repo.countByStatus.mockResolvedValue({});
    repo.findHesitating.mockResolvedValue([]);

    const r = await service.getOverview(30, NOW);
    expect(r.kpis.aReceber).toBe(0);
    expect(r.kpis.taxaInadimplencia).toBe(0);
    expect(r.acoes.vencemEssaSemana).toEqual([]);
    expect(r.acoes.hesitando).toEqual([]);
  });
});
