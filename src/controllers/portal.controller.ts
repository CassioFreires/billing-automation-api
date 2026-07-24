import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { ZodError } from 'zod';
import { PortalService } from '../services/portal.service.js';
import { NotFoundError, BadRequestError } from '../services/contract.service.js';
import { validateAcceptContract } from '../dtos/contract.dto.js';

/** Hash salgado do IP para prova de aceite (LGPD-mínimo, igual ao Elo — RN-ELO6). */
function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const salt = process.env.EVENT_IP_SALT ?? '';
  return createHash('sha256').update(salt + ip).digest('hex').slice(0, 16);
}

/** Base pública da API (para os links do Elo /r/:token). */
function apiBaseUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}
/** Base do app web (para o link do portal /portal/:token). */
function webAppUrl(): string {
  return (process.env.WEB_APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
}

export class PortalController {
  private service: PortalService;

  constructor(deps?: { service?: PortalService }) {
    this.service = deps?.service ?? new PortalService();
  }

  /** Rota PÚBLICA: visão do pagador por portalToken (spec 0027). */
  getByToken = async (req: Request<{ token: string }>, res: Response): Promise<void> => {
    try {
      const view = await this.service.getByToken(String(req.params.token), apiBaseUrl());
      if (!view) {
        res.status(404).json({ error: 'Portal não encontrado.' });
        return;
      }
      res.status(200).json(view);
    } catch (error: any) {
      console.error('❌ Erro no portal do pagador:', error);
      res.status(500).json({ error: 'Erro ao carregar o portal.' });
    }
  };

  /** Ação do dono (JWT): gera/recupera o link do portal de um cliente. */
  getPortalLink = async (req: Request, res: Response): Promise<void> => {
    try {
      const url = await this.service.getPortalLink(String(req.params.id), webAppUrl());
      if (!url) {
        res.status(404).json({ error: 'Cliente não encontrado.' });
        return;
      }
      res.status(200).json({ url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /** Rota PÚBLICA: aceite do contrato no Portal (spec 0040), com prova. */
  acceptContract = async (req: Request<{ token: string }>, res: Response): Promise<void> => {
    try {
      const dto = validateAcceptContract(req.body);
      const result = await this.service.acceptContract(
        String(req.params.token),
        { name: dto.name, document: dto.document ?? null },
        { ipHash: hashIp(req.ip), userAgent: req.get('user-agent') ?? null }
      );
      if (!result) {
        res.status(404).json({ error: 'Portal não encontrado.' });
        return;
      }
      res.status(201).json(result);
    } catch (error: any) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.issues });
        return;
      }
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof BadRequestError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('❌ Erro no aceite de contrato:', error);
      res.status(500).json({ error: 'Erro ao registrar o aceite.' });
    }
  };

  /** Rota PÚBLICA: serve o PDF do contrato do tenant (spec 0041). */
  getContractFile = async (req: Request<{ token: string }>, res: Response): Promise<void> => {
    try {
      const f = await this.service.getContractFile(String(req.params.token));
      if (!f) {
        res.status(404).json({ error: 'Contrato não encontrado.' });
        return;
      }
      res.setHeader('Content-Type', f.fileMime);
      res.setHeader('Content-Disposition', `inline; filename="${f.fileName}"`);
      res.send(f.data);
    } catch (error: any) {
      console.error('❌ Erro ao servir contrato:', error);
      res.status(500).json({ error: 'Erro ao carregar o contrato.' });
    }
  };
}
