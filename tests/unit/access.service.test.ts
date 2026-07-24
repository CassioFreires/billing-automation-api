import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessService, NotFoundError, BadRequestError } from '../../src/services/access.service.js';

function makeMocks() {
  return {
    repo: {
      getSettings: vi.fn().mockResolvedValue({ enabled: true, graceDays: 3, requireSignedContract: true }),
      upsertSettings: vi.fn(),
      setOverride: vi.fn(),
      findAccessInputs: vi.fn().mockResolvedValue([]),
    },
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new AccessService(m as any);

describe('AccessService (spec 0042 — F12)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('compõe o estado por cliente com decideAccess', async () => {
    m.repo.findAccessInputs.mockResolvedValue([
      { clientId: 'c1', name: 'Em dia', override: null, hasOverdue: false, maxDaysOverdue: 0, contractAccepted: true },
      { clientId: 'c2', name: 'Bloqueado', override: null, hasOverdue: true, maxDaysOverdue: 10, contractAccepted: true },
      { clientId: 'c3', name: 'Sem contrato', override: null, hasOverdue: true, maxDaysOverdue: 40, contractAccepted: false },
      { clientId: 'c4', name: 'Override', override: 'allow', hasOverdue: true, maxDaysOverdue: 99, contractAccepted: true },
    ]);

    const list = await svc(m).listClientsAccess(new Date());
    const by = Object.fromEntries(list.map((x) => [x.clientId, x]));

    expect(by.c1.state).toBe('allowed'); // em dia
    expect(by.c2.state).toBe('blocked'); // atraso > carência
    expect(by.c3.state).toBe('allowed'); // sem contrato → não bloqueia
    expect(by.c4.state).toBe('allowed'); // override allow
  });

  it('setOverride valida o valor', async () => {
    await expect(svc(m).setOverride('c1', 'xpto')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('setOverride "none" limpa (null) e 404 se cliente não existe', async () => {
    m.repo.setOverride.mockResolvedValue(null);
    await expect(svc(m).setOverride('cX', 'none')).rejects.toBeInstanceOf(NotFoundError);
    expect(m.repo.setOverride).toHaveBeenCalledWith('cX', null);
  });

  it('updateSettings limita graceDays (clamp 0..90)', async () => {
    m.repo.upsertSettings.mockResolvedValue({});
    await svc(m).updateSettings({ graceDays: 999 });
    expect(m.repo.upsertSettings).toHaveBeenCalledWith(expect.objectContaining({ graceDays: 90 }));
  });
});
