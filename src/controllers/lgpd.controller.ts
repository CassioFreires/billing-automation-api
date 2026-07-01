import { Request, Response } from 'express';
import { LgpdService } from '../services/lgpd.service.js';

export class LgpdController {
  private service: LgpdService;

  constructor() {
    this.service = new LgpdService();
  }

  exportData = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.service.exportClientData(String(req.params.clientId));
      res.status(200).json(data);
    } catch (error: any) {
      if (error?.message === 'CLIENT_NOT_FOUND') {
        res.status(404).json({ error: 'Titular não encontrado' });
        return;
      }
      console.error('❌ Erro no export LGPD:', error);
      res.status(500).json({ error: 'Erro ao exportar dados' });
    }
  };

  anonymize = async (req: Request, res: Response): Promise<void> => {
    try {
      const client = await this.service.anonymizeClient(String(req.params.clientId));
      res.status(200).json({ anonymized: true, client });
    } catch (error: any) {
      if (error?.message === 'CLIENT_NOT_FOUND') {
        res.status(404).json({ error: 'Titular não encontrado' });
        return;
      }
      console.error('❌ Erro na anonimização LGPD:', error);
      res.status(500).json({ error: 'Erro ao anonimizar dados' });
    }
  };
}
