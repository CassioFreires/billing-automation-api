import { Request, Response } from 'express';

export class HealthController {
  async check(req: Request, res: Response) {
    return res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString()
    });
  }
}