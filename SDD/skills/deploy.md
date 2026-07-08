# Skill — Deploy (frontend e backend) em produção

Runbook para publicar mudanças em **produção** (`https://useadimplo.com.br`).
Siga sempre que atualizar o **backend** (`billing-automation-api`) ou o
**frontend** (`billing-automation-web`). Leia antes: [`../context/devops-infra.md`](../context/devops-infra.md)
(explica Caddy, SSH, HTTPS e a topologia dos containers).

> **Regra de ouro da ordem:** se você mudou os **dois**, faça o **backend
> primeiro** (ele roda a migration) e o **frontend depois**. Assim, quando o
> front novo chamar um endpoint novo, o banco/rotas já existem.

---

## TL;DR — o que mudou → o que rodar

| Você mudou… | Rode | Onde |
|---|---|---|
| Só **backend** (`billing-automation-api`) | `git push` → `./scripts/deploy.sh` | push local; script **na EC2** (via SSH) |
| Só **frontend** (`billing-automation-web`) | `./scripts/deploy-web.sh` | **na sua máquina** (Git Bash) |
| **Os dois** | backend primeiro, frontend depois | (idem acima, nessa ordem) |

Ambos os scripts são **idempotentes e seguros**: o backend faz rollback
automático se a API não subir saudável; o frontend só troca arquivos estáticos.

---

## Pré-requisitos (configurar uma única vez)

### 1. Chave SSH da EC2
Você precisa do arquivo `.pem` da instância. No formato do Git Bash o caminho
usa `/c/...` (não `C:\...`). Ex.: `/c/Users/cassio.souza/Downloads/billing.pem`.

### 2. Config do deploy do frontend
No repo `billing-automation-web`:
```bash
cp scripts/deploy-web.env.example scripts/deploy-web.env
```
Edite `scripts/deploy-web.env` (NÃO é versionado — fica só na sua máquina):
```bash
EC2_KEY=/c/Users/cassio.souza/Downloads/billing.pem   # caminho da .pem
EC2_HOST=ec2-user@SEU_ELASTIC_IP                        # usuário + IP fixo
# EC2_PATH=~/billing-automation-api/frontend/dist       # opcional; padrão já bate com o Caddy
```

> Nunca comite `.pem`, IP ou segredos. O `.env`/`.pem` moram só na sua máquina
> e na EC2.

---

## Deploy do BACKEND (`billing-automation-api`)

O `deploy.sh` roda **na EC2** e faz, em ordem: `git pull --ff-only` → build da
imagem nova (a antiga segue no ar) → **migrations** em container efêmero →
recria só `api` + `worker` (Caddy fica de pé → site não pisca) → health-check →
**rollback automático** se falhar.

### Passo a passo

**1. Na sua máquina — suba o código para o `main`:**
```bash
# dentro de billing-automation-api
git push origin main
```
O script na EC2 puxa do `main`; se você não fez push, ele vai deployar o código
antigo.

**2. Conecte na EC2 por SSH:**
```bash
ssh -i /c/Users/cassio.souza/Downloads/billing.pem ec2-user@SEU_ELASTIC_IP
```

**3. Na EC2 — rode o deploy:**
```bash
cd ~/billing-automation-api
./scripts/deploy.sh
```

Saída esperada no fim: `✔ API saudável.` e `✔ Deploy concluído com sucesso`.

### Casos especiais

- **"Já está na versão mais recente. Nada a fazer."** → o `git pull` não trouxe
  commit novo. Se você **precisa** rebuildar mesmo assim (ex.: mudou algo fora
  do git, ou quer regenerar a imagem):
  ```bash
  FORCE_BUILD=1 ./scripts/deploy.sh
  ```
- **Migration falhou** → o script **não troca a app** (a antiga segue no ar).
  Corrija a migration, `git push`, e rode de novo. Veja [`db-migration.md`](./db-migration.md).
- **Health-check falhou** → rollback automático para a imagem anterior. Investigue:
  ```bash
  docker compose -f docker-compose.free.yml logs --tail=100 api
  ```

---

## Deploy do FRONTEND (`billing-automation-web`)

Filosofia: **não se builda em produção** (a EC2 free-tier tem só 1 GB de RAM) e
**não se versiona o `dist`**. O `deploy-web.sh` builda na **sua** máquina,
empacota e publica na EC2. O Caddy serve o `dist` por *bind-mount*
(`./frontend/dist:/srv`) e pega os arquivos novos **na hora, sem reiniciar
container**.

### Passo a passo

**Na sua máquina (Git Bash), dentro de `billing-automation-web`:**
```bash
./scripts/deploy-web.sh
```

Ele faz sozinho:
1. `npm run build` → gera o `dist/` local.
2. `tar` + `scp` do `dist` para a EC2.
3. Na EC2: **esvazia o conteúdo** da pasta (preservando o diretório/inode) e
   extrai a build nova.

Saída esperada: `✔ Frontend publicado → https://useadimplo.com.br`.

> **Por que não `git push` no frontend?** O deploy do front não depende do git
> — ele envia o `dist` buildado direto por SSH. Ainda assim, **comite e dê push**
> do código-fonte para manter o repositório como fonte da verdade.

---

## Deploy quando muda os DOIS

```bash
# 1) BACKEND primeiro (roda a migration antes de trocar a app)
#    -- na sua máquina:
git push origin main                       # no billing-automation-api
#    -- na EC2 (via ssh):
cd ~/billing-automation-api && ./scripts/deploy.sh

# 2) FRONTEND depois
#    -- na sua máquina, no billing-automation-web:
./scripts/deploy-web.sh
```

Backend antes garante que o endpoint/tabela novos já existem quando o front novo
os chamar.

---

## Verificação pós-deploy

Rode da sua máquina (usa o stack TLS do Windows via PowerShell):
```powershell
# Site (deve dar 200 e servir o index novo)
Invoke-WebRequest https://useadimplo.com.br/ -UseBasicParsing | Select-Object StatusCode

# Saúde da API (deve dar 200)
Invoke-WebRequest https://useadimplo.com.br/api/health -UseBasicParsing | Select-Object StatusCode
```

> **Atenção ao caminho:** a API é servida sob o prefixo **`/api`**. Um endpoint
> como `POST /api/invoices/:id/payments` sem JWT responde **401** (rota existe).
> Se você testar **sem** o `/api` vai levar **404** — isso é erro de path, não
> de deploy.

Do lado da EC2, para ver os containers:
```bash
cd ~/billing-automation-api
docker compose -f docker-compose.free.yml ps
```

---

## Troubleshooting

### Site em 404 logo após o deploy do frontend
**Sintoma:** `/` e `/index.html` respondem 404, mas `/api/health` responde 200.
**Causa:** o container do Caddy perdeu a referência do *bind-mount* (acontece se
o diretório `frontend/dist` for **apagado** — `rm -rf` na própria pasta — em vez
de ter só o conteúdo esvaziado; o container fica preso no inode antigo).
**Correção imediata (na EC2):**
```bash
cd ~/billing-automation-api
docker compose -f docker-compose.free.yml up -d --force-recreate caddy
```
> O `deploy-web.sh` **já** evita isso (esvazia só o conteúdo com
> `find -mindepth 1 -delete`, preservando o inode). Se você editar o script,
> **nunca** volte a fazer `rm -rf` no diretório do bind-mount.

### API não sobe / health falha
Rollback é automático. Para investigar:
```bash
docker compose -f docker-compose.free.yml logs --tail=200 api
docker compose -f docker-compose.free.yml ps -a
```

### `docker build` falha por falta de espaço
```bash
docker system prune -f            # remove imagens/camadas órfãs
df -h                             # confere espaço livre
```

### Mudei o `Caddyfile`
O `deploy.sh` **não** reinicia o Caddy de propósito (zero downtime). Se mudou a
config do proxy/HTTPS, aplique manualmente:
```bash
cd ~/billing-automation-api
docker compose -f docker-compose.free.yml up -d caddy
```

---

## Relacionados
- [`../context/devops-infra.md`](../context/devops-infra.md) — infra, Caddy, SSH, HTTPS, backup, hardening.
- [`db-migration.md`](./db-migration.md) — como alterar o schema com segurança (expand→contract).
- [`run-and-debug.md`](./run-and-debug.md) — rodar e depurar localmente antes de deployar.
