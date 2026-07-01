# Spec 0002 — Modelo de Usuário + Signup

- **Status**: Implementada (2026-07-01)
- **Autor**: —
- **Data**: 2026-07-01
- **Roadmap**: PR-05 em `context/production-readiness.md`
- **Dívida relacionada**: D-16 (auth por conta de serviço única)
- **Depende de**: `0001-multi-tenancy.md` (usa `Account`/`tenantId`)

## 1. Problema / Motivação

A autenticação hoje usa uma **conta de serviço única** via env (D-16): sem usuários reais, sem senha no banco, sem onboarding. Para comercializar, cada cliente precisa **criar sua conta** e ter **usuários** que logam com e-mail/senha, vinculados ao seu tenant.

## 2. Objetivo

Introduzir `User` (com senha em hash) e o **signup self-service** que cria um `Account` (tenant) + o usuário dono, além de login por e-mail/senha emitindo o JWT já usado pela app.

**Fora de escopo** (specs futuras): verificação de e-mail, reset de senha, convite de múltiplos usuários por conta, RBAC granular, rate limiting (PR-11).

## 3. Regras de negócio

- **RN-U1**: `User.email` é **único globalmente** (identificador de login).
- **RN-U2**: Senha nunca é armazenada em texto — apenas hash (bcrypt).
- **RN-U3**: O signup cria **atomicamente** um `Account` + um `User` com papel `OWNER`.
- **RN-U4**: O login valida e-mail/senha e emite JWT com `{ sub: userId, tenantId, role }`.
- **RN-U5 (retrocompat/bootstrap)**: enquanto houver `AUTH_USERNAME`/`AUTH_PASSWORD` no ambiente, o login aceita a **conta de serviço** como fallback (tenant default, `role: service`). Desligar = remover as envs.
- **RN-U6**: `findByEmail` (login) e o signup são **entradas globais** (sem contexto de tenant) — o tenant é resolvido/criado ali.

## 4. Impacto no modelo de dados

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  role         String   @default("OWNER") // OWNER (futuro: ADMIN, MEMBER)
  createdAt    DateTime @default(now())
  tenantId     String
  account      Account  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId])
}
```
`Account` ganha a relação `users User[]`. Migração aditiva e idempotente.

## 5. Contrato de API

```
POST /api/auth/register           (público)
Request:  { accountName, name, email, password }
Response: 201 { token, expiresIn }   | 409 { error: "E-mail já cadastrado" } | 400

POST /api/auth/login              (público) — agora por e-mail
Request:  { username, password }   // username = e-mail (ou a conta de serviço de bootstrap)
Response: 200 { token, expiresIn } | 401
```
O JWT resultante já é aceito por `jwtAuth`; `tenantId` vem do usuário/conta.

## 6. Fluxo / Processamento

**Signup**: valida DTO → verifica e-mail livre (RN-U1) → hash da senha → cria `Account` + `User(OWNER)` numa transação → emite JWT.
**Login**: valida DTO → busca `User` por e-mail → confere hash → emite JWT. Se não achar usuário e as credenciais baterem com a conta de serviço (env), emite JWT de serviço (RN-U5).

## 7. Camadas afetadas

- [ ] Schema Prisma / migration — `User` + relação em `Account`
- [ ] DTO — `register.dto.ts` (Zod); `login.dto.ts` inalterado
- [ ] Repository — `user.repository.ts` (`findByEmail`, `createAccountWithOwner`) — global, sem escopo de tenant
- [ ] Service — `AuthService.register` + `AuthService.login` (async, valida hash)
- [ ] Controller/Router — `POST /api/auth/register`
- [ ] Config — `bcrypt` rounds; sem env nova obrigatória
- [ ] Testes — DTOs, login por usuário (hash), signup, fallback de serviço

## 8. Critérios de aceite

- [ ] Signup cria conta + usuário e retorna token válido (com `tenantId` novo).
- [ ] Signup com e-mail já usado → 409.
- [ ] Login com senha correta → token; senha errada → 401.
- [ ] Senha persistida é hash (nunca texto puro).
- [ ] Conta de serviço via env continua logando (fallback) — nada quebra.
- [ ] Dados criados pelo novo usuário ficam no tenant dele (isolamento da spec 0001).

## 9. Riscos / considerações

- **Signup aberto**: sujeito a abuso (contas fake) — mitigar depois com rate limiting (PR-11) e verificação de e-mail.
- **Hash**: `bcryptjs` (JS puro, sem build nativo) com custo 10 — adequado; revisar custo conforme hardware.
- **Bootstrap**: manter a conta de serviço facilita a transição, mas é um segredo compartilhado — planejar a remoção quando houver usuários reais.

## 10. Notas de implementação

- Hash com `bcryptjs` (`hash`/`compare`), custo 10.
- `AuthService` passa a ser **async** e usa `UserRepository`.
- `UserRepository` é **global** (não usa `tenant-context`) — é o ponto que estabelece/cria o tenant.
- Signup cria `Account` + `User` via `prisma.account.create({ data: { name, users: { create: {...} } } })` (atômico).
- Ordem: schema+migration → `prisma generate` → DTO/repo/service/controller/router → testes → docs.

---

## Como foi implementado (2026-07-01)

- **Modelo** `User` (email único global, `passwordHash`, `name`, `role='OWNER'`, `tenantId` FK Account). Migração `20260701010000_user_model` (aditiva, idempotente).
- **`UserRepository`** é **global** (sem `tenant-context`): `findByEmail` e `createAccountWithOwner` (cria Account + User dono via nested create atômico).
- **`AuthService`** agora é **async**: `register` (hash com `bcryptjs` custo 10 → cria conta+dono → emite JWT) e `login` (busca usuário por e-mail → `bcrypt.compare`; senão tenta a conta de serviço via env como fallback de bootstrap).
- **Rotas**: `POST /api/auth/register` (201) e `POST /api/auth/login` (200), públicas. `register` retorna 409 em e-mail repetido.
- **Retrocompat**: a conta de serviço via env continua logando (RN-U5) — nada quebra. `AUTH_USERNAME`/`AUTH_PASSWORD` viram **opcionais** (bootstrap).
- **Testes**: `auth.service` (register/login/fallback com repo mockado + bcrypt real) e DTOs. 48 testes verdes.
- **Não coberto por teste** (precisa de Postgres): `UserRepository` contra o banco (nested create, unicidade de e-mail). Validar em ambiente com banco.
