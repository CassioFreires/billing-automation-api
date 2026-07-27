import { randomBytes } from 'node:crypto';
import type { FiscalProvider, EmitInput, EmitResult, FiscalWebhookResult } from './index.js';

/**
 * Provider fiscal SIMULADO (spec 0047). Emite a nota na hora (síncrono), com
 * número/PDF/XML fake — o ciclo inteiro roda local sem conta de NFS-e real.
 * Não há webhook (a emissão já volta `Issued`); cancelar volta `Cancelled`.
 */
export class MockFiscalProvider implements FiscalProvider {
  async emit(input: EmitInput): Promise<EmitResult> {
    const id = `mock_${randomBytes(8).toString('hex')}`;
    const number = `NFSE-MOCK-${randomBytes(3).toString('hex').toUpperCase()}`;
    return {
      providerId: id,
      status: 'Issued',
      number,
      pdfUrl: `https://mock.nfse.local/${id}.pdf`,
      xmlUrl: `https://mock.nfse.local/${id}.xml`,
      message: `Nota simulada de ${input.description}`,
    };
  }

  async cancel(_providerId: string): Promise<{ status: string }> {
    return { status: 'Cancelled' };
  }

  verifyWebhook(): FiscalWebhookResult | null {
    // Mock não dispara webhook (emissão é síncrona).
    return null;
  }
}
