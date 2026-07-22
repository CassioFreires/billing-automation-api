import { Request, Response } from 'express';
import { PaymentSettingService } from '../services/payment-setting.service.js';
import { validateUpdatePaymentSettings } from '../dtos/paymentSettings.dto.js';
import { WhatsappSettingService } from '../services/whatsapp-setting.service.js';
import { validateUpdateWhatsappSettings } from '../dtos/whatsappSettings.dto.js';
import { NegotiationSettingService } from '../services/negotiation-setting.service.js';
import { validateUpdateNegotiationSettings } from '../dtos/negotiationSettings.dto.js';
import { ReguaSettingService } from '../services/regua-setting.service.js';
import { validateUpdateReguaSettings } from '../dtos/reguaSettings.dto.js';
import { ChannelSettingService } from '../services/channel-setting.service.js';
import { validateUpdateChannelSettings } from '../dtos/channelSettings.dto.js';

export class SettingsController {
  private paymentSettings: PaymentSettingService;
  private whatsappSettings: WhatsappSettingService;
  private negotiationSettings: NegotiationSettingService;
  private reguaSettings: ReguaSettingService;
  private channelSettings: ChannelSettingService;

  constructor() {
    this.paymentSettings = new PaymentSettingService();
    this.whatsappSettings = new WhatsappSettingService();
    this.negotiationSettings = new NegotiationSettingService();
    this.reguaSettings = new ReguaSettingService();
    this.channelSettings = new ChannelSettingService();
  }

  async getPayment(_req: Request, res: Response) {
    try {
      const settings = await this.paymentSettings.get();
      return res.json(settings);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  async updatePayment(req: Request, res: Response) {
    try {
      const data = validateUpdatePaymentSettings(req.body);
      const settings = await this.paymentSettings.update(data);
      return res.json(settings);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async getWhatsapp(_req: Request, res: Response) {
    try {
      const settings = await this.whatsappSettings.getMasked();
      return res.json(settings);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  async updateWhatsapp(req: Request, res: Response) {
    try {
      const data = validateUpdateWhatsappSettings(req.body);
      const settings = await this.whatsappSettings.update(data);
      return res.json(settings);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  // Regras de autonegociação do tenant (spec 0018 — M2).
  async getNegotiation(_req: Request, res: Response) {
    try {
      const settings = await this.negotiationSettings.get();
      return res.json(settings);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  async updateNegotiation(req: Request, res: Response) {
    try {
      const data = validateUpdateNegotiationSettings(req.body);
      const settings = await this.negotiationSettings.update(data);
      return res.json(settings);
    } catch (error: any) {
      // Botão de Alívio é recurso do plano Pro (spec 0020).
      if (error?.message === 'PLAN_FEATURE_REQUIRED') {
        return res.status(402).json({
          error: 'O Botão de Alívio faz parte do plano Pro. Faça upgrade para ativar.',
          code: 'PLAN_FEATURE_REQUIRED',
        });
      }
      return res.status(400).json({ error: error.message });
    }
  }

  // Régua de cobrança do tenant (spec 0026).
  async getRegua(_req: Request, res: Response) {
    try {
      const settings = await this.reguaSettings.get();
      return res.json(settings);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  async updateRegua(req: Request, res: Response) {
    try {
      const data = validateUpdateReguaSettings(req.body);
      const settings = await this.reguaSettings.update(data);
      return res.json(settings);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  // Canal de envio das cobranças do tenant (spec 0032).
  async getChannel(_req: Request, res: Response) {
    try {
      const settings = await this.channelSettings.get();
      return res.json(settings);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  async updateChannel(req: Request, res: Response) {
    try {
      const data = validateUpdateChannelSettings(req.body);
      const settings = await this.channelSettings.update(data);
      return res.json(settings);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }
}
