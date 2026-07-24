import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AccessIntegrationService, NotConfiguredError } from '../services/access-integration.service.js';
import { validateAccessIntegration, validateAccessWebhook } from '../dtos/access.dto.js';

/**
 * Conexão IoT/Catracas (spec 0043, F13).
 * - Endpoints do DONO (JWT): configurar API key, webhook e ver o log.
 * - Endpoint da CATRACA (API key): GET /check — o equipamento pergunta se libera.
 */
export class AccessIntegrationController {
  private service: AccessIntegrationService;

  constructor() {
    this.service = new AccessIntegrationService();
  }

  getIntegration = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.getIntegration());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  setEnabled = async (req: Request, res: Response) => {
    try {
      const dto = validateAccessIntegration(req.body);
      return res.status(200).json(await this.service.setEnabled(dto.enabled ?? false));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      return res.status(500).json({ error: e.message });
    }
  };

  rotateApiKey = async (_req: Request, res: Response) => {
    try {
      // A chave crua vai UMA vez aqui — o painel mostra e não guarda.
      return res.status(200).json(await this.service.rotateApiKey());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  revokeApiKey = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.revokeApiKey());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  setWebhook = async (req: Request, res: Response) => {
    try {
      const dto = validateAccessWebhook(req.body);
      return res.status(200).json(await this.service.setWebhook(dto.webhookUrl));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      return res.status(500).json({ error: e.message });
    }
  };

  clearWebhook = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.clearWebhook());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  testWebhook = async (_req: Request, res: Response) => {
    try {
      const result = await this.service.testWebhook();
      const status = result.status === 'sent' ? 200 : 502;
      return res.status(status).json(result);
    } catch (e: any) {
      if (e instanceof NotConfiguredError) return res.status(400).json({ error: e.message });
      return res.status(500).json({ error: e.message });
    }
  };

  listEvents = async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      return res.status(200).json(await this.service.listEvents(limit));
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  /** CATRACA (API key): tenant já resolvido pelo middleware. `?client=<id>`. */
  check = async (req: Request, res: Response) => {
    try {
      const clientId = String(req.query.client ?? '');
      if (!clientId) return res.status(400).json({ error: 'Parâmetro client é obrigatório' });
      const result = await this.service.computeClientAccess(clientId);
      if (!result) return res.status(404).json({ error: 'Cliente não encontrado' });
      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };
}
