import { describe, it, expect, vi } from 'vitest';
import { TeamService } from '../../src/services/team.service.js';

function make() {
  const users = {
    findByEmail: vi.fn(),
    createMember: vi.fn(),
    findByIdInTenant: vi.fn(),
    updateRole: vi.fn(),
    deleteById: vi.fn(),
    countOwners: vi.fn(),
    listByTenant: vi.fn(),
  };
  const service = new TeamService({ users: users as any });
  return { service, users };
}

const OWNER = { id: 'owner1', role: 'OWNER', tenantId: 't1' };
const ADMIN = { id: 'admin1', role: 'ADMIN', tenantId: 't1' };

describe('TeamService.invite', () => {
  it('cria membro com senha em hash', async () => {
    const { service, users } = make();
    users.findByEmail.mockResolvedValue(null);
    users.createMember.mockImplementation(async (i: any) => ({ id: 'u2', ...i }));

    const m = await service.invite(ADMIN, { name: 'Bia', email: 'bia@x.com', password: 'segredo123', role: 'MEMBER' });

    const arg = users.createMember.mock.calls[0][0];
    expect(arg.tenantId).toBe('t1');
    expect(arg.role).toBe('MEMBER');
    expect(arg.passwordHash).not.toBe('segredo123');
    expect(m.role).toBe('MEMBER');
  });

  it('rejeita e-mail já usado', async () => {
    const { service, users } = make();
    users.findByEmail.mockResolvedValue({ id: 'x' });
    await expect(
      service.invite(ADMIN, { name: 'Bia', email: 'bia@x.com', password: 'segredo123', role: 'MEMBER' })
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    expect(users.createMember).not.toHaveBeenCalled();
  });
});

describe('TeamService.changeRole / remove — regras', () => {
  it('não permite gerenciar a si mesmo', async () => {
    const { service } = make();
    await expect(service.changeRole(ADMIN, 'admin1', 'MEMBER')).rejects.toMatchObject({ code: 'SELF_MANAGE' });
  });

  it('ADMIN não pode gerenciar um OWNER (RN-3005)', async () => {
    const { service, users } = make();
    users.findByIdInTenant.mockResolvedValue({ id: 'owner2', role: 'OWNER', tenantId: 't1' });
    await expect(service.remove(ADMIN, 'owner2')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('não remove o último OWNER (RN-3004)', async () => {
    const { service, users } = make();
    users.findByIdInTenant.mockResolvedValue({ id: 'owner2', role: 'OWNER', tenantId: 't1' });
    users.countOwners.mockResolvedValue(1);
    await expect(service.remove(OWNER, 'owner2')).rejects.toMatchObject({ code: 'LAST_OWNER' });
    expect(users.deleteById).not.toHaveBeenCalled();
  });

  it('remove um membro comum', async () => {
    const { service, users } = make();
    users.findByIdInTenant.mockResolvedValue({ id: 'u2', role: 'MEMBER', tenantId: 't1' });
    users.deleteById.mockResolvedValue({ id: 'u2' });
    const r = await service.remove(ADMIN, 'u2');
    expect(r).toEqual({ deleted: true });
    expect(users.deleteById).toHaveBeenCalledWith('u2');
  });

  it('alvo de outro tenant não é encontrado (RN-3003)', async () => {
    const { service, users } = make();
    users.findByIdInTenant.mockResolvedValue(null);
    await expect(service.changeRole(ADMIN, 'x', 'MEMBER')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
