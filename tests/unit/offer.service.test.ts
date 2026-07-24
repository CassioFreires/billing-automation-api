import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfferService, OfferError } from '../../src/services/offer.service.js';

const OFFER = { id: 'o1', name: 'Personal 1x', priceCents: 6000, type: 'addon', active: true, tenantId: 't1' };
const INVOICE = { id: 'inv-orig', tenantId: 't1', clientId: 'c1' };

function makeMocks() {
  return {
    repo: {
      listAll: vi.fn(),
      listActive: vi.fn().mockResolvedValue([OFFER]),
      findById: vi.fn().mockResolvedValue(OFFER),
      create: vi.fn(),
      update: vi.fn(),
      countPurchases: vi.fn().mockResolvedValue(0),
      deleteById: vi.fn(),
      createPurchase: vi.fn().mockResolvedValue({}),
      summary: vi.fn(),
    },
    invoices: {
      findByLinkToken: vi.fn().mockResolvedValue(INVOICE),
      create: vi.fn().mockResolvedValue({ id: 'addon-1' }),
      attachCharge: vi.fn().mockResolvedValue({
        id: 'addon-1', value: 60, dueDate: new Date('2026-07-24'),
        checkoutUrl: null, pixCopyPaste: 'PIX-ADDON',
      }),
      deleteById: vi.fn().mockResolvedValue({}),
    },
    paymentSettings: { getForCurrentTenant: vi.fn().mockResolvedValue({}) },
    gateway: {
      createCharge: vi.fn().mockResolvedValue({
        gatewayId: 'g1', pixCopyPaste: 'PIX-ADDON', pixQrCode: null, checkoutUrl: null,
      }),
    },
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new OfferService(m as any);

describe('OfferService (spec 0044 — F15)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('listForToken devolve ofertas ativas resolvidas pela fatura', async () => {
    const list = await svc(m).listForToken('tok');
    expect(list).toEqual([{ id: 'o1', name: 'Personal 1x', priceCents: 6000, type: 'addon' }]);
    expect(m.invoices.findByLinkToken).toHaveBeenCalledWith('tok');
  });

  it('acceptOffer gera cobrança separada e registra a compra', async () => {
    const res = await svc(m).acceptOffer('tok', 'o1', new Date('2026-07-24T12:00:00Z'));
    // reservou a fatura do add-on com o valor certo (60 reais)
    expect(m.invoices.create).toHaveBeenCalledOnce();
    expect(Number(m.invoices.create.mock.calls[0][0].value)).toBe(60);
    // cobrou no gateway e anexou
    expect(m.gateway.createCharge).toHaveBeenCalledWith(expect.objectContaining({ amount: 60, description: 'Personal 1x' }));
    expect(m.invoices.attachCharge).toHaveBeenCalledOnce();
    // registrou a compra ligada à fatura
    expect(m.repo.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ offerId: 'o1', invoiceId: 'addon-1', clientId: 'c1', priceCents: 6000 }),
    );
    // devolveu o destino de pagamento
    expect(res.newInvoice).toMatchObject({ id: 'addon-1', value: 60, pixCopyPaste: 'PIX-ADDON' });
  });

  it('acceptOffer desfaz a reserva se o gateway falha', async () => {
    m.gateway.createCharge.mockRejectedValue(new Error('gateway down'));
    await expect(svc(m).acceptOffer('tok', 'o1')).rejects.toThrow('gateway down');
    expect(m.invoices.deleteById).toHaveBeenCalledWith('addon-1');
    expect(m.repo.createPurchase).not.toHaveBeenCalled();
  });

  it('acceptOffer recusa oferta inativa', async () => {
    m.repo.findById.mockResolvedValue({ ...OFFER, active: false });
    await expect(svc(m).acceptOffer('tok', 'o1')).rejects.toThrow(OfferError.OFFER_INACTIVE);
    expect(m.invoices.create).not.toHaveBeenCalled();
  });

  it('acceptOffer 404 se a fatura (token) não existe', async () => {
    m.invoices.findByLinkToken.mockResolvedValue(null);
    await expect(svc(m).acceptOffer('bad', 'o1')).rejects.toThrow(OfferError.INVOICE_NOT_FOUND);
  });

  it('create normaliza (nome trim) via domínio', async () => {
    m.repo.create.mockImplementation((d: any) => Promise.resolve({ id: 'x', ...d }));
    await svc(m).create({ name: '  Aula extra  ', priceCents: 5000 });
    expect(m.repo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aula extra', type: 'addon', active: true }));
  });

  it('remove recusa apagar oferta com compras (409)', async () => {
    m.repo.countPurchases.mockResolvedValue(2);
    await expect(svc(m).remove('o1')).rejects.toThrow(OfferError.HAS_PURCHASES);
    expect(m.repo.deleteById).not.toHaveBeenCalled();
  });
});
