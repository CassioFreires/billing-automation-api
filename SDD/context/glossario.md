# Glossário — termos em linguagem de gente

Consulta rápida dos conceitos que aparecem no projeto. Cada verbete tem 2–4
linhas. Para a **história** de como cada um foi aplicado aqui (em ordem), veja
[`devops-infra.md`](./devops-infra.md). Este arquivo é genérico o suficiente para
reusar em outros projetos.

---

## Rede e internet

- **IP** — o "número de telefone" de um computador na internet (`3.142.106.14`).
- **IP público vs. Elastic IP** — o IP público comum da AWS **muda** quando a
  máquina reinicia; o **Elastic IP** é reservado e **fixo**. Domínio deve apontar
  para um IP fixo.
- **DNS** — a "agenda" da internet: traduz **nome** (`site.com.br`) → **IP**.
- **Registro A** — a linha do DNS que diz "esse nome → esse IP".
- **Subdomínio** — prefixo antes do domínio (`api.site.com.br`); pode apontar
  para o mesmo IP ou outro.
- **Porta** — canal numerado de um serviço. Site = 80/443, SSH = 22, API interna
  = 3000, Postgres = 5432, RabbitMQ = 5672 (painel 15672).
- **HTTP vs. HTTPS** — HTTP é texto aberto; **HTTPS** é HTTP criptografado (o
  cadeado 🔒). Navegadores exigem HTTPS hoje.
- **TLS / certificado** — a tecnologia e o "documento" que fazem o HTTPS. Emitido
  por uma autoridade e **renovado a cada ~90 dias**.
- **Let's Encrypt** — autoridade que emite certificados TLS **de graça** e
  automaticamente.
- **CORS** — regra do navegador que bloqueia um site de chamar uma API em
  **outra origem** (domínio diferente), a menos que a API autorize. Evita-se
  servindo site e API no **mesmo domínio**.

## Servidor e infraestrutura

- **EC2** — computador alugado da AWS, ligado 24h na internet.
- **Security Group** — o **firewall** da AWS: define quem pode acessar cada
  porta. `0.0.0.0/0` = "qualquer um".
- **SSH** — abrir um terminal seguro numa máquina remota.
- **Chave `.pem`** — a chave **privada** que prova sua identidade no SSH (nunca
  compartilhe/comite).
- **Túnel SSH** — usar a conexão SSH para acessar um serviço interno da máquina
  como se fosse local (ex.: painel do RabbitMQ), sem expor a porta.
- **loopback (`127.0.0.1`)** — a máquina falando com ela mesma; serviço preso
  aqui **não** é acessível de fora.
- **Reverse proxy** — "porteiro" que recebe todas as visitas num ponto e as
  encaminha para o serviço interno certo (aqui: **Caddy**).
- **Caddy** — reverse proxy que também obtém e renova o HTTPS **sozinho**.

## Docker

- **Container** — uma "caixinha" isolada que empacota um programa + tudo que ele
  precisa para rodar igual em qualquer lugar.
- **Imagem** — o "molde" de onde um container nasce (resultado do `Dockerfile`).
- **Docker Compose** — arquivo que descreve **vários containers** juntos
  (API, banco, fila…) e sobe todos com um comando (`docker compose up`).
- **Volume** — armazenamento que **sobrevive** ao container ser recriado (ex.:
  dados do Postgres, certificados do Caddy).
- **Bind mount** — mostrar uma **pasta do disco do host** dentro do container
  (ex.: `./frontend/dist` → `/srv`, de onde o Caddy serve o site).
- **`depends_on` / healthcheck** — ordem de subida (migrate antes da API) e
  verificação de que um serviço está "saudável" antes de usá-lo.

## Aplicação e desenvolvimento

- **Build / artefato** — compilar o código-fonte num resultado pronto para rodar
  (`dist/`, imagem Docker). Artefato **não** vai para o git.
- **SPA** — Single Page Application: um `index.html` + JS que desenha todas as
  telas (o frontend React). Exige `fallback` para `index.html` nas rotas.
- **ESM / `.js` em imports `.ts`** — o projeto usa módulos ES; por causa do
  NodeNext, imports internos citam a extensão `.js` mesmo em arquivos `.ts`.
- **Camadas (router → controller → service → repository)** — separação de
  responsabilidades: HTTP no controller, regra no service, banco no repository.
  Ver [`architecture.md`](./architecture.md).
- **ORM / Prisma** — biblioteca que mapeia tabelas do banco para objetos e
  gerencia **migrations** (mudanças de schema versionadas).
- **DTO / Zod** — "contrato" de entrada validado (Zod) antes de virar regra.
- **JWT** — "crachá" assinado que o usuário manda em cada requisição para provar
  quem é (e qual tenant).

## Dados e mensageria

- **Postgres** — o banco de dados relacional (tabelas).
- **`pg_dump` / dump** — "fotografia" do banco inteiro num arquivo, para backup.
- **Rotação (de backup)** — manter só os N backups mais recentes.
- **RabbitMQ / fila** — "correio" entre serviços: a API **enfileira** uma tarefa
  e segue a vida; o **worker** consome depois. Desacopla e permite escalar.
- **Worker** — processo separado que consome a fila e faz o trabalho pesado
  (ex.: enviar cobrança por WhatsApp).
- **Redis** — cache opcional (memória rápida) para aliviar o banco.

## Segurança

- **Segredo** — valor que dá acesso (senha, token, chave). Vive em `.env`, nunca
  no código.
- **Variável de ambiente / `.env`** — valores que o programa lê do ambiente. O
  `.env` (reais) é gitignored; o `.env.example` (placeholders) vai para o git.
- **Rotação de segredo** — trocar um segredo por um valor novo e invalidar o
  antigo (como trocar a fechadura após perder a chave). Faz-se após um vazamento.
- **Hardening** — "endurecer" a segurança: fechar portas, prender ao loopback,
  restringir acessos.

## Operação e escala

- **Cron / job** — o "despertador" do Linux que roda tarefas sozinhas em horários
  definidos (`crontab -e` edita, `crontab -l` lista).
- **Deploy** — levar uma versão nova ao ar. Aqui: `deploy.sh` (backend, na EC2) e
  `deploy-web.sh` (frontend, do PC).
- **`git pull` vs. `scp`** — `git pull` traz **código** do GitHub; `scp` copia
  **arquivos prontos** do PC para o servidor.
- **`.gitattributes` / CRLF-LF** — força `.sh` a usar quebra de linha **LF**,
  evitando o erro `bad interpreter: ^M` quando um script feito no Windows roda no
  Linux.
- **CI/CD** — robô (ex.: GitHub Actions) que builda, testa e faz deploy sozinho a
  cada `git push`. (Ainda não usado aqui.)
- **Multi-tenancy / tenant** — uma instalação atende vários clientes (tenants)
  com dados isolados por `tenantId`.
- **Stateless** — a API não guarda estado em memória entre requisições, o que
  permite ter várias cópias dela (escala **horizontal**).
- **Escala vertical vs. horizontal** — vertical = máquina maior; horizontal =
  mais máquinas dividindo o trabalho.
