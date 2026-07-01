import { timingSafeEqual } from 'node:crypto';
import {
  ChargeResult,
  CreateChargeInput,
  InvoiceStatus,
  PaymentGatewayProvider,
  WebhookRequest,
  WebhookResult,
} from './types.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const VALID_STATUS: InvoiceStatus[] = ['PENDING', 'PAID', 'OVERDUE', 'FAILED'];

/**
 * Provider padrão: NÃO integra gateway real — gera dados simulados.
 * Preserva o comportamento atual (default do projeto). O webhook do mock
 * é o contrato interno/n8n: body { gatewayId, status, paidAt?, eventId? }
 * autenticado por `x-webhook-secret` (env WEBHOOK_SECRET).
 */
export class MockPaymentGateway implements PaymentGatewayProvider {
  readonly name = 'mock';

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    return {
      gatewayId: 'pay_' + Math.random().toString(36).slice(2),
      pixCopyPaste: '00020101021226880014br.gov.bcb.pix_MOCK_' + input.reference,
    };
  }

  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null> {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('WEBHOOK_NOT_CONFIGURED');
    }

    const provided = req.headers['x-webhook-secret'];
    if (typeof provided !== 'string' || !safeEqual(provided, secret)) {
      throw new Error('WEBHOOK_INVALID_SIGNATURE');
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const gatewayId = body.gatewayId;
    const status = body.status;

    if (typeof gatewayId !== 'string' || typeof status !== 'string') {
      return null;
    }
    if (!VALID_STATUS.includes(status as InvoiceStatus)) {
      return null;
    }

    return {
      eventId: typeof body.eventId === 'string' ? body.eventId : undefined,
      gatewayId,
      status: status as InvoiceStatus,
      paidAt: typeof body.paidAt === 'string' ? new Date(body.paidAt) : undefined,
    };
  }
}
