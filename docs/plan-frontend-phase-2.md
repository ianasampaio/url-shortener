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
| `/` | Home pública: campo de URL e convite para criar conta | só deslogado; logado vai para `/app/links` |
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

- Script `npm run gen:api`: `openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`, com a API de pé. O `openapi-typescript` ainda não declara suporte ao TypeScript 6, que o projeto usa, então o script o executa isolado via `npx`, com o TypeScript 5 dele, em vez de instalá-lo como dependência. O arquivo gerado é só declaração de tipos, e o TypeScript 6 o lê normalmente.
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

### Home

Página pública em `/`, com a mesma identidade visual e o mesmo cabeçalho do painel.

- **Cabeçalho**: marca à esquerda; à direita, "Entrar" e "Cadastre-se gratuitamente". No celular, o botão mostra só "Cadastre-se"; o "gratuitamente" continua no nome acessível.
- **Campo de URL** com o botão "Encurtar URL". A validação básica (vazio, sem `http(s)://`) acontece ali mesmo.
- **Encurtar exige conta**: o botão abre um modal que convida a criar conta ou entrar, com os benefícios (links num só lugar, relatório de cliques, validade à escolha). Nada é enviado à API.
- **A URL não se perde**: os botões do modal levam a `/app/signup?next=…` e `/app/login?next=…`, com `next=/app/links?url=<a URL digitada>`. Depois de entrar, o painel abre com o campo preenchido, e o `?url=` sai da barra de endereço.
- Abaixo do formulário, os mesmos três benefícios em cartões.

### Login e cadastro

- E-mail e senha, com `label` visível. O cadastro valida no cliente o formato do e-mail e o tamanho da senha (8 a 128), mas a validação que vale é a da API.
- Botão desabilitado com indicação de carregamento durante o envio.
- Link entre as duas telas ("Ainda não tem conta? Crie uma").
- Depois do sucesso, vai para o `next` ou para `/app/links`.

### Layout de quem está logado

- O painel de links é a página inicial de quem está logado, então o cabeçalho não tem "Meus links": só a marca (que leva ao painel) e o **ícone de perfil**.
- **Menu de perfil**: abre ao passar o mouse ou ao clicar. Mostra "Conectado como" com o e-mail, "Minha conta" (a tela de conta, onde fica a exclusão) e "Sair". Fecha com Esc (devolvendo o foco ao ícone), com clique fora ou ao sair dele pelo teclado. Quando o hover abre o menu, o clique que costuma vir logo depois não o fecha.
- **Sair** e **excluir a conta** levam à Home.

### Meus links

**Formulário de criação**, no topo:

- campo de URL e **Validade** (1 dia, 7 dias, 30 dias, sem validade; padrão 30 dias), numa lista suspensa própria, com o visual do app (o menu do `<select>` nativo não aceita estilo). Segue o padrão de listbox do ARIA: setas, Home/End, Enter/Espaço escolhem, Esc fecha, e a opção atual aparece marcada;
- depois de criar, o link novo aparece destacado no topo da lista, com o botão de copiar focado;
- erros perto do campo, ligados a ele por `aria-describedby`.

**Lista**:

- **Colunas**:
  - link curto, com botão de copiar e confirmação "Copiado!";
  - destino truncado, com o endereço completo no `title` e a data de criação numa linha discreta abaixo (como coluna própria, a tabela não cabia com as ações);
  - validade relativa ("expira em 3 dias", "nunca expira"), destacada quando falta menos de 24 horas;
  - cliques (`clickCount`);
  - ações como ícones (gráfico para o relatório, lixeira para apagar), com o nome no `aria-label` ("Relatório de localhost:8000/aB3xK9q") e uma dica no `title`.
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

**Rodapé**, obrigatório pela licença: "This product includes GeoLite Data created by MaxMind, available from https://www.maxmind.com".

### Conta

- Link "← Meus links" no topo.
- Cartão com o e-mail, a data de criação e "Sair".
- **Exclusão numa área separada**, com borda avermelhada, explicação e o botão "Excluir conta" (vermelho tingido). A confirmação num `<dialog>` explica que os links e os cliques serão apagados de forma permanente. Depois da exclusão, o cache é limpo e a pessoa vai para a Home.

## Visual e temas

- **Tema claro e escuro**: começa pela preferência do sistema (`prefers-color-scheme`), e o ícone de sol/lua no cabeçalho alterna entre os dois. A escolha fica no `localStorage` e em `data-theme` no `<html>`. Um script no `index.html` a aplica antes de a página desenhar, para não piscar no tema errado. O magenta continua sendo a cor da marca. No escuro, o magenta usado como texto (`--accent-fg`) fica mais claro, para manter o contraste.
- **Tokens em `index.css`**: as telas usam só variáveis. Superfícies em camadas: fundo, cartão (`--surface`) e elementos flutuantes (`--surface-raised`). Bordas translúcidas, sombras em camadas e um anel de foco translúcido.
- **Cantos por função**: `--radius-xs` (6 px, dicas), `--radius-sm` (8 px, itens dentro de menus, listas e do controle de período), `--radius-control` (12 px, botões, campos, seletor, botões de ícone), `--radius-popover` (14 px, menus e listas suspensas), `--radius-card` (20 px, cartões, modal, tabela e painéis de vidro) e `--radius-pill` (etiquetas). Em elementos aninhados, o raio de fora é o de dentro mais o espaçamento, para os cantos ficarem concêntricos. Nenhum canto usa valor solto.
- **Transparência só no que flutua**: cabeçalho fixo, menu de perfil, lista de validade, formulário da Home e cartão de login, com `backdrop-filter`. Quem pede menos transparência no sistema (`prefers-reduced-transparency`), ou usa navegador sem `backdrop-filter`, recebe superfícies sólidas.
- **Fundo**: duas manchas de cor desfocadas no topo (magenta e um violeta de apoio).
- **Home**: etiqueta, título com gradiente em "cada clique" e uma miniatura fiel do relatório (`ReportPreview`), com o cabeçalho do link, os atalhos de período, os três indicadores, o gráfico diário e os rankings de países e origem. Os dados de exemplo somam o mesmo total nas barras e nos rankings. O gráfico é em CSS, para a Home não carregar o Recharts, e os rankings reaproveitam o componente real. A miniatura é decorativa (`aria-hidden`).
- **Botões**: um tamanho único para todos os botões com texto (40 px de altura, o mesmo dos campos), inclusive no cabeçalho. Os botões só de ícone mostram uma dica ao passar o mouse ou focar pelo teclado (`data-tooltip`), como "Relatório" e "Excluir" na lista.
- **Marca Levo**: segue [docs/brand/levo-logo.html](brand/levo-logo.html). O logotipo em traço, com a trilha pontilhada do "l" ao "o", é o componente `Logo` (cores dos tokens, então acompanha o tema). O ícone da proposta virou o `favicon.svg`. A fonte é a Outfit, e o violeta da trilha é o token `--violet`.
- **Marca e crédito**: o nome do site (`SITE_NAME`) e o crédito do rodapé ficam em `src/site.ts`. O rodapé fica centralizado e aparece só nas páginas iniciais (Home e Meus links): "Encurtador · feito por Iana Sampaio · GitHub", com o nome levando ao perfil e "GitHub" ao repositório. Trocar a marca é mudar uma linha ali, e mais o `<title>` do `index.html`.
- **Movimento**: transições de 150 a 200 ms, e menus e modais surgindo com leve aumento de escala. Tudo desligado com `prefers-reduced-motion`.
- **Gráfico**: as cores vêm de variáveis via `style` e CSS, porque atributos SVG não resolvem `var()` e as cores não acompanhariam o tema.

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

Novas dependências: `react-router`, `@tanstack/react-query`, `recharts`. O `openapi-typescript` roda via `npx` no `gen:api`, sem entrar no `package.json`.

O relatório é carregado sob demanda (`lazy` do React Router): o Recharts, a maior dependência, só é baixado quando alguém abre um relatório.

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

1. ✅ Dependências, proxy `/api` no Vite, `gen:api` e o `schema.d.ts` gerado.
2. ✅ `client.ts`, `errors.ts`, `hooks.ts` e a infraestrutura de testes (`render.tsx`, mock de `fetch`).
3. ✅ Rotas, guarda de sessão, layout, login e cadastro.
4. ✅ Meus links: formulário, lista, cópia, exclusão e paginação.
5. ✅ Relatório: cabeçalho, período, indicadores, gráfico, rankings, compartilhamentos e atribuição.
6. ✅ Conta: sair e excluir.
7. ✅ README: seção do front atualizada (o aviso de que o front é o da fase 1 sai) e o `gen:api`.

## Para quando houver deploy

Fora deste plano, mas registrado para não se perder:

- **Rotas do front**: o servidor precisa devolver o `index.html` para qualquer caminho sob `/app`, para os links diretos funcionarem.
- **Domínio**: front e API precisam ficar no mesmo domínio, com um proxy encaminhando `/api`, ou a API precisa liberar CORS para o domínio do front com `credentials`. A primeira opção mantém a proteção de CSRF como está.
