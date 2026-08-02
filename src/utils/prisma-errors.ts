import { Prisma } from '@prisma/client';

/** Violação de unique (P2002) — detecta corrida na reserva/criação idempotente. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
