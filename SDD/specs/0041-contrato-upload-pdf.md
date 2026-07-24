# Spec 0041 — Contrato como arquivo (upload de PDF) — incremento do F14

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-24
- **Relacionada**: 0040 (Contrato no Celular). Incrementa: além de digitar o texto, o
  dono pode **enviar um PDF** pronto.

## 1. Problema / Motivação

Muitos negócios já têm o contrato **em PDF**. Digitar o texto de novo é fricção. Falta
poder **fazer upload** do arquivo e o cliente **ver/assinar** esse PDF no Portal.

## 2. Objetivo

Dois modos no `ContractSetting`: **texto** (0040) ou **arquivo (PDF)**. No modo arquivo,
o dono sobe um PDF (guardado no **banco**, coluna `Bytes` — sem S3, cabe no free tier),
o Portal mostra um botão **"Ver contrato (PDF)"** + o mesmo aceite com prova.

**Fora de escopo:** DOCX/imagens (só PDF, que o navegador abre inline); S3/R2 (evolução);
assinatura com certificado ICP-Brasil.

## 3. Regras de negócio

- **RN-4101** — `ContractSetting.mode` ∈ {`text`,`file`}. No `file`: `fileName`, `fileMime`
  (`application/pdf`), `fileSize`, `fileData` (Bytes). Subir novo arquivo **sobe a versão**.
- **RN-4102** — Upload valida **PDF de verdade** (mime `application/pdf` **e** magic `%PDF-`)
  e **≤ 5 MB**. Corpo enviado como **binário cru** (Content-Type `application/pdf`), parser
  dedicado (`express.raw`, limite 6 MB) — sem mexer no limite global.
- **RN-4103** — O PDF é servido por rota que faz **stream** dos bytes com `application/pdf`:
  dono (`GET /api/contract/file`, JWT) e Portal (`GET /public/portal/:token/contract/file`, público).
- **RN-4104** — "Em dia com o contrato" e aceite (0040) valem igual — a prova é a mesma;
  o que muda é a apresentação (texto vs PDF).

## 4. Dados

`ContractSetting` ganha `mode`, `fileName`, `fileMime`, `fileSize`, `fileData Bytes?`
(migration aditiva idempotente). Sem tabela nova.

## 5. API

```
PUT  /api/contract/file?name=<arquivo.pdf>   (JWT, body binário application/pdf) → { mode, fileName, fileSize, version }
GET  /api/contract/file                      (JWT) → stream do PDF (preview do dono)
GET  /public/portal/:token/contract/file     (público) → stream do PDF (cliente)
GET  /public/portal/:token                   → contract agora tem { mode, fileName } (body vazio no modo file)
```

## 6. Aceite

- [ ] Dono envia PDF → modo file, versão sobe; troca por texto volta ao modo text.
- [ ] Portal mostra "Ver contrato (PDF)" e permite assinar (prova igual).
- [ ] Upload rejeita não-PDF e > 5 MB. Suíte verde + build limpo.
