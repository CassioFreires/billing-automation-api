import { ImportInvoiceRowDTO } from '../dtos/importInvoices.dto.js';

export interface PlannedInvoiceRow {
  row: ImportInvoiceRowDTO;
  index: number; // linha original (0-based) para reportar erros
  clientId: string;
}

export interface InvoiceImportPlan {
  toCreate: PlannedInvoiceRow[];
  erros: { linha: number; clientPhone: string; motivo: string }[];
}

/**
 * Planeja um import de faturas (spec 0024) — parte PURA e testável.
 * Resolve o cliente pelo telefone usando o mapa `clientIdByPhone` (obtido em UMA
 * query batch). Telefone desconhecido → entra em `erros` (RN-2402), a linha 1-based.
 */
export function planInvoiceImport(
  rows: ImportInvoiceRowDTO[],
  clientIdByPhone: Map<string, string>
): InvoiceImportPlan {
  const toCreate: PlannedInvoiceRow[] = [];
  const erros: { linha: number; clientPhone: string; motivo: string }[] = [];

  rows.forEach((row, index) => {
    const clientId = clientIdByPhone.get(row.clientPhone);
    if (!clientId) {
      erros.push({
        linha: index + 1,
        clientPhone: row.clientPhone,
        motivo: 'Cliente não encontrado (importe o cliente antes)',
      });
      return;
    }
    toCreate.push({ row, index, clientId });
  });

  return { toCreate, erros };
}
