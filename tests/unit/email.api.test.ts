import { describe, it, expect, vi } from 'vitest';
import { LogOnlyEmailProvider, EmailAPI, resolveEmailProviderFromEnv } from '../../src/apis/email.api.js';

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
