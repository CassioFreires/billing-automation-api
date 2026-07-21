import { OnboardingRepository } from '../repositories/onboarding.repository.js';
import { UpdateOnboardingDTO } from '../dtos/onboarding.dto.js';

export type OnboardingStepKey = 'gateway' | 'whatsapp' | 'client' | 'invoice';

export interface OnboardingStep {
  key: OnboardingStepKey;
  title: string;
  description: string;
  done: boolean;
  optional: boolean;
  skipped?: boolean;
  cta: { label: string; to: string };
}

export interface OnboardingStatus {
  completed: boolean;
  dismissed: boolean;
  progress: { done: number; total: number };
  steps: OnboardingStep[];
}

/**
 * Onboarding guiado (spec 0021). O progresso é DERIVADO de dados reais da conta
 * (gateway/cliente/fatura) + duas flags de UI (dispensar, pular WhatsApp). É
 * somente leitura + dispensa/pular — sem gating de plano (RN-2106): tem de
 * funcionar no trial, no Free e mesmo com a escrita bloqueada (paywall).
 */
export class OnboardingService {
  private repo: OnboardingRepository;

  constructor(deps?: { repo?: OnboardingRepository }) {
    this.repo = deps?.repo ?? new OnboardingRepository();
  }

  /** Status completo para o checklist/banner do front. */
  async getStatus(): Promise<OnboardingStatus> {
    const [state, hasGateway, hasWhatsapp, hasClients, hasInvoices] = await Promise.all([
      this.repo.findState(),
      this.repo.hasPaymentSetting(),
      this.repo.hasWhatsappSetting(),
      this.repo.hasClients(),
      this.repo.hasInvoices(),
    ]);

    const dismissed = state?.dismissed ?? false;
    const whatsappSkipped = state?.whatsappSkipped ?? false;

    // RN-2102/2103: WhatsApp é opcional (feito ao configurar OU pular). Gateway
    // conta com qualquer provider salvo (incl. Simulado) — prod-ready.
    const whatsappDone = hasWhatsapp || whatsappSkipped;

    const steps: OnboardingStep[] = [
      {
        key: 'gateway',
        title: 'Configurar recebimento',
        description:
          'Escolha por onde você recebe. Pode seguir no "Simulado" para testar agora.',
        done: hasGateway,
        optional: false,
        cta: { label: 'Configurar gateway', to: '/settings' },
      },
      {
        key: 'whatsapp',
        title: 'Conectar o WhatsApp',
        description:
          'Por qual número as cobranças são enviadas. Opcional — dá para pular por enquanto.',
        done: whatsappDone,
        optional: true,
        skipped: whatsappSkipped,
        cta: { label: 'Conectar WhatsApp', to: '/settings' },
      },
      {
        key: 'client',
        title: 'Cadastrar o 1º cliente',
        description: 'Quem você vai cobrar. Nome, telefone e documento.',
        done: hasClients,
        optional: false,
        cta: { label: 'Novo cliente', to: '/clients?new=1' },
      },
      {
        key: 'invoice',
        title: 'Emitir a 1ª cobrança',
        description: 'Gere a primeira fatura e veja o link do Adimplo nascer.',
        done: hasInvoices,
        optional: false,
        cta: { label: 'Nova cobrança', to: '/invoices?new=1' },
      },
    ];

    // RN-2104: completo quando todos os passos (obrigatórios + o opcional
    // resolvido) estão "done".
    const done = steps.filter((s) => s.done).length;
    const total = steps.length;
    const completed = steps.every((s) => s.done);

    return { completed, dismissed, progress: { done, total }, steps };
  }

  /** Aplica dispensa/pular (RN-2102/2105) e devolve o status atualizado. */
  async update(dto: UpdateOnboardingDTO): Promise<OnboardingStatus> {
    const data: { dismissed?: boolean; whatsappSkipped?: boolean } = {};
    if (dto.dismiss !== undefined) data.dismissed = dto.dismiss;
    if (dto.skipWhatsapp !== undefined) data.whatsappSkipped = dto.skipWhatsapp;
    await this.repo.upsertState(data);
    return this.getStatus();
  }
}
