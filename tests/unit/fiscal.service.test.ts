import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FiscalService, FiscalError, FE } from '../../src/services/fiscal.service.js';
import { FiscalValidationError } from '../../src/domain/fiscal.js';

const CFG_ON = { enabled: true, provider: 'mock', companyId: null, cityServiceCode: '10677', autoEmitOnPaid: false, apiKey: null, webhookSecret: null };
const INV = { id: 'inv1', amount: 100, status: 'PAID', clientId: 'c1', clientName: 'Consultoria X', clientDocument: '12345678000199', clientEmail: 'x@y.com' };

function makeMocks() {
  return {
    repo: {
      getSettings: vi.fn(),
      getSettingsForUse: vi.fn().mockResolvedValue(CFG_ON),
      upsertSettings: vi.fn().mockResolvedValue({}),
      findDocumentByInvoice: vi.fn().mockResolvedValue(null),
      findDocumentByProviderId: vi.fn(),
      getInvoiceForEmission: vi.fn().mockResolvedValue(INV),
      createDocument: vi.fn().mockImplementation((d: any) => Promise.resolve({ id: 'doc1', ...d })),
      updateDocument: vi.fn().mockImplementation((id: string, d: any) => Promise.resolve({ id, ...d })),
      list: vi.fn(),
    },
    provider: {
      emit: vi.fn().mockResolvedValue({ providerId: 'p1', status: 'Issued', number: 'NF-1', pdfUrl: 'u.pdf', xmlUrl: 'u.xml' }),
      cancel: vi.fn().mockResolvedValue({ status: 'Cancelled' }),
      verifyWebhook: vi.fn(),
    },
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new FiscalService(m as any);

describe('FiscalService (spec 0047 — F7)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('emitForInvoice (mock) emite e grava a nota emitida', async () => {
    const doc = await svc(m).emitForInvoice('inv1', new Date('2026-07-27'));
    expect(m.provider.emit).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, cityServiceCode: '10677' }));
    expect(m.repo.createDocument).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: 'inv1', status: 'issued', number: 'NF-1', amountCents: 10000,
    }));
    expect((doc as any).status).toBe('issued');
  });

  it('emitForInvoice recusa quando a nota fiscal está desligada', async () => {
    m.repo.getSettingsForUse.mockResolvedValue({ ...CFG_ON, enabled: false });
    await expect(svc(m).emitForInvoice('inv1')).rejects.toThrow(FE.DISABLED);
  });

  it('emitForInvoice valida os dados do tomador (documento inválido)', async () => {
    m.repo.getInvoiceForEmission.mockResolvedValue({ ...INV, clientDocument: '123' });
    await expect(svc(m).emitForInvoice('inv1')).rejects.toBeInstanceOf(FiscalValidationError);
    expect(m.provider.emit).not.toHaveBeenCalled();
  });

  it('emitForInvoice é idempotente (nota já emitida → devolve existente)', async () => {
    m.repo.findDocumentByInvoice.mockResolvedValue({ id: 'doc1', status: 'issued' });
    const doc = await svc(m).emitForInvoice('inv1');
    expect((doc as any).id).toBe('doc1');
    expect(m.provider.emit).not.toHaveBeenCalled();
    expect(m.repo.createDocument).not.toHaveBeenCalled();
  });

  it('cancelForInvoice cancela nota emitida', async () => {
    m.repo.findDocumentByInvoice.mockResolvedValue({ id: 'doc1', status: 'issued', providerId: 'p1', provider: 'mock' });
    await svc(m).cancelForInvoice('inv1');
    expect(m.provider.cancel).toHaveBeenCalledWith('p1');
    expect(m.repo.updateDocument).toHaveBeenCalledWith('doc1', expect.objectContaining({ status: 'cancelled' }));
  });

  it('cancelForInvoice recusa cancelar nota não-emitida', async () => {
    m.repo.findDocumentByInvoice.mockResolvedValue({ id: 'doc1', status: 'processing', providerId: 'p1' });
    await expect(svc(m).cancelForInvoice('inv1')).rejects.toThrow(FE.NOT_CANCELLABLE);
    expect(m.provider.cancel).not.toHaveBeenCalled();
  });

  it('maybeAutoEmit só emite com autoEmitOnPaid ligado', async () => {
    const spy = vi.spyOn(svc(m) as any, 'emitForInvoice');
    // autoEmitOnPaid = false (CFG_ON) → não emite
    await svc(m).maybeAutoEmit('inv1', 't1');
    expect(m.provider.emit).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('maybeAutoEmit emite quando autoEmitOnPaid ligado', async () => {
    m.repo.getSettingsForUse.mockResolvedValue({ ...CFG_ON, autoEmitOnPaid: true });
    await svc(m).maybeAutoEmit('inv1', 't1');
    expect(m.provider.emit).toHaveBeenCalledOnce();
  });

  it('applyWebhook atualiza a nota pelo providerId (transição válida)', async () => {
    m.repo.findDocumentByProviderId.mockResolvedValue({ id: 'doc1', status: 'processing', tenantId: 't1', number: null });
    m.provider.verifyWebhook.mockReturnValue({ providerId: 'p1', status: 'Issued', number: 'NF-9', pdfUrl: 'a.pdf' });
    const r = await svc(m).applyWebhook('nfeio', { headers: {}, body: { data: { id: 'p1' } } });
    expect(r.ignored).toBe(false);
    expect(m.repo.updateDocument).toHaveBeenCalledWith('doc1', expect.objectContaining({ status: 'issued', number: 'NF-9' }));
  });

  it('applyWebhook ignora assinatura inválida (verifyWebhook null)', async () => {
    m.repo.findDocumentByProviderId.mockResolvedValue({ id: 'doc1', status: 'processing', tenantId: 't1' });
    m.provider.verifyWebhook.mockReturnValue(null);
    const r = await svc(m).applyWebhook('nfeio', { headers: {}, body: { data: { id: 'p1' } } });
    expect(r.ignored).toBe(true);
    expect(m.repo.updateDocument).not.toHaveBeenCalled();
  });
});
