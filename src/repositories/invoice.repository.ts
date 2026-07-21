import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';
import { redis } from '../config/redis.config.js';
import { requireTenantId } from '../context/tenant-context.js';
import { canTransitionInvoice, shouldRecordGatewayPayment } from '../domain/status.js';
import { InteractionType } from '../domain/interaction.js';

export class InvoiceRepository {

  async create(
    data: {
      clientId: string;
      value: Prisma.Decimal | number;
      dueDate: Date;
      items?: { description: string; quantity: number; unitPrice: Prisma.Decimal | number }[];
      pixCopyPaste?: string;
      pixQrCode?: string;
      checkoutUrl?: string;
      gatewayId?: string;
      subscriptionId?: string; // origem recorrente (spec 0009)
      period?: string;         // competência YYYY-MM
    }
  ) {

    const invoice = await prisma.invoice.create({
      data: {
        clientId: data.clientId,
        value: data.value,
        dueDate: data.dueDate,
        pixCopyPaste: data.pixCopyPaste,
        pixQrCode: data.pixQrCode,
        checkoutUrl: data.checkoutUrl,
        gatewayId: data.gatewayId,
        // Link PRÓPRIO do Adimplo (Elo, spec 0016): token não-adivinhável gerado
        // já na reserva, para toda fatura ter link próprio (avulsa e recorrente).
        linkToken: randomUUID(),
        subscriptionId: data.subscriptionId,
        period: data.period,
        status: 'PENDING',
        tenantId: requireTenantId(),
        items:
          data.items && data.items.length
            ? {
                create: data.items.map((i) => ({
                  description: i.description,
                  quantity: i.quantity,
                  unitPrice: i.unitPrice,
                })),
              }
            : undefined,
      },
      include: { items: true },
    });

    return invoice;
  }

  /** Anexa os dados da cobrança do gateway a uma fatura já reservada. */
  async attachCharge(
    id: string,
    data: { gatewayId?: string; pixCopyPaste?: string; pixQrCode?: string; checkoutUrl?: string }
  ) {
    return prisma.invoice.update({
      where: { id },
      data,
      include: { items: true },
    });
  }

  /** Remove uma fatura — usado para DESFAZER uma reserva quando o gateway falha. */
  async deleteById(id: string) {
    return prisma.invoice.delete({ where: { id } });
  }

  /**
   * Aplica o webhook de pagamento de forma ATÔMICA e idempotente (RN-P3):
   * registra o evento (unique = trava) e atualiza o status na MESMA transação.
   * Guarda de ordem: uma fatura já `PAID` NÃO regride por evento fora de ordem.
   */
  async applyWebhookAtomic(params: {
    invoiceId: string;
    eventId?: string;
    provider: string;
    status: string;
    paidAt?: Date;
  }): Promise<{ duplicate: boolean; invoice: unknown }> {
    // Idempotência — fast-path FORA da transação: no reenvio comum (mesmo
    // eventId), detecta o duplicado sem tentar um INSERT que falha. Isso evita
    // abortar a transação no Postgres (erro 25P02: "current transaction is
    // aborted"), que quebrava quando o catch do P2002 seguia consultando na
    // MESMA transação já abortada.
    if (params.eventId) {
      const already = await prisma.webhookEvent.findUnique({ where: { id: params.eventId } });
      if (already) {
        const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId } });
        return { duplicate: true, invoice };
      }
    }

    let result: { duplicate: boolean; invoice: unknown };
    try {
      result = await prisma.$transaction(async (tx) => {
      // Trava atômica contra CORRIDA: o insert na PK do WebhookEvent garante
      // que dois requests simultâneos com o mesmo eventId não processem os dois.
      // Se colidir (P2002), a transação inteira faz rollback e o catch externo
      // trata como duplicado (transação limpa, sem 25P02).
      if (params.eventId) {
        await tx.webhookEvent.create({
          data: { id: params.eventId, provider: params.provider },
        });
      }

      // Backstop atômico da máquina de estados (evita TOCTOU com o check do service).
      const current = await tx.invoice.findUnique({ where: { id: params.invoiceId } });
      if (current && !canTransitionInvoice(current.status, params.status)) {
        return { duplicate: false, invoice: current };
      }

      const recordGatewayPayment = shouldRecordGatewayPayment(current?.status, params.status);

      const invoice = await tx.invoice.update({
        where: { id: params.invoiceId },
        data: { status: params.status, paidAt: params.paidAt },
      });

      // Recebimento via gateway (spec 0015): registra o Payment na MESMA
      // transação, apenas na transição EFETIVA para PAID (não em reconfirmação),
      // para não duplicar o "dinheiro que entrou". tenantId vem da própria
      // fatura — o fluxo do webhook não roda dentro de runWithTenant.
      if (recordGatewayPayment) {
        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: invoice.value,
            method: null,
            source: 'gateway',
            paidAt: params.paidAt ?? new Date(),
            tenantId: invoice.tenantId,
          },
        });

        // Evento `paid` do Elo (spec 0016), na MESMA transição efetiva para PAID
        // (não em reconfirmação) — a mesma guarda evita duplicar o evento.
        await tx.interactionEvent.create({
          data: {
            type: InteractionType.PAID,
            tenantId: invoice.tenantId,
            invoiceId: invoice.id,
            clientId: invoice.clientId,
            occurredAt: params.paidAt ?? new Date(),
          },
        });

        // Autonegociação (spec 0018 — RN-NEG6): se esta fatura é a NOVA cobrança
        // de um acordo, o acordo se resolve (ACCEPTED) ao ser paga.
        await tx.agreement.updateMany({
          where: { newInvoiceId: invoice.id, status: 'PENDING' },
          data: { status: 'ACCEPTED' },
        });
      }

      return { duplicate: false, invoice };
      });
    } catch (error) {
      // Corrida: outro request inseriu o mesmo eventId em paralelo entre o
      // fast-path e o INSERT. A transação já fez rollback (limpa) → é duplicado.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId } });
        return { duplicate: true, invoice };
      }
      throw error;
    }

    await this.clearPendingInvoicesCache();
    return result;
  }

  /**
   * Baixa MANUAL (spec 0015): registra um Payment(source=manual) e marca a
   * fatura como PAID na MESMA transação. O service já validou o tenant (dono da
   * fatura) e o estado (máquina de estados) antes de chamar.
   */
  async settleManually(params: {
    invoiceId: string;
    amount: Prisma.Decimal | number;
    method: string;
    paidAt: Date;
    note?: string | null;
    receiptUrl?: string | null;
  }): Promise<{ payment: unknown; invoice: unknown }> {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.update({
        where: { id: params.invoiceId },
        data: { status: 'PAID', paidAt: params.paidAt },
      });
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: params.amount,
          method: params.method,
          source: 'manual',
          paidAt: params.paidAt,
          note: params.note ?? null,
          receiptUrl: params.receiptUrl ?? null,
          tenantId: invoice.tenantId,
        },
      });

      // Evento `paid` do Elo (spec 0016): pagamento manual também é pagamento —
      // o grafo de comportamento (Cockpit/Score) precisa enxergá-lo.
      await tx.interactionEvent.create({
        data: {
          type: InteractionType.PAID,
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          clientId: invoice.clientId,
          occurredAt: params.paidAt,
        },
      });

      return { payment, invoice };
    });

    await this.clearPendingInvoicesCache();
    return result;
  }

  async findByClientId(clientId: string) {
    return prisma.invoice.findMany({
      where: {
        clientId,
        tenantId: requireTenantId(),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Busca UMA fatura do tenant atual (com dados do cliente e itens). null se não existir. */
  async findById(id: string) {
    return prisma.invoice.findFirst({
      where: {
        id,
        tenantId: requireTenantId(),
      },
      include: {
        client: {
          select: { id: true, name: true, phone: true, document: true, status: true },
        },
        items: true,
      },
    });
  }

  /** Lista TODAS as faturas do tenant, paginadas, com filtro opcional por status. */
  async findAll(page: number = 1, limit: number = 10, status?: string) {
    const tenantId = requireTenantId();
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(status ? { status } : {}),
    };

    const [invoices, totalItems] = await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: { id: true, name: true, phone: true, document: true, status: true },
          },
          items: true,
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      meta: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
    };
  }

  /** Fatura já gerada para uma assinatura numa competência (idempotência recorrente). */
  async findBySubscriptionPeriod(subscriptionId: string, period: string) {
    return prisma.invoice.findFirst({
      where: {
        subscriptionId,
        period,
        tenantId: requireTenantId(),
      },
    });
  }

  async findByGatewayId(gatewayId: string) {

    return prisma.invoice.findUnique({
      where: { gatewayId },
      include: { client: true }
    });

  }

  /**
   * Resolve uma fatura pelo `linkToken` do Elo (spec 0016). ENTRADA GLOBAL
   * legítima (exceção da RN-T2, igual a `findByGatewayId`): a rota pública
   * `/r/:token` não tem contexto de tenant; o `tenantId` é derivado da fatura.
   */
  async findByLinkToken(token: string) {
    return prisma.invoice.findUnique({
      where: { linkToken: token },
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        status: true,
        value: true,     // necessário para calcular as opções de acordo (spec 0018)
        dueDate: true,
        checkoutUrl: true,
        pixCopyPaste: true,
      },
    });
  }

  async findNotificationDataById(id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        tenantId: requireTenantId(),
      },
      include: {
        client: true,
      },
    });

    if (!invoice) {
      return null;
    }

    return {
      id: invoice.id,
      clientId: invoice.clientId, // para amarrar o evento ao pagador (Elo, spec 0016)
      value: Number(invoice.value), // Decimal → number para uso interno/mensagem
      dueDate: invoice.dueDate,
      phone: invoice.client.phone,
      document: invoice.client.document,
      clientName: invoice.client.name,
      pixCopyPaste: invoice.pixCopyPaste,
      checkoutUrl: invoice.checkoutUrl,
      gatewayId: invoice.gatewayId,
      linkToken: invoice.linkToken, // link próprio do Elo (spec 0016)
    };
  }

  async updateStatus(
    id: string,
    status: string,
    paidAt?: Date
  ) {

    const result = await prisma.invoice.update({
      where: { id },
      data: { status, paidAt }
    });

    await this.clearPendingInvoicesCache();

    return result;
  }

  async findPendingInvoices(
    page: number = 1,
    limit: number = 10
  ) {

    const tenantId = requireTenantId();
    const cacheKey = `pending-invoices:${tenantId}:${page}:${limit}`;

    /**
     * CACHE READ
     */
    try {

      if (redis?.isOpen) {

        const cachedData =
          await redis.get(cacheKey);

        if (cachedData) {

          console.log('🧠 CACHE HIT');

          return JSON.parse(cachedData);
        }

        console.log('❌ CACHE MISS');
      }

    } catch (error) {

      console.error(
        'Erro ao buscar cache:',
        error
      );

    }

    /**
     * DATABASE
     */
    const skip = (page - 1) * limit;

    const [invoices, totalItems] =
      await prisma.$transaction([
        prisma.invoice.findMany({
          where: {
            tenantId,
            status: 'PENDING',
            client: {
              status: 'EM_ATRASO'
            }
          },
          skip,
          take: limit,
          select: {
            id: true,
            value: true,
            status: true,
            dueDate: true,
            notificationSent: true,
            paidAt: true,
            gatewayId: true,
            client: {
              select: {
                name: true,
                phone: true,
                document: true,
                status: true,
                processed: true
              }
            }
          },
          orderBy: {
            dueDate: 'asc'
          }
        }),
        prisma.invoice.count({
          where: {
            tenantId, // BUGFIX: sem isso o total contava faturas de TODOS os tenants
            status: 'PENDING',
            client: {
              status: 'EM_ATRASO'
            }
          }
        })
      ]);

    const result = {
      invoices,
      meta: {
        totalItems,
        totalPages: Math.ceil(
          totalItems / limit
        ),
        currentPage: page,
        limit
      }
    };

    /**
     * CACHE WRITE
     */
    try {

      if (redis?.isOpen) {

        await redis.set(
          cacheKey,
          JSON.stringify(result),
          {
            EX: 60
          }
        );

      }

    } catch (error) {

      console.error(
        'Erro ao salvar cache:',
        error
      );

    }

    return result;
  }

  /**
   * Marca a fatura como notificada. NÃO sobrescreve os dados de pagamento
   * (gatewayId/PIX/checkout) — esses vêm do gateway na criação da cobrança.
   */
  async markNotificationSent(id: string) {

    const result = await prisma.invoice.update({
      where: { id },
      data: {
        notificationSent: true
      }
    });

    await this.clearPendingInvoicesCache();

    return result;
  }

  async clearPendingInvoicesCache() {

    try {

      if (!redis?.isOpen) {
        return;
      }

      const keys = await redis.keys(
        'pending-invoices:*'
      );

      if (keys.length > 0) {
        await redis.del(keys);
      }

    } catch (error) {

      console.error(
        'Erro ao limpar cache:',
        error
      );

    }
  }

}