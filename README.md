# 🚀 Automated Billing & Notification API (n8n + WhatsApp)

Uma API robusta e escalável desenvolvida para gerenciar, agendar e disparar notificações de cobrança automatizadas. O sistema integra-se perfeitamente com o **n8n** (via webhooks/REST) e utiliza gateways de WhatsApp para a entrega final das mensagens, focado em alta performance e segurança.

---

## 🛠️ Tecnologias e Arquitetura

* **Backend:** [Sua Tecnologia - ex: Node.js / TypeScript / Python]
* **Banco de Dados:** [ex: PostgreSQL (Dados) + Redis (Cache & Filas)]
* **Orquestração de Workflow:** n8n
* **Mensageria / Filas:** [ex: BullMQ / Celery] (Garante que a API não caia com milhares de cobranças simultâneas)
* **Agendamento:** Scheduler integrado com suporte a fuso horário e retentativas.

---

## ⚙️ Funcionalidades Principais

* **Agendamento Inteligente (Scheduler):** Processamento cronometrado para identificar cobranças a vencer, vencidas e em atraso.
* **Integração Nativa com n8n:** Webhooks otimizados para enviar payloads limpos e estruturados para os workflows do n8n.
* **Mensageria Resiliente:** Arquitetura baseada em filas para suportar picos de requisições e evitar bloqueios (Rate Limiting) na API do WhatsApp.
* **Logs e Rastreabilidade:** Histórico completo do status de cada cobrança (Agendado, Enviado, Falhou, Pago).

---

## 🛡️ Boas Práticas Implementadas

### 🔒 Segurança
* **Autenticação & Autorização:** Proteção de endpoints via JWT/API Keys robustas.
* **Webhooks Seguros:** Validação de assinatura de tokens (HMAC) nas requisições vindas do n8n.
* **Proteção de Dados (LGPD/Sanitização):** Dados sensíveis de clientes e valores são criptografados ou mascarados quando necessário.

### ⚡ Performance & Escalabilidade
* **Estrutura de Dados Otimizada:** Modelagem de banco de dados indexada para buscas rápidas de clientes inadimplentes.
* **Caching com Redis:** Redução de queries repetitivas ao banco de dados para dados estáticos.
* **Asynchrony (Assincronismo):** O scheduler apenas popula a fila; o processamento do envio ocorre em background, liberando a API imediatamente.

### 🧩 Arquitetura de Código
* **Clean Architecture / DDD:** Separação clara entre as regras de negócio (cobrança), os serviços de terceiros (n8n/WhatsApp) e os controladores.
* **Idempotência:** Mecanismo que garante que uma cobrança nunca seja enviada duas vezes para o mesmo cliente no mesmo dia, mesmo em caso de falha no sistema.

---

## 🗺️ Fluxo da Informação

1. O **Scheduler** interno roda periodicamente e busca cobranças no Banco de Dados.
2. Os dados são validados e injetados na **Fila de Processamento**.
3. A API consome a fila e dispara um Webhook para o **n8n**.
4. O **n8n** recebe o payload, aplica a lógica de mensageria e aciona a API do **WhatsApp**.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
* [Link da tecnologia ex: Node.js v20+]
* Docker (Recomendado para rodar o banco e o Redis)

### Instalação

1. Clone o repositório:
```bash
git clone [https://github.com/seu-usuario/nome-do-repositorio.git](https://github.com/seu-usuario/nome-do-repositorio.git)
