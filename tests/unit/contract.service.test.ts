import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractService, NotFoundError, BadRequestError } from '../../src/services/contract.service.js';

function makeMocks() {
  return {
    repo: {
      getSetting: vi.fn(),
      getSettingByTenant: vi.fn(),
      upsertSetting: vi.fn(),
      latestAcceptance: vi.fn(),
      recordAcceptance: vi.fn(),
      setFile: vi.fn(),
      getFileByTenant: vi.fn(),
    },
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new ContractService(m as any);
const setting = (over: Record<string, any> = {}) => ({ enabled: true, title: 'T', body: 'Texto do contrato', version: 2, mode: 'text', fileName: null, ...over });

describe('ContractService (spec 0040 — F14)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('getSettings devolve defaults quando não configurado', async () => {
    m.repo.getSetting.mockResolvedValue(null);
    const s = await svc(m).getSettings();
    expect(s).toMatchObject({ enabled: false, title: 'Contrato de prestação de serviço', body: '', version: 1, mode: 'text' });
  });

  it('getForClient → null quando contrato desabilitado ou vazio', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ enabled: false }));
    expect(await svc(m).getForClient('c1', 't1')).toBeNull();

    m.repo.getSettingByTenant.mockResolvedValue(setting({ body: '   ' }));
    expect(await svc(m).getForClient('c1', 't1')).toBeNull();
  });

  it('getForClient → accepted=true quando aceitou a versão atual', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ version: 2 }));
    m.repo.latestAcceptance.mockResolvedValue({ version: 2, acceptedAt: new Date('2026-07-24') });
    const v = await svc(m).getForClient('c1', 't1');
    expect(v?.accepted).toBe(true);
    expect(v?.version).toBe(2);
  });

  it('getForClient → accepted=false quando só aceitou versão antiga', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ version: 3 }));
    m.repo.latestAcceptance.mockResolvedValue({ version: 2, acceptedAt: new Date() });
    const v = await svc(m).getForClient('c1', 't1');
    expect(v?.accepted).toBe(false);
  });

  it('accept grava a prova na versão atual', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ version: 2 }));
    m.repo.latestAcceptance.mockResolvedValue(null);
    m.repo.recordAcceptance.mockResolvedValue({ version: 2, acceptedAt: new Date('2026-07-24') });

    const out = await svc(m).accept({ clientId: 'c1', tenantId: 't1', name: 'Ana Beatriz', ipHash: 'abc', userAgent: 'UA' });

    expect(out.accepted).toBe(true);
    expect(out.version).toBe(2);
    expect(m.repo.recordAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'c1', tenantId: 't1', version: 2, acceptedName: 'Ana Beatriz', ipHash: 'abc' })
    );
  });

  it('accept é idempotente na mesma versão (não duplica)', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ version: 2 }));
    m.repo.latestAcceptance.mockResolvedValue({ version: 2, acceptedAt: new Date('2026-07-20') });

    const out = await svc(m).accept({ clientId: 'c1', tenantId: 't1', name: 'Ana Beatriz' });

    expect(out.accepted).toBe(true);
    expect(m.repo.recordAcceptance).not.toHaveBeenCalled();
  });

  it('accept → 404 quando não há contrato ativo', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ enabled: false }));
    await expect(svc(m).accept({ clientId: 'c1', tenantId: 't1', name: 'Ana' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('accept → 400 quando o nome é curto', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting());
    await expect(svc(m).accept({ clientId: 'c1', tenantId: 't1', name: 'Al' })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('setFile aceita PDF válido (magic %PDF) e ativa modo file', async () => {
    m.repo.setFile.mockResolvedValue({ mode: 'file', fileName: 'c.pdf', fileSize: 10, version: 2, enabled: true });
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('conteudo')]);
    const out = await svc(m).setFile('c.pdf', 'application/pdf', pdf);
    expect(out.mode).toBe('file');
    expect(m.repo.setFile).toHaveBeenCalled();
  });

  it('setFile rejeita não-PDF (400)', async () => {
    const notPdf = Buffer.from('isto nao e pdf');
    await expect(svc(m).setFile('x.pdf', 'application/pdf', notPdf)).rejects.toBeInstanceOf(BadRequestError);
    await expect(svc(m).setFile('x.txt', 'text/plain', Buffer.from('%PDF-1.7'))).rejects.toBeInstanceOf(BadRequestError);
  });

  it('getForClient em modo file → body vazio, fileName presente', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ mode: 'file', body: '', fileName: 'contrato.pdf', version: 1 }));
    m.repo.latestAcceptance.mockResolvedValue(null);
    const v = await svc(m).getForClient('c1', 't1');
    expect(v?.mode).toBe('file');
    expect(v?.body).toBe('');
    expect(v?.fileName).toBe('contrato.pdf');
    expect(v?.accepted).toBe(false);
  });
});
