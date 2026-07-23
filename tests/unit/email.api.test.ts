import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LogOnlyEmailProvider,
  EmailAPI,
  resolveEmailProviderFromEnv,
  requireSmtpConfig,
  SmtpEmailProvider,
} from '../../src/apis/email.api.js';

const sendMail = vi.fn();
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail })),
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const SMTP_ENVS = ['EMAIL_PROVIDER', 'EMAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE'];
const savedEnv: Record<string, string | undefined> = {};

describe('EmailAPI (spec 0032) — mock-first', () => {
  it('LogOnlyEmailProvider não envia de verdade e reporta sucesso', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const provider = new LogOnlyEmailProvider();
    const res = await provider.send({ to: 'x@y.com', subject: 'S', body: 'B' });
    expect(res.success).toBe(true);
    expect(res.provider).toBe('log');
    expect(res.to).toBe('x@y.com');
    spy.mockRestore();
  });

  it('resolveEmailProviderFromEnv usa log por padrão', () => {
    const prev = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;
    expect(resolveEmailProviderFromEnv().name).toBe('log');
    if (prev !== undefined) process.env.EMAIL_PROVIDER = prev;
  });

  it('EmailAPI delega ao provider injetado', async () => {
    const send = vi.fn().mockResolvedValue({ success: true, provider: 'fake', to: 'a@b.com' });
    const api = new EmailAPI({ name: 'fake', send });
    const res = await api.sendEmail({ to: 'a@b.com', subject: 'S', body: 'B' });
    expect(send).toHaveBeenCalledOnce();
    expect(res.provider).toBe('fake');
  });
});

describe('SmtpEmailProvider (spec 0032) — envio real via SMTP', () => {
  beforeEach(() => {
    for (const k of SMTP_ENVS) savedEnv[k] = process.env[k];
    sendMail.mockReset();
  });
  afterEach(() => {
    for (const k of SMTP_ENVS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('requireSmtpConfig lança quando faltam variáveis essenciais', () => {
    for (const k of SMTP_ENVS) delete process.env[k];
    expect(() => requireSmtpConfig()).toThrow(/SMTP_HOST/);
  });

  it('requireSmtpConfig deriva secure=true na porta 465 e false na 587', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.EMAIL_FROM = 'Adimplo <no-reply@ex.com>';

    process.env.SMTP_PORT = '465';
    delete process.env.SMTP_SECURE;
    expect(requireSmtpConfig().secure).toBe(true);

    process.env.SMTP_PORT = '587';
    expect(requireSmtpConfig().secure).toBe(false);

    // SMTP_SECURE sobrescreve a derivação por porta
    process.env.SMTP_SECURE = 'true';
    expect(requireSmtpConfig().secure).toBe(true);
  });

  it('send() usa o remetente da config e reporta sucesso com messageId', async () => {
    sendMail.mockResolvedValue({ messageId: '<abc@ex.com>' });
    const provider = new SmtpEmailProvider({
      host: 'smtp.example.com', port: 587, secure: false,
      user: 'u', pass: 'p', from: 'Adimplo <no-reply@ex.com>',
    });
    const res = await provider.send({ to: 'cli@ex.com', subject: 'Cobrança', body: 'Olá' });
    expect(res.success).toBe(true);
    expect(res.provider).toBe('smtp');
    expect(res.providerMessageId).toBe('<abc@ex.com>');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Adimplo <no-reply@ex.com>', to: 'cli@ex.com', subject: 'Cobrança', text: 'Olá' })
    );
  });

  it('send() captura falha do transporte e retorna success=false com erro', async () => {
    sendMail.mockRejectedValue(new Error('conexão recusada'));
    const provider = new SmtpEmailProvider({
      host: 'smtp.example.com', port: 587, secure: false,
      user: 'u', pass: 'p', from: 'no-reply@ex.com',
    });
    const res = await provider.send({ to: 'cli@ex.com', subject: 'S', body: 'B' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/conexão recusada/);
  });

  it('resolveEmailProviderFromEnv retorna SmtpEmailProvider quando EMAIL_PROVIDER=smtp', () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'p';
    process.env.EMAIL_FROM = 'no-reply@ex.com';
    expect(resolveEmailProviderFromEnv().name).toBe('smtp');
  });
});
