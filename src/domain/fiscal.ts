/**
 * NFS-e / Nota Fiscal de Serviço (spec 0047, F7). Funções PURAS: máquina de
 * estados da nota, mapeamento do status do provider e validação da emissão.
 * Sem I/O — testável isoladamente. Modelo alinhado à API da NFE.io
 * (status: None/Created/Issued/Cancelled/Error).
 */

export type FiscalStatus = 'pending' | 'processing' | 'issued' | 'error' | 'cancelled';

export class FiscalValidationError extends Error {}

/**
 * Mapeia o status do provider (NFE.io e afins) para o nosso.
 * None/Created → processando; Issued → emitida; Cancelled → cancelada; Error → erro.
 */
export function mapProviderStatus(providerStatus: string | undefined | null): FiscalStatus {
  switch ((providerStatus ?? '').toLowerCase()) {
    case 'issued':
      return 'issued';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'error':
      return 'error';
    case 'created':
    case 'processing':
    case 'none':
      return 'processing';
    default:
      return 'processing';
  }
}

/**
 * Guarda de transição da nota. Uma nota não "desemite": emitida só vai para
 * cancelada; cancelada/erro são terminais (erro pode ser reemitido = nova nota).
 */
export function canTransitionFiscal(from: FiscalStatus, to: FiscalStatus): boolean {
  if (from === to) return true;
  const allowed: Record<FiscalStatus, FiscalStatus[]> = {
    pending: ['processing', 'issued', 'error', 'cancelled'],
    processing: ['issued', 'error', 'cancelled'],
    issued: ['cancelled'],
    error: [],
    cancelled: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

/** Só notas EMITIDAS podem ser canceladas. */
export function canCancelFiscal(status: FiscalStatus): boolean {
  return status === 'issued';
}

export interface EmissionInput {
  borrowerName: string;
  borrowerDocument: string; // CPF/CNPJ (só dígitos)
  amount: number;
  description: string;
  cityServiceCode: string;
}

/** Valida os dados mínimos para emitir. Lança em dado inválido. */
export function validateEmission(input: EmissionInput): void {
  const doc = (input.borrowerDocument ?? '').replace(/\D/g, '');
  if (doc.length !== 11 && doc.length !== 14) {
    throw new FiscalValidationError('Documento do tomador (CPF/CNPJ) inválido.');
  }
  if (!input.borrowerName || input.borrowerName.trim().length < 2) {
    throw new FiscalValidationError('Nome do tomador é obrigatório.');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new FiscalValidationError('Valor do serviço deve ser maior que zero.');
  }
  if (!input.cityServiceCode || !input.cityServiceCode.trim()) {
    throw new FiscalValidationError('Código de serviço municipal (cityServiceCode) é obrigatório.');
  }
  if (!input.description || !input.description.trim()) {
    throw new FiscalValidationError('Descrição do serviço é obrigatória.');
  }
}
