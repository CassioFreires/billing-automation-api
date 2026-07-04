# DevOps & Infraestrutura — do código ao ar (guia do zero)

> **Para quem é isto:** alguém que sabe programar mas nunca colocou um sistema
> na internet com domínio, HTTPS e deploy automatizado. Está em **ordem
> cronológica**: é a história real de como o **Adimplo** saiu de "roda na minha
> máquina" para "está no ar em `https://useadimplo.com.br`". Cada etapa tem uma
> caixa **💡 Conceito** explicando o termo novo em linguagem de gente.
>
> Complementa (não substitui): a regra de negócio está em
> [`domain-model.md`](./domain-model.md), o fluxo ponta-a-ponta em
> [`fluxo-completo.md`](./fluxo-completo.md), o código em
> [`architecture.md`](./architecture.md). Os termos soltos estão no
> [`glossario.md`](./glossario.md).

---

## 0. O ponto de partida

O sistema já **rodava**: uma EC2 (servidor da AWS) com Docker subindo a API, o
worker, Postgres, RabbitMQ e Redis. Mas o acesso era pelo **IP cru na porta
3000** (`http://18.x.x.x:3000`) — sem domínio, sem cadeado, sem nada pronto para
um usuário real. Levar isso "ao ar" de verdade tem uma sequência natural, que é
a ordem dos capítulos abaixo.

> 💡 **Conceito — EC2 / "a máquina" / servidor**
> EC2 é um **computador alugado da Amazon** que fica ligado 24h na internet. É
> igual ao seu PC, mas sem tela: você entra nele por comando (SSH, ver §6) e
> tudo o que roda ali (Docker, banco…) fica disponível para o mundo — desde que
> você libere as portas certas (§3).

---

## 1. IP fixo (Elastic IP)

**Problema:** o IP público de uma EC2 **muda** toda vez que a máquina
reinicia. Se o domínio aponta para um IP e ele muda, o site cai.

**Solução:** alocamos um **Elastic IP** (`3.142.106.14`) e o associamos à
instância. É um endereço **permanente**.

> 💡 **Conceito — IP, IP público vs. Elastic IP**
> Um **IP** é o "número de telefone" de um computador na internet
> (`3.142.106.14`). O IP público comum da AWS é **emprestado** — muda quando a
> máquina desliga. O **Elastic IP** é um número **reservado só para você**, que
> não muda. É de graça enquanto estiver associado a uma máquina ligada.

---

## 2. DNS — apontar o domínio para o IP

Compramos o domínio `useadimplo.com.br` (na HostGator) e, no painel de DNS,
criamos **registros A** apontando para o Elastic IP:

| Tipo | Host | Aponta para | Serve |
|------|------|-------------|-------|
| A | `@` (raiz) | `3.142.106.14` | o site (`useadimplo.com.br`) |
| A | `www` | `3.142.106.14` | `www.useadimplo.com.br` |
| A | `api` | `3.142.106.14` | a API (`api.useadimplo.com.br`) |

> 💡 **Conceito — DNS e registro A**
> **DNS** é a "agenda de contatos" da internet: traduz um **nome**
> (`useadimplo.com.br`) para um **IP** (`3.142.106.14`). O **registro A** é a
> linha dessa agenda que diz "esse nome → esse IP". Um **subdomínio** (`api.`,
> `www.`) é só um prefixo apontando para onde você quiser — pode ser o mesmo IP.
> Mudanças em DNS podem levar minutos para "propagar" (espalhar pelo mundo).

---

## 3. Abrir as portas certas (Security Group)

Uma EC2 nasce com quase tudo **fechado**. Para o mundo conseguir acessar o site,
liberamos no **Security Group** as portas **80** (HTTP) e **443** (HTTPS). A
porta **22** (SSH) já estava aberta.

Mais tarde (§10) **fechamos** uma porta que estava exposta indevidamente (a 3000
da API).

> 💡 **Conceito — porta e Security Group (firewall)**
> Uma **porta** é um "canal numerado" de um computador; cada serviço escuta numa
> porta (site = 80/443, SSH = 22, a API interna = 3000). O **Security Group** é o
> **firewall** da AWS: uma lista de "quem pode bater em qual porta". `0.0.0.0/0`
> em *Source* significa **"qualquer um na internet"**. Regra de ouro: só abra a
> porta que precisa estar pública; o resto fica fechado.

---

## 4. HTTPS automático com Caddy

Ter o domínio apontando para a máquina não basta: faltava **alguém atender** na
porta 443 e entregar o site com o cadeado 🔒. Esse "alguém" é o **Caddy**, que
adicionamos como um container no `docker-compose.free.yml`. A configuração dele
vive no arquivo [`Caddyfile`](../../Caddyfile).

O Caddy faz três coisas:
1. Escuta em 80/443 (é a **porta de entrada** de tudo).
2. Pega e **renova sozinho** o certificado HTTPS (via Let's Encrypt).
3. **Repassa** cada visita para o container interno certo.

```
Visitante → https://useadimplo.com.br → [Caddy :443] ─┬─ /api/* → api:3000  (a API)
                                                       └─ resto  → /srv      (o site)
Visitante → https://api.useadimplo.com.br → [Caddy :443] → api:3000
```

> 💡 **Conceito — reverse proxy, HTTPS/TLS, certificado, Let's Encrypt**
> - **HTTPS** é o HTTP com criptografia — o cadeado. Sem ele, navegadores marcam
>   "não seguro" e bloqueiam coisas.
> - Para ter HTTPS você precisa de um **certificado TLS**, emitido por uma
>   autoridade confiável e **renovado a cada ~90 dias**.
> - **Let's Encrypt** é uma autoridade que emite certificados **de graça**,
>   automaticamente, via robô.
> - **Reverse proxy** é um "porteiro": recebe todas as visitas num só lugar e as
>   **encaminha** para o serviço interno certo. O **Caddy** é um reverse proxy que
>   ainda por cima fala com o Let's Encrypt sozinho — por isso a config são 3
>   linhas em vez de dezenas (como seria no nginx + certbot).

**Por que a API também no mesmo domínio (`/api`) e não só no subdomínio?**
Porque o navegador trata "domínios diferentes" como **origens diferentes** e
exige **CORS** (permissão explícita). Servindo o site e a API no **mesmo
domínio** (`useadimplo.com.br` e `useadimplo.com.br/api`), é tudo "mesma origem"
→ zero CORS. O subdomínio `api.` continua existindo para acesso direto/webhooks.

---

## 5. Servir o frontend (o site React)

O frontend é um projeto separado (`billing-automation-web`). Ele é **buildado**
(compilado) e vira uma pasta de arquivos estáticos, o `dist/`. Essa pasta fica
no disco da EC2 em `~/billing-automation-api/frontend/dist`, e o Caddy a serve
via um **bind mount** (`./frontend/dist:/srv`).

> 💡 **Conceito — build/artefato e "não se builda em produção"**
> **Buildar** = transformar o código-fonte em algo pronto para rodar. O
> resultado (`dist/`) é um **artefato**: gerado, descartável, **nunca versionado
> no git** (por isso `dist/` está no `.gitignore`). Regra de ouro: **buildar na
> sua máquina** (que tem RAM sobrando) e só **enviar o resultado** para o
> servidor — nunca buildar no servidorzinho de 1GB.

> 💡 **Conceito — SPA e fallback para index.html**
> O site é uma **SPA** (Single Page Application): um único `index.html` + JS que
> desenha todas as telas. Por isso o Caddy tem `try_files {path} /index.html` —
> qualquer rota que não seja arquivo real cai no `index.html`, e o React resolve
> a navegação. Sem isso, dar F5 numa rota interna daria 404.

---

## 6. Entrar no servidor: SSH

Todo comando que você roda "na EC2" é feito por **SSH**, usando uma **chave
`.pem`** (o arquivo que a AWS te deu ao criar a máquina):

```bash
ssh -i /caminho/chave.pem ec2-user@3.142.106.14
```

> 💡 **Conceito — SSH e chave .pem**
> **SSH** (Secure Shell) é o jeito de "abrir um terminal" numa máquina remota com
> segurança. Em vez de senha, usa um **par de chaves**: a **privada** (o arquivo
> `.pem`, que só você tem) prova que é você; a **pública** fica no servidor. Quem
> não tem a chave não entra. Nunca compartilhe/comite o `.pem`.
>
> **Túnel SSH** (`ssh -L 15672:localhost:15672 ...`): reaproveita a conexão SSH
> para acessar um serviço interno da máquina (ex.: o painel do RabbitMQ) **como se
> fosse local**, sem abrir aquela porta para a internet.

---

## 7. Deploy — publicar mudanças

Deploy é o ato de **levar uma versão nova ao ar**. Temos dois, um por repositório:

### Backend — `scripts/deploy.sh` (roda **na EC2**)
`git pull` → **build** da imagem nova (com a antiga ainda no ar) → **migrations**
→ recria só api/worker/caddy → **health check** → **rollback automático** se a
API não subir saudável. Um comando, downtime mínimo.

### Frontend — `scripts/deploy-web.sh` (roda **no seu PC**)
Builda o `dist/` localmente → empacota (`tar`) → envia por `scp` → extrai na
pasta que o Caddy serve. Um comando. Config (chave + IP) fica em
`scripts/deploy-web.env` (não versionado).

> 💡 **Conceito — `git pull` vs `scp`**
> São dois jeitos de "entregar arquivos no servidor". `git pull` traz o
> **código-fonte** do GitHub (bom para o backend, que builda lá). `scp` copia
> **arquivos prontos** do seu PC direto para o servidor (bom para o `dist/` do
> frontend, que já vem buildado). O código-fonte anda pelo git; o artefato, pelo
> scp.

> 💡 **Conceito — `.gitattributes` e o bug do `^M` (CRLF/LF)**
> Windows termina linhas com **CRLF** (`\r\n`); Linux, com **LF** (`\n`). Um
> script `.sh` escrito no Windows pode chegar no Linux com um `\r` invisível no
> fim de cada linha, e o shell quebra com `bad interpreter: ...^M`. O arquivo
> **`.gitattributes`** com `*.sh text eol=lf` força o git a **sempre gravar `.sh`
> com LF**, matando o problema na raiz.

> 💡 **Conceito — CI/CD (o próximo nível, ainda não usamos)**
> Hoje **você** roda os scripts (deploy manual). **CI/CD** é contratar um robô
> (ex.: GitHub Actions) que, a cada `git push`, **builda, testa e entrega
> sozinho**. Mesmo assim o artefato nunca vai para o git — o robô builda numa
> máquina temporária e só entrega o resultado. Vale adotar quando houver mais
> gente/clientes.

---

## 8. Jobs agendados (cron)

Duas rotinas rodam **sozinhas** todo dia, agendadas pelo **cron** do Linux:

| Hora | O que roda | Script |
|------|-----------|--------|
| 11:00 | gera faturas recorrentes + enfileira notificações de vencidos | `scripts/run-daily-billing.sh` |
| 03:00 | backup do banco (§9) | `scripts/backup-db.sh` |

O `run-daily-billing.sh` chama endpoints de sistema autenticados por um segredo
(`x-cron-secret`) — não precisa logar como nenhum tenant. Detalhes de negócio em
[`fluxo-completo.md`](./fluxo-completo.md) e specs 0010/0013.

> 💡 **Conceito — cron e "job"**
> Um **job** é uma tarefa que roda sozinha, sem alguém clicando. O **cron** é o
> **despertador do Linux**: você registra linhas tipo `0 3 * * *` (= "todo dia às
> 03:00, rode este comando"). Editar com `crontab -e`; listar com `crontab -l`.
> Escolhemos cron (leve, ~0 de RAM) em vez de ferramentas pesadas como n8n,
> justamente pelo servidor de 1GB.

---

## 9. Backup automático do banco

`scripts/backup-db.sh` roda um **`pg_dump`** dentro do container do Postgres,
comprime com gzip, salva em `~/billing-backups` e faz **rotação** (mantém os 14
mais recentes, apaga o resto). Restaurar: descompacta e joga no `psql` (comando
no cabeçalho do script).

> 💡 **Conceito — dump, rotação e off-site**
> Um **dump** é uma "fotografia" do banco inteiro num arquivo — dá para recriar
> tudo a partir dele. **Rotação** é manter só as N últimas fotos (senão o disco
> enche). ⚠️ Hoje o backup mora **no mesmo disco** da EC2: protege contra erro
> humano/corrupção, mas não contra a máquina morrer inteira. O próximo passo
> (**off-site**) é copiar os dumps para o **S3** (armazenamento da AWS, fora da
> máquina). *Pendente.*

---

## 10. Segurança — o que foi implementado

Conforme o app ficou público, endurecemos ("hardening") três frentes:

1. **Portas internas trancadas.** A API (3000) e o painel do RabbitMQ (15672)
   estavam publicados para a internet. Prendemos ambos ao **loopback**
   (`127.0.0.1`) no compose e removemos a regra da 3000 no Security Group. Agora
   só o Caddy (443) e o SSH (22) entram de fora; o resto só por dentro/túnel SSH.
2. **Segredos rotacionados.** Durante o desenvolvimento, alguns segredos
   (`CRON_SECRET`, senha do Postgres) apareceram em texto. **Rotacionamos**:
   geramos valores novos, trocamos no `.env` (e, no caso do banco, também
   **dentro** do Postgres com `ALTER USER`), e recriamos os containers. Os
   valores antigos ficaram inúteis.
3. **Segredos só no `.env` da EC2.** O `.env` (valores reais) é **gitignored** e
   vive só no servidor. O `.env.example` (só placeholders) é o que vai para o git.

> 💡 **Conceito — loopback (`127.0.0.1`)**
> `127.0.0.1` ("localhost") é a própria máquina falando com ela mesma. Um serviço
> preso ao loopback **só** é acessível de dentro da máquina — a internet não
> alcança, mesmo que o firewall deixasse. É "defesa em profundidade": duas
> camadas protegendo a mesma coisa.

> 💡 **Conceito — segredo e rotação**
> Um **segredo** é qualquer valor que dá acesso (senha, token, chave de API). Se
> um segredo **vaza** (aparece num print, num log, num commit), ele deixa de ser
> secreto. **Rotacionar** = trocar por um valor novo e invalidar o antigo — como
> trocar a fechadura depois de perder a chave. Por isso segredo nunca entra no
> código; vive em variável de ambiente (`.env`), fora do git.

> 💡 **Conceito — variável de ambiente e `.env`**
> **Variável de ambiente** é um valor que o programa lê do "ambiente" onde roda,
> em vez de estar escrito no código. O arquivo **`.env`** guarda essas variáveis
> (`CHAVE=valor`, uma por linha, **sem aspas**). O código lê via `dotenv`, e o
> Docker injeta no container. Assim o mesmo código roda em dev e produção só
> mudando o `.env`. **Cuidado no `.env`:** use `>>` (não `>`) ao acrescentar por
> comando, e nada de aspas nos valores (o Docker as mantém literais).

---

## 11. Multi-tenancy (configuração por tenant)

O Adimplo é **multi-tenant**: uma só instalação atende **vários clientes**
(tenants), com os dados isolados. Cada requisição carrega um `tenantId` (vindo do
JWT), e as consultas ao banco são automaticamente filtradas por ele. Configurações
como **meio de pagamento** e **WhatsApp** são **por tenant** — cada cliente recebe
no *seu* InfinitePay e envia pelo *seu* WhatsApp. Detalhe técnico em
[`architecture.md`](./architecture.md) e spec 0001.

> 💡 **Conceito — tenant e multi-tenancy**
> **Tenant** = "inquilino". **Multi-tenancy** é um prédio único (uma instalação
> do sistema) com vários apartamentos (clientes) — cada um só enxerga o próprio.
> Alternativa seria um prédio por cliente (uma instalação cada), muito mais caro.
> O isolamento aqui é por `tenantId` em toda tabela + um "contexto" que carrega o
> tenant da requisição atual (`AsyncLocalStorage`), então nenhuma consulta
> "vaza" dados de outro tenant.

---

## 12. Escalabilidade — quando crescer

Onde o desenho já ajuda a crescer:
- **Fila (RabbitMQ) + worker separado:** o envio de cobranças não trava a API. Se
  o volume subir, dá para rodar **mais workers** consumindo a mesma fila
  (**escala horizontal**) sem tocar na API.
- **Stateless:** a API não guarda estado em memória entre requisições (o estado
  está no banco/fila), então dá para ter **várias cópias** dela atrás de um load
  balancer no futuro.
- **Caddy como porta única:** trocar/adicionar máquinas por trás dele é
  transparente para o usuário.

> 💡 **Conceito — escala vertical vs. horizontal**
> **Vertical** = dar uma máquina **maior** (mais RAM/CPU). Simples, mas tem teto e
> é ponto único de falha. **Horizontal** = colocar **mais máquinas** dividindo o
> trabalho. Mais robusto e "infinito", mas exige que o app seja *stateless* e que
> o trabalho seja divisível (é por isso que fila + worker importam tanto).

---

## Mapa mental — uma requisição de ponta a ponta

```
Usuário no navegador
  │  https://useadimplo.com.br/api/clients   (com JWT no cabeçalho)
  ▼
[Security Group]  deixa passar 443
  ▼
[Caddy :443]  valida o cadeado, vê que é /api/* → repassa
  ▼
[API :3000 (loopback)]  jwtAuth extrai o tenantId → controller → service → repository
  ▼
[Postgres]  consulta já filtrada pelo tenant
  ▲
  └──── resposta volta pelo mesmo caminho ────┘

Em paralelo, sozinhos:
[cron 11:00] → gera faturas + enfileira vencidos → [RabbitMQ] → [worker] → WhatsApp
[cron 03:00] → pg_dump → ~/billing-backups
```

---

## Onde cada assunto mora (mapa da documentação)

| Você quer entender… | Leia |
|---|---|
| Infra, deploy, segurança, os conceitos novos | **este arquivo** + [`glossario.md`](./glossario.md) |
| O que o sistema faz e para quem | [`overview.md`](./overview.md) |
| Regra de negócio (faturas, estados, assinaturas) | [`domain-model.md`](./domain-model.md) |
| Fluxo do usuário / ponta a ponta | [`fluxo-completo.md`](./fluxo-completo.md) |
| Como o código é organizado (camadas) | [`architecture.md`](./architecture.md) |
| Libs, versões, variáveis de ambiente | [`tech-stack.md`](./tech-stack.md) |
| Padrões de código do repo | [`conventions.md`](./conventions.md) |
| Como fazer X (endpoint, worker, migration…) | [`../skills/`](../skills/) |
| Dívidas técnicas / o que falta | [`tech-debt.md`](./tech-debt.md) |
