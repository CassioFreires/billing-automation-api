import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Repositório dos casos de recuperação (spec 0033 — F1). Único ponto de acesso a
 * `RecoveryCase`/`RecoveryAttempt`. Leituras do sweep são escopadas por tenant
 * (`requireTenantId`, dentro de `runWithTenant`); o fechamento por webhook resolve
 * pela fatura (invoiceId é único global), sem exigir contexto de tenant.
 */

export interface OverdueInvoiceForRecovery {
  id: string;
  value: number;
  dueDate: Date;
  subscriptionId: string | null;
  clientId: string;
  clientName: string;
  phone: string;
  document: string;
  hasEmail: boolean;
}

export interface DueRecoveryCase {
  id: string;
  currentStep: number;
  lastChannel: string | null;
  reliefOffered: boolean;
  invoice: {
    id: string;
    status: string;
    value: number;
    clientName: string;
    phone: string;
    document: string;
    hasEmail: boolean;
  };
}

export class RecoveryCaseRepository {
  /** Faturas vencidas do tenant atual SEM caso ainda — candidatas a abrir (RN-3301). */
  async findOverdueWithoutCase(now: Date, limit = 500): Promise<OverdueInvoiceForRecovery[]> {
    const tenantId = requireTenantId();
    const rows = await prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lt: now },
        recoveryCase: { is: null },
      },
      orderBy: { dueDate: 'asc' },
      take: limit,
      select: {
        id: true,
        value: true,
        dueDate: true,
        subscriptionId: true,
        clientId: true,
        client: { select: { name: true, phone: true, document: true, email: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      value: Number(r.value),
      dueDate: r.dueDate,
      subscriptionId: r.subscriptionId,
      clientId: r.clientId,
      clientName: r.client.name,
      phone: r.client.phone,
      document: r.client.document,
      hasEmail: Boolean(r.client.email),
    }));
  }

  /** Abre um caso (idempotente por `invoiceId` @unique — RN-3301). */
  async openCase(params: {
    invoiceId: string;
    clientId: string;
    subscriptionId: string | null;
    amountAtRisk: number;
    nextActionAt: Date;
    tenantId: string;
  }) {
    return prisma.recoveryCase.upsert({
      where: { invoiceId: params.invoiceId },
      create: {
        invoiceId: params.invoiceId,
        clientId: params.clientId,
        subscriptionId: params.subscriptionId,
        amountAtRisk: params.amountAtRisk,
        nextActionAt: params.nextActionAt,
        tenantId: params.tenantId,
      },
      update: {}, // já existe → não mexe (idempotente)
    });
  }

  /** Casos devidos do tenant atual (open/recovering, nextActionAt<=now ou null). */
  async findDueCases(now: Date, limit = 500): Promise<DueRecoveryCase[]> {
    const tenantId = requireTenantId();
    const rows = await prisma.recoveryCase.findMany({
      where: {
        tenantId,
        status: { in: ['open', 'recovering'] },
        OR: [{ nextActionAt: { lte: now } }, { nextActionAt: null }],
      },
      orderBy: { nextActionAt: 'asc' },
      take: limit,
      select: {
        id: true,
        currentStep: true,
        lastChannel: true,
        reliefOffered: true,
        invoice: {
          select: {
            id: true,
            status: true,
            value: true,
            client: { select: { name: true, phone: true, document: true, email: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      currentStep: r.currentStep,
      lastChannel: r.lastChannel,
      reliefOffered: r.reliefOffered,
      invoice: {
        id: r.invoice.id,
        status: r.invoice.status,
        value: Number(r.invoice.value),
        clientName: r.invoice.client.name,
        phone: r.invoice.client.phone,
        document: r.invoice.client.document,
        hasEmail: Boolean(r.invoice.client.email),
      },
    }));
  }

  /** Registra a tentativa e avança o caso (transação atômica). */
  async recordAttemptAndAdvance(params: {
    caseId: string;
    tenantId: string;
    step: number;
    channel: string | null;
    action: string;
    result: string;
    reliefOffered: boolean;
    nextActionAt: Date;
  }) {
    await prisma.$transaction(async (tx) => {
      await tx.recoveryAttempt.create({
        data: {
          caseId: params.caseId,
          tenantId: params.tenantId,
          step: params.step,
          channel: params.channel,
          action: params.action,
          result: params.result,
        },
      });
      await tx.recoveryCase.update({
        where: { id: params.caseId },
        data: {
          status: 'recovering',
          currentStep: params.step,
          lastChannel: params.channel,
          reliefOffered: params.reliefOffered,
          nextActionAt: params.nextActionAt,
        },
      });
    });
  }

  /**
   * IDs das faturas do tenant atual com caso ATIVO (open/recovering). Usado pela
   * régua (spec 0026) para NÃO enviar em faturas que o motor de recuperação já
   * está tratando — evita cobrança dobrada (spec 0033, corte pós-vencimento).
   */
  async findActiveInvoiceIds(): Promise<string[]> {
    const rows = await prisma.recoveryCase.findMany({
      where: { tenantId: requireTenantId(), status: { in: ['open', 'recovering'] } },
      select: { invoiceId: true },
    });
    return rows.map((r) => r.invoiceId);
  }

  /** Encerra o caso como perdido — passos esgotados (RN-3307). */
  async markLost(caseId: string) {
    return prisma.recoveryCase.update({
      where: { id: caseId },
      data: { status: 'lost', outcome: 'sem_resposta', resolvedAt: new Date(), nextActionAt: null },
    });
  }

  /**
   * Fecha o caso de uma fatura (RN-3306). Cross-tenant safe: resolve por invoiceId
   * (único global), sem exigir contexto de tenant — chamado pelo webhook/acordo.
   * Idempotente: se não há caso ou já está resolvido, não faz nada.
   */
  async closeByInvoiceId(
    invoiceId: string,
    outcome: 'paid' | 'agreement'
  ): Promise<{ closed: boolean }> {
    const existing = await prisma.recoveryCase.findUnique({
      where: { invoiceId },
      select: { status: true },
    });
    if (!existing || ['recovered', 'lost', 'cancelled'].includes(existing.status)) {
      return { closed: false };
    }
    await prisma.recoveryCase.update({
      where: { invoiceId },
      data: { status: 'recovered', outcome, resolvedAt: new Date(), nextActionAt: null },
    });
    return { closed: true };
  }

  /** Lista os casos do tenant atual (para o painel/aba "Recuperações"). */
  async listForTenant(limit = 200) {
    const tenantId = requireTenantId();
    const rows = await prisma.recoveryCase.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { nextActionAt: 'asc' }],
      take: limit,
      select: {
        id: true,
        status: true,
        reason: true,
        amountAtRisk: true,
        currentStep: true,
        reliefOffered: true,
        nextActionAt: true,
        openedAt: true,
        resolvedAt: true,
        outcome: true,
        invoiceId: true,
        invoice: { select: { value: true, dueDate: true, client: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      amountAtRisk: Number(r.amountAtRisk),
      currentStep: r.currentStep,
      reliefOffered: r.reliefOffered,
      nextActionAt: r.nextActionAt,
      openedAt: r.openedAt,
      resolvedAt: r.resolvedAt,
      outcome: r.outcome,
      invoiceId: r.invoiceId,
      clientName: r.invoice.client.name,
      invoiceValue: Number(r.invoice.value),
      dueDate: r.invoice.dueDate,
    }));
  }

  /** Detalhe de um caso do tenant atual, com a timeline de tentativas. */
  async findByIdForTenant(id: string) {
    const tenantId = requireTenantId();
    const c = await prisma.recoveryCase.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        reason: true,
        amountAtRisk: true,
        currentStep: true,
        lastChannel: true,
        reliefOffered: true,
        nextActionAt: true,
        openedAt: true,
        resolvedAt: true,
        outcome: true,
        invoiceId: true,
        invoice: { select: { value: true, dueDate: true, client: { select: { name: true, phone: true } } } },
        attempts: {
          orderBy: { occurredAt: 'desc' },
          select: { step: true, channel: true, action: true, result: true, occurredAt: true },
        },
      },
    });
    if (!c) return null;
    return {
      id: c.id,
      status: c.status,
      reason: c.reason,
      amountAtRisk: Number(c.amountAtRisk),
      currentStep: c.currentStep,
      lastChannel: c.lastChannel,
      reliefOffered: c.reliefOffered,
      nextActionAt: c.nextActionAt,
      openedAt: c.openedAt,
      resolvedAt: c.resolvedAt,
      outcome: c.outcome,
      invoiceId: c.invoiceId,
      clientName: c.invoice.client.name,
      clientPhone: c.invoice.client.phone,
      invoiceValue: Number(c.invoice.value),
      dueDate: c.invoice.dueDate,
      attempts: c.attempts,
    };
  }

  /**
   * Encerramento manual pelo dono (RN-3308). Escopado por tenant (updateMany com
   * tenantId) e idempotente: só encerra casos ainda open/recovering.
   */
  async cancelById(id: string): Promise<{ cancelled: boolean }> {
    const tenantId = requireTenantId();
    const res = await prisma.recoveryCase.updateMany({
      where: { id, tenantId, status: { in: ['open', 'recovering'] } },
      data: { status: 'cancelled', outcome: 'cancelado_pelo_dono', resolvedAt: new Date(), nextActionAt: null },
    });
    return { cancelled: res.count > 0 };
  }
}
