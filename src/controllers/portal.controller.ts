import { Request, Response } from 'express';
import { PortalService } from '../services/portal.service.js';

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
}
