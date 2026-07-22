# Spec 0030 — Multi-usuário e papéis no tenant

- **Status**: Implementada
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-21
- **Relacionada**: spec 0002 (User/signup), 0023/0031 (papéis de plataforma — distintos)

## 1. Problema / Motivação

Cada conta tinha apenas o usuário OWNER. Empresas reais têm mais de uma pessoa operando
(recepção, financeiro) e não devem compartilhar a mesma senha nem ter o mesmo poder. Faltava
**multi-usuário por tenant** com **papéis** (níveis de acesso).

## 2. Objetivo

Permitir convidar usuários no tenant e definir seu papel, com autorização por papel.

- **Em escopo:** papéis OWNER/ADMIN/MEMBER; gestão de equipe (listar, convidar, mudar papel,
  remover); autorização (`requireRole`); `GET /api/auth/me` (o front sabe o papel); UI "Equipe".
- **Fora de escopo:** convite por e-mail com link mágico (aqui o dono define a senha inicial);
  transferência de propriedade (promover a OWNER); permissões finas por recurso (só o nível de
  gestão de equipe é gated nesta versão).

## 3. Regras de negócio

- **RN-3001** — Só **OWNER/ADMIN** acessam a gestão de equipe (`requireRole`).
- **RN-3002** — Convite cria um usuário **ADMIN/MEMBER** no tenant (OWNER não se cria por convite);
  e-mail é único global (`EMAIL_TAKEN`).
- **RN-3003** — Toda ação de gestão exige que o alvo pertença ao **mesmo tenant** do ator.
- **RN-3004** — Nunca deixar o tenant **sem OWNER** (não remove/rebaixa o último dono).
- **RN-3005** — Só **OWNER** gerencia outro **OWNER**; ADMIN gerencia apenas ADMIN/MEMBER.
- **RN-3006** — Ninguém gerencia **a si mesmo** por esta tela (evita auto-lockout).

## 4. Impacto no modelo de dados

Nenhum campo novo: reusa `User.role` (OWNER default; agora também ADMIN/MEMBER) e `tenantId`.
O JWT já carrega `role` (usado por `requireRole`).

## 5. Contrato de API

```
GET    /api/auth/me            (JWT)                → { id, name, email, role, tenantId }
GET    /api/team               (JWT, OWNER/ADMIN)   → [{ id, name, email, role, createdAt }]
POST   /api/team               (JWT, OWNER/ADMIN)   → { name, email, password, role(ADMIN|MEMBER) }
PATCH  /api/team/:id/role      (JWT, OWNER/ADMIN)   → { role(ADMIN|MEMBER) }
DELETE /api/team/:id           (JWT, OWNER/ADMIN)   → { deleted: true }
```

## 6. Fluxo / Processamento

`teamRouter` = `jwtAuth` + `requireRole('OWNER','ADMIN')`. O `TeamService` aplica as regras
(último dono, escopo de tenant, OWNER só por OWNER, não-self). O front lê `GET /auth/me` para
mostrar a aba "Equipe" só a quem gerencia e para exibir nome/papel na sidebar.

## 7. Camadas afetadas

- [x] Domain — `src/domain/roles.ts`
- [x] Middleware — `src/middlewares/require-role.middleware.ts`
- [x] DTO — `src/dtos/team.dto.ts`
- [x] Repository — `UserRepository` (listByTenant, findByIdInTenant, createMember, updateRole, deleteById, countOwners)
- [x] Service — `src/services/team.service.ts`; `AuthService.getProfile`
- [x] Controller/Router — `team.controller`/`team.router` (`/api/team`); `auth` (`/api/auth/me`)
- [x] Frontend — `me`/`team` services+hooks, página `/equipe`, item na sidebar (OWNER/ADMIN), perfil na sidebar

## 8. Critérios de aceite

- [ ] OWNER/ADMIN veem a aba Equipe; MEMBER não.
- [ ] Convidar cria o usuário; e-mail repetido → 409.
- [ ] ADMIN não consegue remover/rebaixar OWNER; OWNER sim (se houver outro OWNER).
- [ ] Remover o último OWNER é bloqueado.
- [ ] Token de MEMBER em `/api/team` → 403.

## 9. Riscos / considerações

- **Papel no JWT é estático** até o próximo login: mudar o papel de alguém só reflete quando essa
  pessoa relogar. Aceitável na v1 (follow-up: invalidar/rotacionar sessão).
- **Gating fino:** por ora só a gestão de equipe é gated por papel; gating de settings/escrita por
  MEMBER é follow-up (hoje MEMBER opera como antes).

## 10. Notas de implementação

- `requireRole` lê `req.auth.role`. `TeamService` testado (7 casos): convite, e-mail repetido,
  self-manage, ADMIN×OWNER, último OWNER, remoção comum, escopo de tenant. Suíte API: 292 verdes.
- Follow-ups: convite por e-mail (link/senha temporária), transferência de propriedade, gating de
  escrita por papel, sessão sensível a mudança de papel.
