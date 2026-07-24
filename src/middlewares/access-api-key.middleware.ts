import { Request, Response, NextFunction } from 'express';
import { AccessIntegrationRepository } from '../repositories/access-integration.repository.js';
import { hashApiKey } from '../services/access-integration.service.js';
import { runWithTenant } from '../context/tenant-context.js';

const repo = new AccessIntegrationRepository();

/**
 * Conexão IoT/Catracas (spec 0043, F13). Autentica o EQUIPAMENTO (catraca,
 * fechadura, streaming) por API key — não por JWT (é máquina, não pessoa).
 * Resolve o tenant a partir do hash da chave e roda a request no contexto dele.
 * Falha fechado e sem revelar detalhe (401 genérico); exige integração ligada.
 */
export function accessApiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('x-api-key') ?? '';
  if (!provided) {
    res.status(401).json({ error: 'API key ausente' });
    return;
  }
  repo
    .findByApiKeyHash(hashApiKey(provided))
    .then((integ) => {
      if (!integ || !integ.enabled) {
        res.status(401).json({ error: 'API key inválida' });
        return;
      }
      runWithTenant(integ.tenantId, () => next());
    })
    .catch((e) => res.status(500).json({ error: e.message }));
}
