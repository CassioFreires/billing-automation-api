import { Request, Response } from 'express';
import { OnboardingService } from '../services/onboarding.service.js';
import { validateUpdateOnboarding } from '../dtos/onboarding.dto.js';

/** Onboarding guiado do tenant (spec 0021). */
export class OnboardingController {
  private service: OnboardingService;

  constructor(deps?: { service?: OnboardingService }) {
    this.service = deps?.service ?? new OnboardingService();
  }

  async get(_req: Request, res: Response) {
    try {
      const status = await this.service.getStatus();
      return res.json(status);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const data = validateUpdateOnboarding(req.body);
      const status = await this.service.update(data);
      return res.json(status);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }
}
