import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Acesso ao estado do onboarding (spec 0021). Escopo por tenant.
 *
 * Além da linha `OnboardingState` (flags de UI), expõe os SINAIS DERIVADOS que
 * definem o progresso dos passos — cada um é um `exists` barato, indexado por
 * tenantId (padrão do Cockpit: compor via Promise.all no service).
 */
export class OnboardingRepository {
  /** Linha de flags do tenant (ou null se ele nunca dispensou/pulou nada). */
  async findState() {
    return prisma.onboardingState.findUnique({
      where: { tenantId: requireTenantId() },
    });
  }

  /** Cria ou atualiza as flags de UI do tenant atual. */
  async upsertState(data: { dismissed?: boolean; whatsappSkipped?: boolean }) {
    const tenantId = requireTenantId();
    return prisma.onboardingState.upsert({
      where: { tenantId },
      update: { ...data },
      create: {
        tenantId,
        dismissed: data.dismissed ?? false,
        whatsappSkipped: data.whatsappSkipped ?? false,
      },
    });
  }

  /** Existe alguma configuração de gateway salva? (qualquer provider, incl. mock) */
  async hasPaymentSetting(): Promise<boolean> {
    const row = await prisma.paymentSetting.findUnique({
      where: { tenantId: requireTenantId() },
      select: { id: true },
    });
    return row !== null;
  }

  /** Existe configuração de WhatsApp salva? */
  async hasWhatsappSetting(): Promise<boolean> {
    const row = await prisma.whatsappSetting.findUnique({
      where: { tenantId: requireTenantId() },
      select: { id: true },
    });
    return row !== null;
  }

  /** O tenant já cadastrou ao menos um cliente? */
  async hasClients(): Promise<boolean> {
    const row = await prisma.client.findFirst({
      where: { tenantId: requireTenantId() },
      select: { id: true },
    });
    return row !== null;
  }

  /** O tenant já emitiu ao menos uma cobrança? */
  async hasInvoices(): Promise<boolean> {
    const row = await prisma.invoice.findFirst({
      where: { tenantId: requireTenantId() },
      select: { id: true },
    });
    return row !== null;
  }
}
