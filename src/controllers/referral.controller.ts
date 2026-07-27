import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ReferralService, ReferralError, RE } from '../services/referral.service.js';
import { validateReferralSettings, validateReferralCapture } from '../dtos/referral.dto.js';

/**
 * Indique e Ganhe (spec 0046, F16).
 * - DONO (JWT): config, lista, resumo e o código/link de indicação de um cliente.
 * - PÚBLICO (link de indicação, sem JWT): info da página + captura do amigo.
 */
export class ReferralController {
  private service: ReferralService;
  constructor() {
    this.service = new ReferralService();
  }

  // --- Dono (JWT) ---
  getSettings = async (_req: Request, res: Response) => {
    try { return res.status(200).json(await this.service.getSettings()); }
    catch (e: any) { return res.status(500).json({ error: e.message }); }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const dto = validateReferralSettings(req.body);
      return res.status(200).json(await this.service.updateSettings(dto));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      return res.status(500).json({ error: e.message });
    }
  };

  list = async (_req: Request, res: Response) => {
    try { return res.status(200).json(await this.service.list()); }
    catch (e: any) { return res.status(500).json({ error: e.message }); }
  };

  summary = async (_req: Request, res: Response) => {
    try { return res.status(200).json(await this.service.summary()); }
    catch (e: any) { return res.status(500).json({ error: e.message }); }
  };

  /** Código/link de indicação de um cliente (gera na 1ª vez). */
  code = async (req: Request, res: Response) => {
    try {
      const baseUrl = process.env.WEB_APP_URL ?? '';
      return res.status(200).json(await this.service.ensureCode(String(req.params.clientId), baseUrl));
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  };

  // --- Público ---
  publicInfo = async (req: Request<{ code: string }>, res: Response) => {
    try {
      return res.status(200).json(await this.service.publicInfo(req.params.code));
    } catch (e: any) {
      if (e instanceof ReferralError && e.message === RE.CODE_NOT_FOUND) return res.status(404).json({ error: 'Link de indicação inválido.' });
      return res.status(500).json({ error: 'Erro ao carregar a indicação.' });
    }
  };

  capture = async (req: Request<{ code: string }>, res: Response) => {
    try {
      const dto = validateReferralCapture(req.body);
      return res.status(201).json(await this.service.capture(req.params.code, dto));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: 'Dados inválidos.' });
      if (e instanceof ReferralError) {
        if (e.message === RE.CODE_NOT_FOUND) return res.status(404).json({ error: 'Link de indicação inválido.' });
        if (e.message === RE.DISABLED) return res.status(409).json({ error: 'O programa de indicação não está ativo.' });
        if (e.message === RE.ALREADY_CLIENT) return res.status(409).json({ error: 'Esse telefone já é cliente.' });
      }
      console.error('❌ referral capture:', e);
      return res.status(500).json({ error: 'Não foi possível registrar a indicação.' });
    }
  };
}
