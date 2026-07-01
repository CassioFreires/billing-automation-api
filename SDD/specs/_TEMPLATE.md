# Spec NNNN — <Título da Feature>

- **Status**: Rascunho | Em revisão | Aprovada | Implementada
- **Autor**: <nome>
- **Data**: AAAA-MM-DD
- **Dívida relacionada**: <D-xx, se houver — ver context/tech-debt.md>

## 1. Problema / Motivação

O que precisamos resolver e por quê. Qual dor do negócio ou do usuário.

## 2. Objetivo

O que esta feature entrega, em 1–3 frases. O que está **fora de escopo**.

## 3. Regras de negócio

Liste as regras (use IDs no estilo RN-*). Referencie/atualize `context/domain-model.md`.

- RN-X1: ...
- RN-X2: ...

## 4. Impacto no modelo de dados

- Entidades/campos novos ou alterados (ver `skills/db-migration.md`).
- Migrations necessárias.
- Estados/transições afetados.

## 5. Contrato de API (se aplicável)

Para cada endpoint:

```
MÉTODO /api/<caminho>
Request:  { ...DTO... }
Response: 2xx { ... }  |  4xx { error }
```

Validação (Zod) e códigos de status.

## 6. Fluxo / Processamento

Descreva o fluxo passo a passo. Se envolver fila/worker, especifique a fila, o payload e o consumidor (ver `skills/add-worker-consumer.md`).

## 7. Camadas afetadas

- [ ] DTO — `src/dtos/...`
- [ ] Repository — `src/repositories/...`
- [ ] Service — `src/services/...`
- [ ] Controller — `src/controllers/...`
- [ ] Router — `src/routers/...`
- [ ] Worker — `src/works/...`
- [ ] Schema Prisma / migration
- [ ] Integração externa — `src/apis/...`

## 8. Critérios de aceite

Testáveis e objetivos:

- [ ] Dado ... quando ... então ...
- [ ] ...

## 9. Riscos / considerações

Segurança, performance, compatibilidade, dívida técnica introduzida.

## 10. Notas de implementação

Preenchido durante/após a implementação: decisões, o que ficou de fora, follow-ups a registrar em `tech-debt.md`.
