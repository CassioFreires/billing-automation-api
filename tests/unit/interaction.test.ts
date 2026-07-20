import { describe, it, expect } from 'vitest';
import {
  isHesitating,
  InteractionType,
  DEFAULT_HESITATION_OPENS,
} from '../../src/domain/interaction.js';

describe('isHesitating (semente do Botão de Alívio — M2)', () => {
  it('true quando abriu >= limiar e ainda NÃO pagou', () => {
    expect(isHesitating({ [InteractionType.OPEN]: DEFAULT_HESITATION_OPENS })).toBe(true);
    expect(isHesitating({ [InteractionType.OPEN]: 5 })).toBe(true);
  });

  it('false quando já pagou, mesmo com muitas aberturas', () => {
    expect(
      isHesitating({ [InteractionType.OPEN]: 9, [InteractionType.PAID]: 1 })
    ).toBe(false);
  });

  it('false quando abriu menos que o limiar', () => {
    expect(isHesitating({ [InteractionType.OPEN]: DEFAULT_HESITATION_OPENS - 1 })).toBe(false);
    expect(isHesitating({})).toBe(false);
  });

  it('respeita um limiar customizado', () => {
    expect(isHesitating({ [InteractionType.OPEN]: 2 }, 2)).toBe(true);
    expect(isHesitating({ [InteractionType.OPEN]: 1 }, 2)).toBe(false);
  });
});
