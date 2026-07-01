import { Request, Response } from 'express';
import { NotificationService } from '../services/notication.service.js';

type TriggerInvoiceParams = {
  invoiceId: string;
};

export class NotificationController {
  private readonly notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  async triggerOverdueNotifications(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      let overdueInvoices = req.body;

      if (
        overdueInvoices &&
        !Array.isArray(overdueInvoices) &&
        typeof overdueInvoices === 'object'
      ) {
        overdueInvoices = [overdueInvoices];
      }

      if (
        !Array.isArray(overdueInvoices) ||
        overdueInvoices.length === 0
      ) {
        return res.status(400).json({
          error:
            'O corpo da requisição deve ser um array de faturas.',
        });
      }

      const result =
        await this.notificationService.queueOverdueInvoices(
          overdueInvoices
        );

      return res.status(202).json({
        message:
          'Faturas recebidas e enviadas para a fila de processamento.',
        totalEnqueued: result.enqueued,
      });
    } catch (error) {
      console.error(
        '❌ Erro no Controller de Notificação:',
        error
      );

      return res.status(500).json({
        error:
          'Erro interno ao enfileirar notificações.',
      });
    }
  }

  async triggerByInvoice(
    req: Request<TriggerInvoiceParams>,
    res: Response
  ): Promise<Response> {
    try {
      const { invoiceId } = req.params;

      await this.notificationService.triggerByInvoice(
        invoiceId
      );


      return res.status(202).json({
        message: 'Notificação enviada para fila',
        invoiceId,
      });
    } catch (error: any) {
      if (
        error instanceof Error &&
        error.message === 'INVOICE_NOT_FOUND'
      ) {
        return res.status(404).json({
          error: 'Fatura não encontrada',
        });
      }

      console.error(
        '❌ Erro ao disparar notificação manual:',
        error
      );

      return res.status(500).json({
        error: 'Erro interno',
      });
    }
  }
}