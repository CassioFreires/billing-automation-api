import { Request, Response } from 'express';
import { PaymentSettingService } from '../services/payment-setting.service.js';
import { validateUpdatePaymentSettings } from '../dtos/paymentSettings.dto.js';
import { WhatsappSettingService } from '../services/whatsapp-setting.service.js';
import { validateUpdateWhatsappSettings } from '../dtos/whatsappSettings.dto.js';

export class SettingsController {
  private paymentSettings: PaymentSettingService;
  private whatsappSettings: WhatsappSettingService;

  constructor() {
    this.paymentSettings = new PaymentSettingService();
    this.whatsappSettings = new WhatsappSettingService();
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
}
