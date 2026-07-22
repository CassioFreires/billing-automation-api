import { ClientRepository } from '../repositories/cliente.repositorie.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { AccountRepository } from '../repositories/account.repository.js';

/** Erro de confirmação ao encerrar a conta (nome digitado não confere) — RN-2205. */
export class AccountDeleteConfirmError extends Error {
  constructor() {
    super('NAME_MISMATCH');
  }
}

/**
 * Direitos do titular (LGPD — spec 0004 + 0022). Escopo por tenant garantido
 * pelos repositórios (tenant-context). Lança CLIENT_NOT_FOUND quando o titular
 * (cliente do dono) não existe no tenant atual.
 */
export class LgpdService {
  private clients: ClientRepository;
  private invoices: InvoiceRepository;
  private accounts: AccountRepository;

  constructor(deps?: {
    clients?: ClientRepository;
    invoices?: InvoiceRepository;
    accounts?: AccountRepository;
  }) {
    this.clients = deps?.clients ?? new ClientRepository();
    this.invoices = deps?.invoices ?? new InvoiceRepository();
    this.accounts = deps?.accounts ?? new AccountRepository();
  }

  /** Acesso/portabilidade: exporta o titular e suas faturas (RN-L1). */
  async exportClientData(clientId: string) {
    const client = await this.clients.findById(clientId);
    if (!client) {
      throw new Error('CLIENT_NOT_FOUND');
    }

    const invoices = await this.invoices.findByClientId(clientId);

    return {
      exportedAt: new Date().toISOString(),
      client,
      invoices,
    };
  }

  /** Eliminação via anonimização, idempotente (RN-L2/RN-L4). */
  async anonymizeClient(clientId: string) {
    const client = await this.clients.findById(clientId);
    if (!client) {
      throw new Error('CLIENT_NOT_FOUND');
    }

    if (client.anonymizedAt) {
      return client; // já anonimizado
    }

    return this.clients.anonymize(clientId);
  }

  /** Portabilidade dos dados da PRÓPRIA conta (dono do SaaS) — RN-2204. */
  async exportAccountData() {
    const account = await this.accounts.exportCurrent();
    return { exportedAt: new Date().toISOString(), account };
  }

  /**
   * Eliminação da PRÓPRIA conta (RN-2205). Exige o nome exato como confirmação;
   * remove o tenant e tudo em cascata. Escopo garantido pelo tenant-context.
   */
  async deleteAccount(confirmName: string) {
    const account = await this.accounts.findCurrent();
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    if (confirmName.trim() !== account.name.trim()) {
      throw new AccountDeleteConfirmError();
    }
    await this.accounts.deleteCurrent();
    return { deleted: true };
  }
}
