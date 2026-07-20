import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { InteractionEventRepository } from '../repositories/interaction-event.repository.js';
import { InteractionType, InteractionChannel } from '../domain/interaction.js';

const invoiceRepository = new InvoiceRepository();
const events = new InteractionEventRepository();

/** Hash do IP com salt (RN-ELO6) — nunca guardar IP cru. Curto: só de-dup grosso. */
function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const salt = process.env.EVENT_IP_SALT ?? '';
  return createHash('sha256').update(salt + ip).digest('hex').slice(0, 16);
}

/** Escapa o mínimo para renderizar o PIX no HTML de fallback com segurança. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPixFallback(pix: string | null | undefined): string {
  const safe = pix ? escapeHtml(pix) : '';
  const body = safe
    ? `<p>Copie o código PIX abaixo para pagar:</p><pre style="white-space:pre-wrap;word-break:break-all;background:#f4f4f5;padding:16px;border-radius:8px">${safe}</pre>`
    : `<p>Cobrança sem forma de pagamento disponível. Fale com quem enviou a cobrança.</p>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px">${body}</body></html>`;
}

/**
 * Rota PÚBLICA do link do Elo (spec 0016): `GET /r/:token`.
 * Registra a ABERTURA (evento `open`) e redireciona para o pagamento real.
 * O `tenantId` vem da própria fatura (entrada global — RN-ELO4).
 */
export async function openLink(req: Request<{ token: string }>, res: Response) {
  const token = req.params.token;
  const invoice = await invoiceRepository.findByLinkToken(token);

  if (!invoice) {
    return res.status(404).json({ error: 'Link inválido ou expirado.' });
  }

  // Registra a abertura (best-effort: não bloqueia o pagamento se falhar).
  try {
    const ua = req.headers['user-agent'];
    const metadata: Record<string, string> = {};
    if (typeof ua === 'string') metadata.ua = ua.slice(0, 180);
    const ipHash = hashIp(req.ip);
    if (ipHash) metadata.ipHash = ipHash;

    await events.record({
      type: InteractionType.OPEN,
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      channel: InteractionChannel.WEB,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });
  } catch (err) {
    console.error('⚠️ Falha ao registrar evento open (segue o redirect):', err);
  }

  // Destino: checkout hospedado do gateway; sem ele, página mínima com o PIX.
  if (invoice.checkoutUrl) {
    return res.redirect(302, invoice.checkoutUrl);
  }
  return res.status(200).type('html').send(renderPixFallback(invoice.pixCopyPaste));
}
