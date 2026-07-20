import { CockpitRepository } from '../repositories/cockpit.repository.js';
import { InvoiceStatus } from '../domain/status.js';
import { DEFAULT_HESITATION_OPENS } from '../domain/interaction.js';
import {
  summarizeOpenInvoices,
  inadimplenciaRate,
  dueWithinDays,
  round2,
} from '../domain/cockpit.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 4 casas para a taxa (0..1). */
function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Serviço do Cockpit (M4, spec 0017): compõe o painel a partir do repositório. */
export class CockpitService {
  private repo: CockpitRepository;

  constructor(deps?: { repo?: CockpitRepository }) {
    this.repo = deps?.repo ?? new CockpitRepository();
  }

  /**
   * Painel do dono. `now` é injetável para teste. Uma leitura das faturas em
   * aberto alimenta KPIs, aging e "vence essa semana" (tudo puro); os demais
   * números vêm de agregações dedicadas.
   */
  async getOverview(days: number, now: Date = new Date()) {
    const since = new Date(now.getTime() - days * DAY_MS);

    const [open, recebidoNoPeriodo, porStatus, hesitando] = await Promise.all([
      this.repo.findOpenInvoices(),
      this.repo.sumReceivedSince(since),
      this.repo.countByStatus(),
      this.repo.findHesitating(DEFAULT_HESITATION_OPENS),
    ]);

    const s = summarizeOpenInvoices(open, now);

    const vencemEssaSemana = dueWithinDays(open, now, 7).map((i) => ({
      invoiceId: i.id,
      clientName: i.clientName,
      value: round2(i.value),
      dueDate: i.dueDate,
    }));

    return {
      periodoDias: days,
      kpis: {
        aReceber: round2(s.aReceber),
        aVencer: round2(s.aVencer),
        emAtraso: round2(s.emAtraso),
        taxaInadimplencia: round4(inadimplenciaRate(s.emAtraso, s.aReceber)),
        recebidoNoPeriodo: round2(recebidoNoPeriodo),
      },
      porStatus: {
        PENDING: porStatus[InvoiceStatus.PENDING] ?? 0,
        PAID: porStatus[InvoiceStatus.PAID] ?? 0,
        OVERDUE: porStatus[InvoiceStatus.OVERDUE] ?? 0,
        FAILED: porStatus[InvoiceStatus.FAILED] ?? 0,
      },
      aging: {
        aVencer: round2(s.aging.aVencer),
        d0a30: round2(s.aging.d0a30),
        d31a60: round2(s.aging.d31a60),
        d60mais: round2(s.aging.d60mais),
      },
      acoes: {
        vencemEssaSemana,
        hesitando: hesitando.map((h) => ({ ...h, value: round2(h.value) })),
      },
    };
  }
}
