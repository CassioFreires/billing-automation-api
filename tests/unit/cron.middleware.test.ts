import { describe, it, expect, vi, beforeEach } from 'vitest';

// authConfig lê process.env no import → definimos ANTES de importar o middleware.
process.env.CRON_SECRET = 'top-secret';

const { cronAuth } = await import('../../src/middlewares/cron.middleware.js');

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function makeReq(secret?: string) {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'x-cron-secret' ? secret : undefined,
  } as any;
}

describe('cronAuth', () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn();
  });

  it('bloqueia (401) quando o header está ausente', () => {
    const res = makeRes();
    cronAuth(makeReq(undefined), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('bloqueia (401) quando o segredo está errado', () => {
    const res = makeRes();
    cronAuth(makeReq('errado'), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('deixa passar (next) quando o segredo confere', () => {
    const res = makeRes();
    cronAuth(makeReq('top-secret'), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });
});
