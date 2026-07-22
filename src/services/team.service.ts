import bcrypt from 'bcryptjs';
import { UserRepository } from '../repositories/user.repository.js';
import { InviteMemberDTO } from '../dtos/team.dto.js';

const BCRYPT_ROUNDS = 10;

/** Erros de regra da gestão de equipe (spec 0030). */
export class TeamError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export interface Actor {
  id: string;
  role: string;
  tenantId: string;
}

/**
 * Gestão de equipe por tenant (spec 0030). Regras de segurança:
 * - só OWNER/ADMIN gerenciam (garantido no router por requireRole);
 * - alvo sempre precisa pertencer ao MESMO tenant do ator (RN-3003);
 * - só OWNER pode gerenciar um OWNER (RN-3005);
 * - nunca deixar o tenant sem OWNER (RN-3004);
 * - não é possível gerenciar a si mesmo (evita auto-lockout).
 */
export class TeamService {
  private users: UserRepository;

  constructor(deps?: { users?: UserRepository }) {
    this.users = deps?.users ?? new UserRepository();
  }

  list(tenantId: string) {
    return this.users.listByTenant(tenantId);
  }

  async invite(actor: Actor, data: InviteMemberDTO) {
    const existing = await this.users.findByEmail(data.email);
    if (existing) throw new TeamError('EMAIL_TAKEN', 'Este e-mail já está cadastrado.');

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    return this.users.createMember({
      tenantId: actor.tenantId,
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
    });
  }

  async changeRole(actor: Actor, targetId: string, role: string) {
    const target = await this.assertManageable(actor, targetId);
    // Rebaixar um OWNER só se não for o último (RN-3004).
    if (target.role === 'OWNER') {
      const owners = await this.users.countOwners(actor.tenantId);
      if (owners <= 1) throw new TeamError('LAST_OWNER', 'A conta precisa de ao menos um dono.');
    }
    return this.users.updateRole(targetId, role);
  }

  async remove(actor: Actor, targetId: string) {
    const target = await this.assertManageable(actor, targetId);
    if (target.role === 'OWNER') {
      const owners = await this.users.countOwners(actor.tenantId);
      if (owners <= 1) throw new TeamError('LAST_OWNER', 'A conta precisa de ao menos um dono.');
    }
    await this.users.deleteById(targetId);
    return { deleted: true };
  }

  /** Valida escopo/permissão sobre o alvo e o devolve. */
  private async assertManageable(actor: Actor, targetId: string) {
    if (targetId === actor.id) {
      throw new TeamError('SELF_MANAGE', 'Você não pode alterar o seu próprio acesso aqui.');
    }
    const target = await this.users.findByIdInTenant(targetId, actor.tenantId);
    if (!target) throw new TeamError('NOT_FOUND', 'Usuário não encontrado.');
    // Só OWNER gerencia OWNER (RN-3005).
    if (target.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new TeamError('FORBIDDEN', 'Apenas o dono pode gerenciar outro dono.');
    }
    return target;
  }
}
