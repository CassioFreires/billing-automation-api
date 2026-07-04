import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Converte, na SAÍDA da API, qualquer `Prisma.Decimal` para `number`.
 *
 * Por quê: no banco o dinheiro é `Decimal` (exato, sem erro de ponto flutuante),
 * mas o Prisma devolve instâncias de `Prisma.Decimal` que, no `JSON.stringify`,
 * viram **string** (`"100.50"`). O frontend espera **number**. Este middleware
 * mantém o contrato da API em `number` sem tocar em cada controller: o `Decimal`
 * fica só de portões para dentro (banco + cálculos).
 */
function decimalsToNumber(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value; // res.json cuida do toISOString
  if (Array.isArray(value)) return value.map(decimalsToNumber);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = decimalsToNumber((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function serializeDecimal(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => originalJson(decimalsToNumber(body));
  next();
}
