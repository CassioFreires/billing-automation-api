import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';

const original = process.env.WEBHOOK_SECRET;

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b: any) => {
    res.body = b;
    return res;
  });
  return res as Response & { statusCode: number; body: any };
}

async function loadWebhookAuth(secret?: string) {
  vi.resetModules();
  if (secret === undefined) delete process.env.WEBHOOK_SECRET;
  else process.env.WEBHOOK_SECRET = secret;
  const mod = await import('../../src/middlewares/webhook.middleware.js');
  return mod.webhookAuth;
}

afterEach(() => {
  if (original === undefined) delete process.env.WEBHOOK_SECRET;
  else process.env.WEBHOOK_SECRET = original;
});

describe('webhookAuth middleware', () => {
  it('chama next() com o segredo correto', async () => {
    const webhookAuth = await loadWebhookAuth('wh-secret');
    const req = { headers: { 'x-webhook-secret': 'wh-secret' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    webhookAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('401 com segredo errado', async () => {
    const webhookAuth = await loadWebhookAuth('wh-secret');
    const req = { headers: { 'x-webhook-secret': 'errado' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    webhookAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('401 sem o header', async () => {
    const webhookAuth = await loadWebhookAuth('wh-secret');
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    webhookAuth(req, res, next);

    expect(res.statusCode).toBe(401);
  });

  it('500 (fail-closed) quando WEBHOOK_SECRET não está configurado', async () => {
    const webhookAuth = await loadWebhookAuth(undefined);
    const req = { headers: { 'x-webhook-secret': 'qualquer' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    webhookAuth(req, res, next);

    expect(res.statusCode).toBe(500);
  });
});
