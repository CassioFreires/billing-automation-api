/**
 * Erro que NÃO se resolve com nova tentativa (mensagem malformada, payload
 * sem os dados obrigatórios, etc.). Sinaliza ao worker que a mensagem deve ir
 * DIRETO para a DLQ, em vez de gastar as reentregas do `x-delivery-limit`.
 */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

/**
 * Decide o destino de uma mensagem que falhou no worker:
 * - **permanente** (`PermanentError`) → NÃO recoloca na fila → o `nack` sem
 *   requeue manda direto para a DLQ (via DLX). Evita loop e retries inúteis.
 * - **transitório** (qualquer outro erro) → recoloca; o retry é limitado pelo
 *   `x-delivery-limit` da quorum queue (após N, vai para a DLQ).
 */
export function shouldRequeue(err: unknown): boolean {
  return !(err instanceof PermanentError);
}
