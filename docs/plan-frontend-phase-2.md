# Front-end das fases 2.1 e 2.2

O backend das fases [2.1](plan-phase-2.1.md) e [2.2](plan-phase-2.2.md) está pronto. Este plano leva o front, hoje a página única da fase 1 que chama `POST /links` sem login, para a nova API: contas, "meus links" e o relatório de cliques.

## Escopo

- Cadastro, login, logout e exclusão de conta.
- "Meus links": criar com expiração (1 dia, 7 dias, 30 dias, nunca), listar com paginação, copiar, apagar.
- Relatório de cliques por link: período, indicadores, gráfico diário, rankings e compartilhamentos.
- Tratamento de sessão expirada, rate limit e demais erros da API.

Fora do escopo: deploy e configuração de produção, painel somando todos os links, edição de links, recuperação e troca de senha (não existem no backend), tema escuro.

## Decisões

| Tema | Decisão | Motivo |
|---|---|---|
| Rotas | React Router | várias telas, com links que precisam abrir direto pela URL |
| Busca de dados | TanStack Query | cache, paginação, estados de carregamento e atualização da lista depois de criar ou apagar, sem código próprio para isso |
| Gráficos | Recharts, só no gráfico diário | os rankings são listas com barras em CSS, mais simples e mais acessíveis que um gráfico |
| Tipos da API | gerados do OpenAPI com `openapi-typescript` | o front acompanha o backend sem tipos escritos à mão |
| Caminho das telas | tudo sob `/app` | num deploy no mesmo domínio dos links curtos, rotas como `/signup` (6 letras) colidiriam com o `/{code}` |
| Estilo | CSS Modules e os tokens atuais de `index.css` | mantém o visual e a abordagem da fase 1 |

## Rotas do front

| Caminho | Tela | Acesso |
|---|---|---|
| `/` | redireciona para `/app/links` | — |
| `/app/login` | login | só deslogado; logado vai para `/app/links` |
| `/app/signup` | cadastro | só deslogado |
| `/app/links` | meus links, com o formulário de criação | logado |
| `/app/links/:code` | relatório de um link | logado |
| `/app/account` | conta | logado |
| qualquer outro | "página não encontrada" | — |

- **Acesso negado**: abrir uma tela de logado sem sessão leva para `/app/login?next=<caminho>`, e o login volta para o caminho original.
- **Estado na URL**: o período e a chave de robôs do relatório ficam na query string (`/app/links/aB3xK9q?period=30d&bots=1`, ou `?from=2026-10-01&to=2026-10-31`), para poder favoritar e compartilhar a visão. A página da lista também (`?page=2`).

## Contrato com a API

Todas as chamadas vão para `/api`, com caminho relativo. Em dev, o proxy do Vite encaminha `/api` para `http://localhost:8000`, e o cookie de sessão funciona pelo proxy. O `Origin: http://localhost:5173` já está em `ALLOWED_ORIGINS`, a lista da checagem de CSRF.

| Rota | Uso no front |
|---|---|
| `GET /api/me` | descobrir se há sessão; `401` = deslogado |
| `POST /api/auth/register`, `POST /api/auth/login` | entram logado (o cookie vem na resposta) |
| `POST /api/auth/logout`, `DELETE /api/me` | saem; o cache do front é limpo |
| `GET /api/links?page&pageSize` | lista |
| `POST /api/links` | criar, com `{url, expiresIn}` |
| `GET /api/links/{code}` | cabeçalho do relatório |
| `DELETE /api/links/{code}` | apagar |
| `GET /api/links/{code}/stats?from&to&tz&includeBots` | relatório |

O link curto (`shortUrl`) aponta direto para a API (`http://localhost:8000/aB3xK9q`) e não passa pelo front.

### Tipos gerados

- Script `npm run gen:api`: `openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`, com a API de pé.
- O arquivo gerado **vai para o repositório**, para o front compilar sem a API rodando. Quando o backend muda, roda-se o script de novo, e o diff mostra o que mudou no contrato.
- Os tipos são usados como `components["schemas"]["LinkOut"]`, reexportados com nomes curtos em `src/api/types.ts`.

### Cliente HTTP

`src/api/client.ts` envolve o `fetch`:

- prefixa `/api`, envia e lê JSON;
- em resposta fora da faixa 2xx, lança um `ApiError` com `status`, `detail`, os erros de validação por campo (quando o `detail` é a lista do FastAPI) e `retryAfter` (lido do cabeçalho `Retry-After` no `429`).

### Mensagens de erro

| Situação | Mensagem |
|---|---|
| `401` no login | "E-mail ou senha inválidos." |
| `401` em qualquer outra chamada | sessão expirada: volta para o login, com "Sua sessão expirou. Entre de novo." |
| `409` no cadastro | "Já existe uma conta com este e-mail." |
| `422` com `type: "blocked_url"` | "Não é possível encurtar links deste serviço ou de outros encurtadores." |
| `422` na URL | "URL inválida. Use um endereço começando com http:// ou https://" |
| `422` na senha | "A senha precisa ter entre 8 e 128 caracteres." |
| `429` | "Muitas tentativas. Tente de novo em N minutos." (de `Retry-After`) |
| `503` na criação | "Não foi possível gerar o link agora. Tente de novo." |
| `404` no relatório | tela "Link não encontrado ou expirado", com volta para a lista |
| falha de rede | "Não foi possível falar com o servidor." |

## Dados e sessão (TanStack Query)

| Chave | Hook | Observação |
|---|---|---|
| `["me"]` | `useMe` | `401` vira `null`, não erro; sem retentativas |
| `["links", page]` | `useLinks(page)` | mantém a página anterior na tela enquanto carrega a próxima |
| `["link", code]` | `useLink(code)` | |
| `["stats", code, período, bots]` | `useLinkStats(...)` | |

Mutações:

- **Criar link**: invalida `["links"]`.
- **Apagar link**: invalida `["links"]` e remove `["link", code]` e `["stats", code, …]`.
- **Login e cadastro**: gravam o usuário em `["me"]`.
- **Logout e exclusão de conta**: `queryClient.clear()`, para nada da conta anterior ficar em cache.

**Sessão expirada**: um `onError` global no `QueryClient`, para consultas e mutações, trata o `401` fora das telas de login e cadastro: grava `null` em `["me"]`, e o guarda de rotas leva para o login com `next`.

**Retentativas**: só em falha de rede e em `5xx`, nunca em `4xx`.

## Telas

### Login e cadastro

- E-mail e senha, com `label` visível. O cadastro valida no cliente o formato do e-mail e o tamanho da senha (8 a 128), mas a validação que vale é a da API.
- Botão desabilitado com indicação de carregamento durante o envio.
- Link entre as duas telas ("Ainda não tem conta? Crie uma").
- Depois do sucesso, vai para o `next` ou para `/app/links`.

### Layout de quem está logado

- Cabeçalho com o nome do app, o e-mail do usuário e a navegação: "Meus links", "Conta", "Sair".
- O conteúdo das telas abaixo.

### Meus links

**Formulário de criação**, no topo:

- campo de URL e escolha de expiração (1 dia, 7 dias, 30 dias, nunca; padrão 30 dias);
- depois de criar, o link novo aparece destacado no topo da lista, com o botão de copiar focado;
- erros perto do campo, ligados a ele por `aria-describedby`.

**Lista**:

- **Colunas**:
  - link curto, com botão de copiar e confirmação "Copiado!";
  - destino truncado, com o endereço completo no `title`;
  - criação;
  - expiração relativa ("expira em 3 dias", "nunca expira"), destacada quando falta menos de 24 horas;
  - cliques (`clickCount`);
  - ações: "Relatório" e "Apagar".
- **Apagar**: pede confirmação num `<dialog>` nativo, avisando que os cliques também serão apagados.
- **Paginação**: 20 por página, com "anterior", "próxima" e "página X de Y".
- **Lista vazia**: um convite para criar o primeiro link.
- **Celular**: em telas estreitas, cada link vira um cartão em vez de linha de tabela.

### Relatório

**Cabeçalho** (`useLink`): link curto com botão de copiar, destino, criação e expiração.

**Período**:

- atalhos "7 dias", "30 dias" e "90 dias", mais "personalizado", com duas datas;
- o período personalizado é limitado a 400 dias e não passa de hoje;
- o fuso vai do navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`) no parâmetro `tz`.

**Indicadores**:

- **Cliques**.
- **Visitantes únicos**, com uma explicação curta ao lado: "soma dos visitantes únicos de cada dia; quem volta em outro dia conta de novo".
- **Acessos de robôs e prévias** (`botHits`).

**Gráfico de cliques por dia**:

- barras do Recharts, com os dias no eixo horizontal (`dd/MM`);
- o tooltip mostra cliques e visitantes únicos;
- uma tabela visualmente oculta com os mesmos dados, para leitores de tela.

**Rankings**: país, estado, origem, navegador, sistema e dispositivo.

- Cada um é uma lista com barra proporcional em CSS e o número ao lado.
- Rótulos:
  - **país**: `Intl.DisplayNames(["pt-BR"], {type: "region"})` ("BR" → "Brasil");
  - **estado**: tabela própria com os 27 estados brasileiros ("BR-TO" → "Tocantins"); outros países ficam com o código;
  - `null` → "Desconhecido", e na origem "Direto ou sem origem";
  - `"other"` → "Outros";
  - **dispositivo**: `mobile` → "Celular", `tablet` → "Tablet", `desktop` → "Computador", `other` → "Outro".

**Compartilhamentos** (`bots`), lista própria com nomes amigáveis:

- `WhatsApp` → "WhatsApp"
- `Slackbot-LinkExpanding` → "Slack"
- `facebookexternalhit` → "Facebook, Instagram ou iMessage"
- `TelegramBot` → "Telegram"
- `Twitterbot` → "X (Twitter)"
- `Discordbot` → "Discord"
- `LinkedInBot` → "LinkedIn"
- `crawler` → "Outros robôs"

**Chave "Incluir robôs nos números"**: desligada por padrão. Liga o `includeBots`.

**Estados especiais**:

- sem cliques no período: o link pronto para copiar e a frase "Os cliques aparecem aqui alguns segundos depois de acontecerem.";
- `404`: tela própria.

**Rodapé**, obrigatório pela licença: "This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com".

### Conta

- E-mail e data de criação.
- "Sair".
- "Excluir conta": um `<dialog>` explica que os links e os cliques serão apagados de forma permanente. Depois da exclusão, o cache é limpo e a pessoa vai para o cadastro.

## Formatação

- Datas em pt-BR com `Intl.DateTimeFormat`; tempo relativo com `Intl.RelativeTimeFormat`.
- Números com `Intl.NumberFormat("pt-BR")`.

## Acessibilidade

- `label` em todo campo; erros com `aria-describedby`; confirmações de cópia e erros de formulário em região `aria-live`.
- Ao trocar de tela, o foco vai para o título principal.
- `<dialog>` nativo, que já cuida do foco e do `Esc`.
- O gráfico tem a tabela equivalente oculta, e os rankings já são listas de texto.
- Foco visível e contraste mantidos dos tokens atuais.

## O que sai da fase 1

O `App.tsx` de página única e o `api.ts` atual são substituídos. Aproveitam-se o botão de copiar (com os ícones), a validação de URL e os estilos base.

## Estrutura

```
frontend/src/
  main.tsx                 # QueryClientProvider + RouterProvider
  router.tsx               # rotas, guarda de logado/deslogado
  api/
    schema.d.ts            # gerado pelo openapi-typescript (não editar)
    types.ts               # nomes curtos para os tipos gerados
    client.ts              # fetch + ApiError
    errors.ts              # ApiError -> mensagem em português
    hooks.ts               # useMe, useLinks, useLink, useLinkStats e as mutações
  components/
    Layout.tsx             # cabeçalho e navegação de quem está logado
    CopyButton.tsx
    ConfirmDialog.tsx
    Pagination.tsx
  pages/
    LoginPage.tsx
    SignupPage.tsx
    LinksPage.tsx          # formulário + lista
    LinkStatsPage.tsx      # relatório
    AccountPage.tsx
    NotFoundPage.tsx
  stats/
    DailyChart.tsx         # Recharts + tabela oculta
    Ranking.tsx
    labels.ts              # países, estados, dispositivos, bots
    period.ts              # atalhos e período personalizado <-> query string
  format.ts                # datas, tempo relativo, números
  test/
    setup.ts
    render.tsx             # renderiza com QueryClient (sem retentativas) e MemoryRouter
    api.ts                 # mock de fetch por rota
```

Novas dependências: `react-router`, `@tanstack/react-query`, `recharts`; em desenvolvimento, `openapi-typescript`.

## Testes

Vitest e Testing Library, com o `fetch` mockado por rota e um `QueryClient` novo, sem retentativas, em cada teste.

- **Sessão**:
  - sem sessão, abrir `/app/links` leva ao login com `next`, e o login volta para lá;
  - logado, abrir `/app/login` leva para a lista;
  - um `401` no meio do uso leva ao login com a mensagem de sessão expirada;
  - logout e exclusão de conta limpam o cache, e os dados da conta anterior não reaparecem.
- **Login e cadastro**: sucesso; `401`, `409`, `422` e `429` com as mensagens certas; botão desabilitado durante o envio.
- **Meus links**:
  - criar com cada opção de expiração envia o `expiresIn` certo, e o link novo aparece no topo;
  - `blocked_url`, URL inválida, `429` e `503` com as mensagens certas;
  - a lista mostra cliques e expiração relativa ("nunca expira" para `null`);
  - apagar pede confirmação, chama a API e atualiza a lista; cancelar não apaga;
  - a paginação muda `?page` e busca a página certa;
  - o botão de copiar escreve no `navigator.clipboard`.
- **Relatório**:
  - os atalhos e o período personalizado geram `from`, `to` e `tz` corretos e ficam na URL;
  - abrir uma URL com `?from&to&bots=1` restaura a visão;
  - a chave de robôs envia `includeBots=true`;
  - rótulos: "BR" → "Brasil", "BR-TO" → "Tocantins", `null` → "Desconhecido" ou "Direto ou sem origem", `"other"` → "Outros", `facebookexternalhit` → "Facebook, Instagram ou iMessage";
  - período sem cliques mostra o estado vazio; `404` mostra a tela própria;
  - a atribuição da MaxMind aparece.
- **Recharts no jsdom**: o `ResponsiveContainer` precisa de `ResizeObserver` e de tamanho, que o jsdom não tem. O `setup.ts` cria um `ResizeObserver` falso, e os testes conferem a tabela oculta em vez do SVG.

## Passos de implementação

1. Dependências, proxy `/api` no Vite, `gen:api` e o `schema.d.ts` gerado.
2. `client.ts`, `errors.ts`, `hooks.ts` e a infraestrutura de testes (`render.tsx`, mock de `fetch`).
3. Rotas, guarda de sessão, layout, login e cadastro.
4. Meus links: formulário, lista, cópia, exclusão e paginação.
5. Relatório: cabeçalho, período, indicadores, gráfico, rankings, compartilhamentos e atribuição.
6. Conta: sair e excluir.
7. README: seção do front atualizada (o aviso de que o front é o da fase 1 sai) e o `gen:api`.

## Para quando houver deploy

Fora deste plano, mas registrado para não se perder:

- **Rotas do front**: o servidor precisa devolver o `index.html` para qualquer caminho sob `/app`, para os links diretos funcionarem.
- **Domínio**: front e API precisam ficar no mesmo domínio, com um proxy encaminhando `/api`, ou a API precisa liberar CORS para o domínio do front com `credentials`. A primeira opção mantém a proteção de CSRF como está.
