import { ClientRepository } from '../repositories/cliente.repositorie.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';

/**
 * Direitos do titular (LGPD — spec 0004). Escopo por tenant garantido pelos
 * repositórios (tenant-context). Lança CLIENT_NOT_FOUND quando o titular não
 * existe no tenant atual.
 */
export class LgpdService {
  private clients: ClientRepository;
  private invoices: InvoiceRepository;

  constructor(deps?: { clients?: ClientRepository; invoices?: InvoiceRepository }) {
    this.clients = deps?.clients ?? new ClientRepository();
    this.invoices = deps?.invoices ?? new InvoiceRepository();
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
}
