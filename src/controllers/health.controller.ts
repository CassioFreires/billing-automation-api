import { Request, Response } from 'express';
import prisma from '../database/prisma.js';
import { rabbitMQ } from '../config/rabbitmql.config.js';

export class HealthController {

  async check(req: Request, res: Response) {

    try {

      await prisma.$queryRaw`SELECT 1`;

      return res.status(200).json({
        status: 'UP',
        database: 'UP',
        rabbitmq: rabbitMQ.isConnected
          ? 'UP'
          : 'DOWN',
        timestamp: new Date().toISOString()
      });

    } catch {

      return res.status(503).json({
        status: 'DOWN',
        timestamp: new Date().toISOString()
      });

    }
  }
}