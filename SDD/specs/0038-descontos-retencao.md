# Spec 0038 — Descontos de retenção configuráveis (F11.1)

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-24
- **Relacionada**: 0037 (retenção/F11 — este é o incremento concreto do desconto),
  0009 (assinaturas/geração recorrente), 0035 (Radar/F2). Roadmap: F11.

## 1. Problema / Motivação

No F11 (0037) a oferta "desconto" é só uma **recomendação de texto**: não há valor,
não aplica nada e não é gerenciável — o dono teria que dar o desconto na mão. Falta
tornar o desconto **concreto** (um % de verdade, aplicado nas próximas faturas) e
**configurável** (o dono define o padrão), com **visibilidade** de quanto/até quando.

## 2. Objetivo

- **Configurar** por conta: desconto **padrão (%)** + **duração (meses)** + liga/desliga
  das ofertas (`RetentionSetting`, 1 por tenant).
- **Aplicar de verdade**: ao salvar com desconto, gravar na assinatura um desconto
  **ativo** (`discountPercent` + `discountUntil`); a **geração recorrente** aplica o
  desconto nas faturas **enquanto valer** e volta ao valor cheio depois — automático.
- **Ver**: valor real no modal ("30% por 2 meses"), selo na assinatura ("Desconto
  ativo: 30% até 09/2026") e registro no pedido.

**Fora de escopo:** desconto em valor fixo (v1 é **percentual**); downgrade concreto
(depende de "planos", maior); cupom/código; múltiplos descontos empilhados.

## 3. Regras de negócio

- **RN-3801** — `RetentionSetting` por tenant: `discountPercent` (0–100, default 30),
  `discountDurationMonths` (1–12, default 2), `discountEnabled`, `pauseEnabled`. Upsert
  idempotente; ausência → defaults.
- **RN-3802** — Ao resolver `saved` com oferta `discount`, grava na assinatura
  `discountPercent` e `discountUntil = addMonths(hoje, meses)`. O % e os meses podem
  ser **sobrescritos** na hora (senão usam o padrão). Não pausa/cancela a assinatura.
- **RN-3803** — Na geração recorrente (spec 0009), se a assinatura tem desconto **ativo**
  para a competência (`discountUntil >= dueDate`), a fatura é gerada com
  `valor × (1 − %/100)` (2 casas); senão, valor cheio. Fora da janela → volta sozinho.
- **RN-3804** — Aplicar desconto exige `discountEnabled`; pausar exige `pauseEnabled`.
- **RN-3805** — Escopo por tenant. `applyDiscount`/`isDiscountActive` são **puros/testáveis**.

## 4. Impacto no modelo de dados

Migration **aditiva idempotente**:
```prisma
model RetentionSetting {
  tenantId               String  @id
  discountPercent        Int     @default(30)   // 0..100
  discountDurationMonths Int     @default(2)    // 1..12
  discountEnabled        Boolean @default(true)
  pauseEnabled           Boolean @default(true)
}
// Subscription (novos campos — desconto ativo):
//   discountPercent Int?      // % ativo
//   discountUntil   DateTime? // válido até (competência)
// CancellationRequest (histórico do que foi aplicado):
//   appliedPercent  Int?
//   appliedUntil    DateTime?
```

## 5. Contrato de API

```
GET  /api/retention/settings         (JWT) → { discountPercent, discountDurationMonths, discountEnabled, pauseEnabled }
PUT  /api/retention/settings         (JWT) { discountPercent?, discountDurationMonths?, discountEnabled?, pauseEnabled? }
POST /api/retention/requests         → agora inclui na resposta a config sugerida (percent/meses)
POST /api/retention/requests/:id/resolve  { outcome, offer?, discountPercent?, discountMonths? }
```

## 6. Fluxo

`openRequest` carrega `RetentionSetting` → devolve, além da oferta, o **valor sugerido**
(`suggestedPercent`/`suggestedMonths`) para o modal exibir "30% por 2 meses".
`resolveRequest(saved, discount, percent?, months?)` → grava desconto ativo na
assinatura + `appliedPercent/appliedUntil` no pedido. `SubscriptionService.run` aplica
o desconto ativo ao gerar a fatura (RN-3803).

## 7. Camadas afetadas

- [ ] Schema/migration — `RetentionSetting` + `Subscription.discount*` + `CancellationRequest.applied*`.
- [ ] Domínio — `save-offer.ts`: `applyDiscount`, `isDiscountActive`, `addMonths` (puras + testes).
- [ ] Repo/Service — `RetentionSettingRepository`+`Service` (get/upsert); `RetentionService` aplica desconto; `RetentionRepository.applyDiscountToSubscription`.
- [ ] Billing — `SubscriptionService.run` aplica desconto ativo no valor gerado.
- [ ] Rotas — `GET/PUT /api/retention/settings`; resolve aceita percent/months.
- [ ] Frontend — modal mostra/edita "% por N meses"; Configurações → seção Retenção; selo de desconto ativo na assinatura.
- [ ] Testes — `applyDiscount`/`isDiscountActive`; service (grava desconto; respeita enabled); billing aplica desconto.
- [ ] Contexto — `domain-model.md`.

## 8. Critérios de aceite

- [ ] Config salva o padrão (%, meses) por tenant; ausência = defaults.
- [ ] Salvar com desconto grava `discountPercent`/`discountUntil` na assinatura.
- [ ] Próxima fatura gerada sai com o desconto; após a janela, volta ao cheio.
- [ ] Modal mostra o valor real; assinatura mostra o selo; suíte verde + build limpo.

## 9. Notas de implementação

_(preencher: desconto fixo/cupom como follow-up; downgrade depende de planos.)_
