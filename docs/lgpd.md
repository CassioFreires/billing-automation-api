# LGPD do Adimplo — guia completo para leigo

> **Para quem é isto:** você, que nunca estudou LGPD, precisa **entender** o
> assunto, saber **quais dados são sensíveis**, ver **cenários do dia a dia** e
> chegar ao advogado sabendo **o que pedir**. Este é o **único** documento de LGPD
> do projeto — centraliza tudo.
>
> Está em ordem didática: **primeiro os conceitos** (com exemplos), depois **os
> dados do Adimplo**, depois **cenários**, e no fim **o que levar ao advogado**.
> Cada termo novo tem uma caixa **💡 Em português claro**.
>
> ⚠️ **Isto NÃO é parecer jurídico.** Foi preparado por uma IA lendo a lei
> (Lei 13.709/2018 — LGPD), **sem** inscrição na OAB e **sem** responsabilidade
> profissional. Serve para você entender e para o advogado validar. Os pontos
> marcados **🔴** carregam risco real — não aja neles só com base neste texto.
>
> **Confiança:** 🟢 sólido · 🟡 defensável, valide · 🔴 só com advogado.

---

## Índice

1. [LGPD em 2 minutos](#1-lgpd-em-2-minutos)
2. [Dicionário dos termos (com exemplo no Adimplo)](#2-dicionário-dos-termos)
3. [Quais dados o Adimplo tem — e quais são sensíveis](#3-quais-dados-o-adimplo-tem)
4. [Cenários do dia a dia](#4-cenários-do-dia-a-dia)
5. [O que eu já sei responder (análise preliminar)](#5-análise-preliminar)
6. [O que pedir ao advogado](#6-o-que-pedir-ao-advogado)
7. [Resumo de uma página](#7-resumo-de-uma-página)

---

## 1. LGPD em 2 minutos

**LGPD** é a lei brasileira que diz **como você pode usar dados de pessoas**. Ela
existe para proteger o cidadão. Quem fiscaliza é a **ANPD** (uma agência do
governo). Se você desrespeita, pode levar advertência e, em casos graves, **multa**
(até 2% do faturamento no Brasil, limitada a R$ 50 milhões por infração).

> 💡 **Em português claro — por que isso te afeta?**
> Porque o Adimplo vive de **dado de pessoa**: o CPF, o telefone e a dívida dos
> clientes dos seus clientes. Mexer com esse dado tem regra. A boa notícia: cobrar
> dívida é uma das coisas que a lei **explicitamente permite** — você está mais
> protegido do que imagina (ver cenário 1).

**A ideia central que organiza tudo:** para cada dado, a lei pergunta três coisas:
1. **De quem é o dado?** (o *titular*)
2. **Quem decide o que fazer com ele?** (o *controlador*) e **quem só executa?** (o *operador*)
3. **Qual o motivo legal de usar?** (a *base legal*)

Se você souber responder essas três para o Adimplo, entendeu 80% da LGPD. É o que
os próximos capítulos fazem.

---

## 2. Dicionário dos termos

Cada conceito explicado como se fosse para um amigo, com **o exemplo real no
Adimplo**.

### Titular
> 💡 A **pessoa dona do dado**. Sempre um ser humano.

No Adimplo há dois tipos de titular: **o dono** (seu cliente pagante) e **o
devedor** (o cliente do seu cliente, que deve a mensalidade).

### Dado pessoal
> 💡 Qualquer informação que **identifica uma pessoa**: nome, CPF, telefone,
> e-mail. Até o "comportamento" (que horas abriu o link) é dado pessoal.

### Dado pessoal **sensível**
> 💡 Um subgrupo **mais protegido** de dados, que pode gerar discriminação:
> **saúde**, religião, opinião política, origem racial, vida sexual, biometria,
> dado genético (Art. 11 da LGPD). Tem regra **mais dura** que dado comum.

**No Adimplo:** você **não** guarda diagnóstico. Mas atenção às **clínicas** — ver
cenário 2. Guardar CPF **não** é dado sensível (é dado comum, mas muito visado).

### Controlador
> 💡 Quem **decide** por que e como o dado é usado. É o "dono da decisão", o
> responsável principal perante a lei.

**No Adimplo:** o **dono** é o controlador dos dados dos devedores dele (foi ele
quem decidiu cobrar). E **você (Adimplo)** é o controlador dos dados de cadastro
dos donos.

### Operador
> 💡 Quem **executa o tratamento em nome do controlador**, seguindo as ordens
> dele. É o "prestador de serviço de dados".

**No Adimplo:** em relação aos **devedores**, o Adimplo é **operador** — você só
processa o que o dono mandou (cobrar fulano). Isso é bom: o peso maior da
responsabilidade é do controlador (o dono).

### Base legal
> 💡 O **motivo legal** que autoriza usar o dado. A LGPD lista **10 motivos**
> (Art. 7º). **Consentimento é só um deles** — e nem sempre o certo.

**No Adimplo (para cobrança):** as bases certas são **execução de contrato**,
**proteção ao crédito** e **legítimo interesse** — **não** consentimento (ver
cenário 1).

### Consentimento
> 💡 Quando a pessoa **autoriza expressamente** (o "aceito"). É uma base legal,
> mas **frágil**: a pessoa pode revogar quando quiser.

**Cuidado:** muita gente acha que "preciso do OK do devedor para cobrar". **Não
precisa** — cobrar se apoia em outra base. Consentimento você usa para coisas
opcionais (ex.: mandar novidades/marketing), não para cobrar.

### Legítimo interesse
> 💡 Uma base legal para usos **razoáveis e esperados**, que não ferem os direitos
> da pessoa. Exige um "teste de equilíbrio" (o advogado documenta).

**No Adimplo:** receber o que é devido é um interesse legítimo do dono.

### Anonimização
> 💡 Transformar o dado de um jeito que **não dá mais para saber de quem é**. Dado
> anonimizado **deixa de ser dado pessoal** — sai do alcance da LGPD.

**No Adimplo:** já implementado — dá para **anonimizar** um devedor a pedido dele.
É uma ferramenta poderosa para reduzir risco.

### Encarregado (ou DPO)
> 💡 A **pessoa/canal de contato** para quem os titulares reclamam sobre seus
> dados. "DPO" é o nome em inglês (Data Protection Officer).

**No Adimplo:** como empresa pequena, você provavelmente **não precisa** de um DPO
formal — basta um **canal**, tipo `privacidade@useadimplo.com.br` (ver P9).

### ROPA (Registro das Operações de Tratamento)
> 💡 Uma **planilha/documento** que lista **tudo o que você faz com dados**: qual
> dado, de quem, por quê, por quanto tempo. A ANPD pode pedir para ver (Art. 37).

**No Adimplo:** o capítulo 3 deste documento já é **quase o ROPA pronto**.

### DPA (Contrato de tratamento de dados)
> 💡 O **contrato entre o controlador e o operador** que define as regras (quem faz
> o quê, segurança, o que acontece no fim). Em bom português: o contrato entre
> **você** e **cada dono** dizendo como você cuida do dado dos devedores dele.

**No Adimplo:** é o documento que **destrava a venda** — um cliente sério pede
antes de assinar.

### Incidente de segurança
> 💡 Um **vazamento ou acesso indevido** aos dados. Se puder causar risco às
> pessoas, você tem que **avisar a ANPD e os titulares** (Art. 48).

### Decisão automatizada / perfilamento
> 💡 Quando **o sistema decide sozinho** algo sobre a pessoa a partir do
> comportamento dela. A lei dá à pessoa o direito de **pedir revisão** (Art. 20).

**No Adimplo:** é o **Botão de Alívio** (o sistema oferece parcelamento ao ver
hesitação) — ver cenário 3.

### Transferência internacional
> 💡 Guardar/mandar dados de brasileiros **para fora do Brasil** (ex.: servidor nos
> EUA). É permitido, mas com regras (Art. 33).

**No Adimplo:** relevante se você hospedar a VPS no exterior — ver P na análise.

### Agente de pequeno porte
> 💡 Um "regime mais leve" da ANPD (Resolução 2/2022) para **startups e pequenas
> empresas**: menos burocracia (ex.: pode não precisar de DPO formal).

**No Adimplo:** provavelmente é o seu caso — um alívio grande.

---

## 3. Quais dados o Adimplo tem

Tudo que o sistema **realmente** guarda (tirado do banco de dados). A coluna
**Sensível?** é a que você perguntou.

### 3.1 Dados dos DONOS e equipe — aqui o Adimplo é **controlador**

| Dado | Sensível? | Por que guardamos |
|---|---|---|
| Nome, e-mail | Não | criar e acessar a conta |
| Senha | Não (guardada como "hash", não dá para ler) | login |
| Aceite dos Termos (data + versão) | Não | prova de que concordou |
| Plano e faturas do SaaS | Não | cobrar a mensalidade do Adimplo |
| Credenciais de gateway/WhatsApp do dono | Não é dado de titular (é segredo comercial) — **guardado cifrado** | cobrar/enviar na conta do próprio dono |

### 3.2 Dados dos DEVEDORES — aqui o Adimplo é **operador** (o dono é o controlador)

| Dado | Sensível? | Por que guardamos |
|---|---|---|
| Nome | Não | saber quem deve |
| Telefone | Não | enviar a cobrança |
| **CPF/CNPJ** | Não é "sensível" pela lei, **mas é o dado mais visado** — trate com cuidado | identificar e gerar a cobrança |
| E-mail | Não | enviar a cobrança |
| Valor, vencimento, status da dívida | Não | gerar e acompanhar |
| Pagamentos (meio, valor, data) | Não | conciliar o recebimento |
| **Comportamento no link** (abriu, quando, tentou pagar) | Não isolado, **mas é perfilamento** (ver cenário 3) | detectar hesitação → Botão de Alívio |
| Ser cliente de **uma clínica** | ⚠️ **pode virar sensível por inferência** (ver cenário 2) | é a cobrança de uma clínica |

> ✅ **O que o Adimplo NÃO guarda (e isso é bom):** diagnóstico médico, biometria,
> localização precisa, **IP cru** (guardamos só um "hash" do IP, que não identifica).

---

## 4. Cenários do dia a dia

A parte mais importante para você "sentir" a LGPD na prática.

### Cenário 1 — Cobrança normal (o caso mais comum) 🟢
> **João** não pagou a mensalidade da academia **Fit**. A academia usa o Adimplo, e
> o sistema manda um WhatsApp cobrando o João.

- **Titular:** João. **Controlador:** a academia Fit (ela decidiu cobrar).
  **Operador:** o Adimplo (só executou).
- **Preciso do "aceito" do João para cobrar?** **NÃO.** A base legal é *execução de
  contrato* + *proteção ao crédito* (Art. 7º, V e X). Cobrar é um direito.
- **Cuidados:** mandar só **para o João** (não para o chefe/vizinho dele), sem tom
  vexatório. Isso é regra do Código de Defesa do Consumidor, não da LGPD.

**Lição:** o coração do seu produto (cobrar) é **permitido por lei**, sem depender
de consentimento.

### Cenário 2 — O cliente é uma clínica 🔴
> A **Clínica Bem-Estar** (psiquiatria) usa o Adimplo para cobrar a **Maria**.

- O Adimplo não guarda o diagnóstico da Maria. **Mas** o simples fato registrado —
  "Maria é paciente de uma clínica **psiquiátrica**" — pode **revelar uma condição
  de saúde**. Isso é **dado sensível por inferência**.
- **O que muda:** dado sensível tem proteção mais dura (Art. 11). A clínica
  (controladora) já pode tratar saúde por ser serviço de saúde; o Adimplo, como
  operador, precisa refletir isso no contrato (DPA) e reforçar a segurança.
- **Por que 🔴:** definir se o Adimplo "trata dado sensível" ou não muda suas
  obrigações — **peça a leitura de um advogado**.

**Lição:** nem todo negócio é igual. Clínica ≠ academia aos olhos da lei.

### Cenário 3 — O Botão de Alívio dispara sozinho 🟡
> **Pedro** abriu o link de pagamento **3 vezes** e não pagou. O Adimplo entende
> "hesitação" e oferece **parcelar em 3x** — sem ninguém mandar.

- Isso é **decisão automatizada / perfilamento** (Art. 20). A pessoa tem direito de
  **pedir revisão** e de saber os **critérios**.
- **Ponto a seu favor:** o sistema **oferece um benefício** (não nega nada, não
  prejudica). Risco baixo.
- **Mitigação (simples):** avisar que "a oferta é automática", ter um **canal
  humano**, e **documentar a regra** (o limiar de 3 aberturas). O advogado escreve
  a frase de transparência.

**Lição:** quando o sistema decide algo sobre a pessoa, seja **transparente**.

### Cenário 4 — "Apaga meus dados!" 🟢
> A **Ana** liga irritada: "não quero mais nada de vocês, apaguem meus dados".

- Ela está exercendo um **direito do titular** (Art. 18): acesso, correção,
  **anonimização/eliminação**, portabilidade.
- **No Adimplo já dá para fazer:** exportar e **anonimizar** os dados dela (função
  já implementada).
- **Nuance:** você pode **reter** o mínimo por obrigação legal (ex.: registro
  fiscal da dívida) mesmo após o pedido — o advogado define esse limite.

**Lição:** o titular manda no dado dele; você já tem a ferramenta para atender.

### Cenário 5 — Vazou o banco de dados 🟡
> Um invasor acessou a base e copiou CPFs e telefones dos devedores.

- É um **incidente de segurança**. Se houver risco às pessoas, você deve
  **comunicar a ANPD e os titulares** (Art. 48) — a Resolução ANPD 15/2024 fixou
  prazo (à época, **3 dias úteis**; confirme o vigente).
- **O que ajuda a prevenir/reduzir:** o que já existe (HTTPS, senhas em hash,
  credenciais cifradas, backup) + ter um **plano** pronto de quem faz o quê.

**Lição:** não é "se", é "estar preparado". Um plano de 1 página resolve.

### Cenário 6 — "Quero avisar outra empresa que o João é mau pagador" 🔴
> Ideia de produto: usar o histórico do João na academia para dar a ele um **score**
> que **outra empresa** (uma clínica) consulta.

- Aqui o Adimplo **deixa de ser só operador** e vira **dono de um banco de dados de
  crédito** — entra a **Lei do Cadastro Positivo (12.414/2011)** **além** da LGPD.
- Isso tem regras próprias (como abrir/consultar, avisar o titular) e pode exigir
  **base legal específica**.
- **Recomendação firme:** **não ligue isso** sem um advogado desenhar a estrutura.
  Mantenha qualquer "score" **dentro de cada empresa** por enquanto.

**Lição:** o seu maior diferencial futuro é também o seu maior risco jurídico.
Vale — mas com projeto.

---

## 5. Análise preliminar

As respostas fundamentadas para as perguntas do advogado, com o artigo e a
confiança. (É o "gabarito" que você leva para ele validar.)

| # | Pergunta | Resposta curta | Base | Conf. |
|---|---|---|---|---|
| 1 | Papéis (operador/controlador)? | Operador dos devedores; controlador dos donos | Art. 5º, 39 | 🟢 |
| 2 | Preciso de DPA? | Sim — contrato com cada dono | Art. 39 | 🟢 |
| 3 | Base legal p/ dados dos devedores? | Execução de contrato + proteção ao crédito + legítimo interesse | Art. 7º V, X, IX | 🟢 |
| 4 | Cobrar sem consentimento? | Sim, pode | Art. 7º V/X | 🟢 |
| 5 | Botão de Alívio = Art. 20? | Sim; mitigar com transparência | Art. 20 | 🟡 |
| 6 | Política/Termos | Reescrever os modelos atuais | — | 🟡 |
| 7 | ROPA | Montar (cap. 3 já é a base) | Art. 37 | 🟢 |
| 8 | Retenção | Guardar enquanto há finalidade + prazo legal | Art. 15-16 | 🟡 |
| 9 | Preciso de DPO? | Provavelmente não (pequeno porte) — só um canal | Art. 41 + Res. 2/2022 | 🟢 |
| 10 | Clínicas = dado sensível? | Possível por inferência — decidir | Art. 11 | 🔴 |
| 11 | Score entre empresas? | Não ligar sem projeto jurídico | Lei 12.414/2011 + LGPD | 🔴 |
| 12 | Links públicos sem login | Aceitável; endurecer (expiração, noindex) | Art. 46 | 🟡 |
| 13 | Plano de incidente | Redigir plano simples | Art. 48 | 🟡 |

---

## 6. O que pedir ao advogado

### 6.1 Como escolher
Procure um(a) advogado(a) **especialista em proteção de dados / LGPD** (não um
generalista). Muitos oferecem um **pacote inicial para startup** com preço fechado.

### 6.2 O que dizer (roteiro da conversa)
> "Tenho um SaaS de cobrança já no ar. Sou operador dos dados dos devedores e
> controlador dos dados dos meus clientes. Vou começar um piloto com 1 a 3 clientes,
> sendo que um deles pode ser uma clínica. Preciso do mínimo para operar com
> segurança. Trago um levantamento pronto dos dados e das minhas dúvidas."

### 6.3 O pedido objetivo (prioridade para o piloto)
1. **Confirmar a base legal** da cobrança (perguntas 3 e 4) — rápido.
2. **Redigir um DPA modelo** para eu assinar com os clientes (pergunta 2) — *é o que
   destrava a venda*.
3. **Opinar sobre as clínicas** (pergunta 10) — dado sensível por inferência.
4. Confirmar que me enquadro como **agente de pequeno porte** e qual **canal** de
   privacidade usar (pergunta 9).

### 6.4 Pode ficar para depois (antes de escalar)
Reescrita da Política/Termos, ROPA completo, política de retenção, plano de
incidente e — só quando for construir — o **desenho do score entre empresas**
(pergunta 11).

### 6.5 O que levar impresso
- **Este documento** (o capítulo 3 é o inventário de dados; o 5 é o gabarito).
- Se ele pedir detalhe técnico: `docs/documentacao-tecnica.md` e `docs/casos-de-uso.md`.

---

## 7. Resumo de uma página

- **LGPD = como usar dado de pessoa.** Três perguntas: de quem é, quem decide, qual
  o motivo legal.
- **Você (Adimplo)** é **operador** dos dados dos devedores (o dono é o
  controlador) e **controlador** do cadastro dos donos.
- **Cobrar NÃO precisa de consentimento** — a lei permite (execução de contrato +
  proteção ao crédito). Este é o coração do seu produto e está protegido. 🟢
- **Dado sensível** = saúde, religião, etc. Você não guarda diagnóstico, **mas
  clínica gera risco por inferência**. 🔴 decidir com advogado.
- **CPF** não é "sensível" pela lei, mas é o mais visado — cuide bem.
- **Já está pronto no sistema:** anonimizar/exportar dados, aceite com prova,
  criptografia, minimização de IP.
- **Você provavelmente NÃO precisa de DPO** (pequeno porte) — só um canal de contato.
- **Dois pontos de risco alto:** clínicas (dado sensível) e **score entre empresas**
  — este **não ligue** sem projeto jurídico.
- **Para o piloto:** confirme base legal + assine um **DPA** + opine sobre clínicas.
  É uma **consulta pontual**, não um projeto de meses.

> Precisa dos documentos escritos? Posso redigir os rascunhos de **DPA**,
> **Política de Privacidade/Termos**, **ROPA** e **plano de incidente** — cada um
> depois só passa pela revisão (barata) do advogado.
</content>
