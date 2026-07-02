import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  normalizePhoneDigits,
  requireCloudWhatsappConfig,
  CloudApiWhatsappProvider,
  LogOnlyWhatsappProvider,
  resolveProviderFromEnv,
} from '../../src/apis/whatsapp.api.js';

const WA_KEYS = [
  'WHATSAPP_PROVIDER',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_BASE_URL',
];
const original: Record<string, string | undefined> = {};
for (const k of WA_KEYS) original[k] = process.env[k];

afterEach(() => {
  for (const k of WA_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  vi.unstubAllGlobals();
});

describe('normalizePhoneDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(normalizePhoneDigits('+55 (11) 99999-8888')).toBe('5511999998888');
  });
});

describe('requireCloudWhatsappConfig', () => {
  it('lança quando faltam credenciais', () => {
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(() => requireCloudWhatsappConfig()).toThrow(/WHATSAPP_TOKEN/);
  });

  it('aplica defaults de apiVersion e baseUrl', () => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'pnid';
    delete process.env.WHATSAPP_API_VERSION;
    delete process.env.WHATSAPP_BASE_URL;
    const cfg = requireCloudWhatsappConfig();
    expect(cfg).toMatchObject({
      token: 'tok',
      phoneNumberId: 'pnid',
      apiVersion: 'v20.0',
      baseUrl: 'https://graph.facebook.com',
    });
  });
});

describe('resolveProviderFromEnv', () => {
  it('default é log', () => {
    delete process.env.WHATSAPP_PROVIDER;
    expect(resolveProviderFromEnv()).toBeInstanceOf(LogOnlyWhatsappProvider);
  });

  it('cloud resolve para CloudApiWhatsappProvider', () => {
    process.env.WHATSAPP_PROVIDER = 'cloud';
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'pnid';
    expect(resolveProviderFromEnv()).toBeInstanceOf(CloudApiWhatsappProvider);
  });

  it('provider desconhecido cai no fallback log', () => {
    process.env.WHATSAPP_PROVIDER = 'inexistente';
    expect(resolveProviderFromEnv()).toBeInstanceOf(LogOnlyWhatsappProvider);
  });
});

describe('CloudApiWhatsappProvider.send', () => {
  const cfg = {
    token: 'tok',
    phoneNumberId: 'pnid',
    apiVersion: 'v20.0',
    baseUrl: 'https://graph.facebook.com',
  };

  it('envia texto e retorna sucesso com o id da Meta', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.ABC' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const gw = new CloudApiWhatsappProvider(cfg);
    const result = await gw.send({ targetPhone: '+55 11 99999-8888', messagePayload: 'Olá' });

    expect(result).toMatchObject({
      success: true,
      provider: 'cloud',
      targetPhone: '5511999998888',
      providerMessageId: 'wamid.ABC',
    });

    // confere URL e corpo enviados
    const [url, opts] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe('https://graph.facebook.com/v20.0/pnid/messages');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '5511999998888', type: 'text' });
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('retorna success:false quando a Meta responde erro HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, text: async () => 'invalid token' }))
    );
    const gw = new CloudApiWhatsappProvider(cfg);
    const result = await gw.send({ targetPhone: '5511999998888', messagePayload: 'Olá' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('retorna success:false em erro de rede (não lança)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );
    const gw = new CloudApiWhatsappProvider(cfg);
    const result = await gw.send({ targetPhone: '5511999998888', messagePayload: 'Olá' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
