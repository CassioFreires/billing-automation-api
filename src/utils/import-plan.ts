import { ImportClientRowDTO } from '../dtos/importClients.dto.js';

export interface ImportPlan {
  toCreate: ImportClientRowDTO[]; // telefones novos → createMany
  toUpdate: ImportClientRowDTO[]; // telefones já existentes → update
  ignorados: number;              // duplicatas DENTRO do lote (última vence)
}

/**
 * Planeja um import de clientes (spec 0008) — parte PURA e testável:
 *   1. Deduplica por telefone (a ÚLTIMA ocorrência vence; anteriores contam
 *      como `ignorados`).
 *   2. Separa em criar (telefone ainda não existe no tenant) vs. atualizar.
 *
 * `existingPhones` é o conjunto de telefones que já existem no banco para o
 * tenant (obtido em UMA query batch pelo repositório) — evita o N+1 de um
 * findUnique por linha.
 */
export function planImport(
  rows: ImportClientRowDTO[],
  existingPhones: Set<string>
): ImportPlan {
  const byPhone = new Map<string, ImportClientRowDTO>();
  let ignorados = 0;

  for (const row of rows) {
    if (byPhone.has(row.phone)) ignorados++;
    byPhone.set(row.phone, row); // última ocorrência vence
  }

  const toCreate: ImportClientRowDTO[] = [];
  const toUpdate: ImportClientRowDTO[] = [];

  for (const row of byPhone.values()) {
    if (existingPhones.has(row.phone)) {
      toUpdate.push(row);
    } else {
      toCreate.push(row);
    }
  }

  return { toCreate, toUpdate, ignorados };
}
