import { ClientRepository } from '../repositories/cliente.repositorie.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { ContractService, type ContractView } from './contract.service.js';

const OPEN_STATUSES = new Set(['PENDING', 'OVERDUE']);

export interface PortalInvoice {
  id: string;
  value: number;
  status: string;
  dueDate: Date;
  paidAt: Date | null;
  payUrl: string | null; // link do Elo (/r/:token) quando houver
}

export interface PortalView {
  clientName: string;
  open: PortalInvoice[];
  history: PortalInvoice[];
  totals: { openCount: number; openValue: number };
  contract: ContractView | null; // Contrato no Celular (spec 0040)
}

/**
 * Portal do pagador (spec 0027): visão pública de TODAS as cobranças de um
 * cliente, resolvida por `portalToken`. Sem login e sem tenant-context — o
 * cliente é a entrada global (como o link do Elo).
 */
export class PortalService {
  private clients: ClientRepository;
  private invoices: InvoiceRepository;
  private contract: ContractService;

  constructor(deps?: { clients?: ClientRepository; invoices?: InvoiceRepository; contract?: ContractService }) {
    this.clients = deps?.clients ?? new ClientRepository();
    this.invoices = deps?.invoices ?? new InvoiceRepository();
    this.contract = deps?.contract ?? new ContractService();
  }

  async getByToken(token: string, appBaseUrl: string): Promise<PortalView | null> {
    const client = await this.clients.findByPortalToken(token);
    if (!client || client.anonymizedAt) return null; // titular anonimizado não expõe portal

    const rows = await this.invoices.findForPortal(client.id);
    const contract = await this.contract.getForClient(client.id, client.tenantId);
    const base = appBaseUrl.replace(/\/$/, '');

    const map = (r: (typeof rows)[number]): PortalInvoice => ({
      id: r.id,
      value: r.value,
      status: r.status,
      dueDate: r.dueDate,
      paidAt: r.paidAt,
      payUrl: r.linkToken ? `${base}/r/${r.linkToken}` : null,
    });

    const open = rows.filter((r) => OPEN_STATUSES.has(r.status)).map(map);
    const history = rows.filter((r) => !OPEN_STATUSES.has(r.status)).map(map);

    return {
      clientName: client.name,
      open,
      history,
      totals: {
        openCount: open.length,
        openValue: Math.round(open.reduce((s, i) => s + i.value, 0) * 100) / 100,
      },
      contract,
    };
  }

  /**
   * Aceite do contrato no Portal (spec 0040). Resolve o cliente pelo token (entrada
   * global) e delega ao ContractService, que grava a prova. `ipHash`/`userAgent`
   * vêm do controller (LGPD-mínimo). 404 se o token não existe.
   */
  async acceptContract(
    token: string,
    input: { name: string; document?: string | null },
    proof: { ipHash?: string | null; userAgent?: string | null }
  ) {
    const client = await this.clients.findByPortalToken(token);
    if (!client || client.anonymizedAt) return null;
    return this.contract.accept({
      clientId: client.id,
      tenantId: client.tenantId,
      name: input.name,
      document: input.document ?? null,
      ipHash: proof.ipHash ?? null,
      userAgent: proof.userAgent ?? null,
    });
  }

  /** Bytes do PDF do contrato (modo file) para o Portal servir. Null se não houver. */
  async getContractFile(token: string) {
    const client = await this.clients.findByPortalToken(token);
    if (!client || client.anonymizedAt) return null;
    return this.contract.getFile(client.tenantId);
  }

  /** Gera/recupera o link do portal de um cliente (ação do dono, tenant-scoped). */
  async getPortalLink(clientId: string, appBaseUrl: string): Promise<string | null> {
    const token = await this.clients.ensurePortalToken(clientId);
    if (!token) return null;
    return `${appBaseUrl.replace(/\/$/, '')}/portal/${token}`;
  }
}
