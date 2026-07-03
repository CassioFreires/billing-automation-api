import { SubscriptionRepository } from '../repositories/subscription.repository.js';
import { InvoiceService } from './invoice.service.js';
import {
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
} from '../dtos/subscription.dto.js';
import { firstRunDate, nextMonth, periodOf } from '../utils/recurrence.js';

export interface RunResult {
  processadas: number; // assinaturas vencidas avaliadas
  geradas: number;     // faturas efetivamente criadas
  ignoradas: number;   // já existiam para a competência (idempotência)
}

export class SubscriptionService {
  private repository: SubscriptionRepository;
  private invoiceService: InvoiceService;

  constructor(deps?: {
    repository?: SubscriptionRepository;
    invoiceService?: InvoiceService;
  }) {
    this.repository = deps?.repository ?? new SubscriptionRepository();
    this.invoiceService = deps?.invoiceService ?? new InvoiceService();
  }

  async create(data: CreateSubscriptionDTO) {
    const start = data.startDate ?? new Date();
    const nextRunDate = firstRunDate(data.dayOfMonth, start);

    return this.repository.create({
      clientId: data.clientId,
      description: data.description,
      amount: data.amount,
      dayOfMonth: data.dayOfMonth,
      startDate: start,
      nextRunDate,
    });
  }

  async findAll() {
    return this.repository.findAll();
  }

  async findById(id: string) {
    const sub = await this.repository.findById(id);
    if (!sub) {
      throw new Error('Assinatura não encontrada.');
    }
    return sub;
  }

  async update(id: string, data: UpdateSubscriptionDTO) {
    await this.findById(id);
    return this.repository.update(id, data);
  }

  async delete(id: string) {
    await this.findById(id);
    return this.repository.delete(id);
  }

  /**
   * Gera as faturas das assinaturas ATIVAS vencidas (nextRunDate <= agora),
   * uma competência por assinatura por execução. Idempotente por [assinatura, período].
   * Chamado pelo agendador externo (n8n) via POST /api/subscriptions/run.
   */
  async run(now: Date = new Date()): Promise<RunResult> {
    const due = await this.repository.findDueActive(now);

    let geradas = 0;
    let ignoradas = 0;

    for (const sub of due) {
      const period = periodOf(sub.nextRunDate);
      const dueDate = sub.nextRunDate;

      const { created } = await this.invoiceService.createForSubscription({
        subscriptionId: sub.id,
        clientId: sub.clientId,
        description: sub.description,
        amount: sub.amount,
        dueDate,
        period,
      });

      if (created) {
        geradas++;
      } else {
        ignoradas++;
      }

      // Avança para a próxima competência (um mês por execução).
      await this.repository.setNextRun(sub.id, nextMonth(sub.nextRunDate, sub.dayOfMonth));
    }

    return { processadas: due.length, geradas, ignoradas };
  }
}
