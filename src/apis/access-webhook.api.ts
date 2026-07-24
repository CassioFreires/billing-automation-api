import { signatureHeaders } from '../domain/webhook-signature.js';

/**
 * Conexão IoT/Catracas (spec 0043, F13). Seam de SAÍDA: dispara o webhook para o
 * sistema do cliente (catraca, streaming) quando o acesso de um cliente muda.
 *
 * Best-effort e isolado: uma tentativa, com timeout curto, sem retry no v1 (uma
 * fila de retry fica para o F13.1 se um piloto pedir). Nunca lança — devolve o
 * resultado para o service registrar no log (AccessEvent).
 */

export interface WebhookResult {
  status: 'sent' | 'failed';
  code?: number; // HTTP status devolvido pelo receptor
  error?: string;
}

export interface AccessWebhookPayload {
  clientId: string;
  clientName: string;
  state: string; // allowed | grace | blocked
  granted: boolean;
  previousState: string | null;
  reason: string;
  at: string; // ISO
}

const TIMEOUT_MS = 5000;

export async function dispatchAccessWebhook(
  url: string,
  secret: string,
  payload: AccessWebhookPayload,
): Promise<WebhookResult> {
  const body = JSON.stringify(payload);
  const ts = payload.at ? Date.parse(payload.at) : 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Adimplo-Webhook/1',
        ...signatureHeaders(secret, body, ts),
      },
      body,
      signal: controller.signal,
    });
    // Consome o corpo para liberar o socket, mas ignora o conteúdo.
    await res.text().catch(() => undefined);
    return { status: res.ok ? 'sent' : 'failed', code: res.status };
  } catch (e: any) {
    return { status: 'failed', error: e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}
