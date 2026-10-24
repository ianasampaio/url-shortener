# Fase 2.1: usuários

Escopo do back-end. O front desta fase é planejado à parte, em `frontend/`, depois que o back estiver pronto.

## Escopo

- Cadastro, login, logout e exclusão de conta, com sessão em JWT dentro de cookie.
- Criar link passa a **exigir login**. Todo link tem dono.
- O dono lista e apaga os próprios links.
- Expiração escolhida na criação: 1 dia, 7 dias, 30 dias ou nunca.
- Rate limit por usuário e por IP, com Redis.
- Recusa de URLs que apontam para o próprio domínio ou para outros encurtadores.
- Todas as rotas JSON passam para o prefixo `/api`.

Fora do escopo: verificação de e-mail, recuperação e troca de senha, login social, papéis de admin, moderação, Safe Browsing. Não haverá fase de abuso; veja [Riscos aceitos](#riscos-aceitos).

## Decisões

| Tema | Decisão | Motivo |
|---|---|---|
| Criação anônima | não existe | sem moderação nem Safe Browsing, o anônimo seria o caminho do spam sem nada atrás do rate limit |
| Sessão | JWT (PyJWT, HS256) em cookie `httpOnly` | sem banimento, a revogação imediata deixa de ser requisito; o cookie impede que um script injetado leia o token |
| Refresh token | não há; um token só, válido por 7 dias | um refresh token seguro precisa ser revogável, ou seja, guardado no banco, o que traria a sessão de volta |
| Hash de senha | argon2id (`pwdlib[argon2]`) | é o recomendado atualmente para senhas |
| CSRF | `SameSite=Lax` + checagem de `Origin` | o cookie é enviado automaticamente pelo navegador; isso impede que outro site faça ações em nome do usuário |
| Rate limit | janela fixa no Redis (`INCR` + `EXPIRE`) | o contador precisa ser compartilhado entre réplicas; o Redis também vai servir à fila da fase 2.2 |
| Prefixo `/api` | todas as rotas JSON, exceto `/health` | o proxy do Vite e um futuro proxy de produção encaminham um prefixo só; o `/{code}` continua na raiz |

## Configuração (env)

Novas variáveis, além das da fase 1:

| Variável           | Padrão                                         | Uso |
|--------------------|------------------------------------------------|-----|
| `JWT_SECRET`       | **obrigatória**                                | assinatura do token; a app não sobe sem ela |
| `JWT_EXPIRES_DAYS` | `7`                                            | validade do token e do cookie |
| `COOKIE_SECURE`    | `true`                                         | `false` só em dev e nos testes, que rodam em `http://` |
| `ALLOWED_ORIGINS`  | `http://localhost:5173,http://localhost:8000`  | origens aceitas na checagem de CSRF |
| `REDIS_URL`        | `redis://localhost:6379/0`                     | rate limit (e fila, na 2.2) |

O `docker-compose.yml` ganha um serviço `redis` (imagem `redis:7`, porta 6379). O serviço `mongo` passa a ter limite de 64000 arquivos abertos: o padrão do Docker, 1024, derrubava o `mongod` com `EMFILE` durante os testes, que recriam o banco a cada teste.

## Modelo de dados

### Collection `users` (nova)

```js
{
  _id:          ObjectId("..."),
  email:        "iana@exemplo.com",   // normalizado: trim + minúsculas
  passwordHash: "$argon2id$v=19$...",
  createdAt:    ISODate("...")
}
```

- Validator com `email`, `passwordHash` e `createdAt` obrigatórios.
- Índice único em `email`.

### Collection `urls` (alterada)

```js
{
  _id:         "aB3xK9q",
  originalUrl: "https://exemplo.com/…",
  ownerId:     ObjectId("..."),           // novo, obrigatório
  createdAt:   ISODate("..."),
  expiresAt:   ISODate("...")             // novo, opcional; ausente = nunca expira
}
```

- **Validator**: `ownerId` (objectId) obrigatório e `expiresAt` (date) opcional.
- **TTL**: sai o índice `{ createdAt: 1 }` com 30 dias fixos, e entra `{ expiresAt: 1 }` com `expireAfterSeconds: 0`. O Mongo apaga cada documento na hora do próprio `expiresAt`, e documentos sem o campo nunca são apagados.
- **Novo índice** `{ ownerId: 1, createdAt: -1 }` para "meus links".

### Atualização do schema e migração

- **`ensure_schema` no startup** passa a:
  - aplicar o validator com `collMod` também quando a collection já existe;
  - remover o índice antigo `createdAt_1`, se existir;
  - criar os índices novos.

  Tudo continua idempotente.
- **Links antigos**: os da fase 1 não têm dono nem `expiresAt`, e sem a migração virariam links que nunca expiram. O script `backend/scripts/migrate_phase_2_1.py`, rodado uma vez à mão, apaga os documentos sem `ownerId`. O banco só tem dados de desenvolvimento, então nada se perde. Ele não roda no startup, porque apagar dados automaticamente na subida é arriscado.

## Autenticação

### Token e cookie

- **Claims**: `sub` (id do usuário), `iat` e `exp`.
- **Validação**:
  - algoritmo fixo (`algorithms=["HS256"]`);
  - `exp` obrigatório;
  - depois de validar o token, a API carrega o usuário pelo `sub`. Se a conta foi apagada, responde 401.
- **Cookie `access_token`**: `HttpOnly`, `Secure` (conforme `COOKIE_SECURE`), `SameSite=Lax`, `Path=/` e `Max-Age` igual à validade do token.
- **Sem cookie ou com token inválido**: `401 {"detail": "Not authenticated"}`.

### CSRF

Nas rotas `/api` com método `POST`, `PUT`, `PATCH` ou `DELETE`:

- se o cabeçalho `Origin` vier e não estiver em `ALLOWED_ORIGINS`, a API responde `403`;
- se o `Origin` não vier, a requisição passa. Navegadores modernos sempre enviam `Origin` nesses métodos, e clientes como o `curl` não estão sujeitos a CSRF.

### Endpoints

| Método e rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /api/auth/register` | `{email, password}` | `201` + cookie, corpo como em `/api/me` | `409` e-mail em uso, `422`, `429` |
| `POST /api/auth/login` | `{email, password}` | `200` + cookie, corpo como em `/api/me` | `401` genérico, `422`, `429` |
| `POST /api/auth/logout` | — | `204`, apaga o cookie | — |
| `GET /api/me` | — | `200 {id, email, createdAt}` | `401` |
| `DELETE /api/me` | — | `204`, apaga o cookie | `401` |

- **Senha**: de 8 a 128 caracteres, sem regras de composição. O máximo evita que uma senha gigante seja usada para sobrecarregar o servidor no cálculo do hash.
- **Login**: a resposta de erro é sempre `401 {"detail": "Invalid email or password"}`. Quando o e-mail não existe, a API verifica a senha contra um hash fictício mesmo assim, para que o tempo de resposta não revele quais e-mails têm conta.
- **Cadastro**: o `409` revela que o e-mail já tem conta. É uma troca aceita, porque a alternativa exigiria envio de e-mail, e a rota tem rate limit.
- **Exclusão de conta**: apaga o usuário e todos os links dele. Na 2.2, apaga também os cliques.

## Links

### `POST /api/links` (requer login)

```json
{ "url": "https://exemplo.com/um/caminho/longo", "expiresIn": "7d" }
```

- `expiresIn`: `"1d" | "7d" | "30d" | "never"`, com padrão `"30d"`.
- **Resposta `201`**: igual à da fase 1, mais `createdAt` (útil na listagem), e com `expiresAt` podendo ser `null`.
- **Validação extra da URL**, com resposta `422` no mesmo formato das outras validações:
  - recusa o host igual ao do `BASE_URL`, e os subdomínios dele;
  - recusa hosts da lista de encurtadores: `bit.ly`, `tinyurl.com`, `t.co`, `goo.gl`, `is.gd`, `ow.ly`, `buff.ly`, `cutt.ly`, `rebrand.ly`, `shorturl.at`, e os subdomínios deles.

### `GET /api/links?page=1&pageSize=20` (requer login)

- Lista só os links do usuário logado e ainda ativos (sem `expiresAt`, ou com `expiresAt` no futuro), do mais novo para o mais antigo.
- `pageSize` vai de 1 a 100.
- **Resposta**: `{items: [LinkOut], page, pageSize, total}`.

### `DELETE /api/links/{code}` (requer login)

- `204` se o link é do usuário.
- `404` se não existe **ou é de outra pessoa**. Responder `403` confirmaria que o código existe.

### `GET /{code}` (público)

- Mesma rota da fase 1. A conferência passa a ser: o link não existe, ou `expiresAt` existe e já passou → `404`.

## Rate limit

| Rota | Chave | Limite |
|---|---|---|
| `POST /api/links` | usuário | 50 por hora |
| `POST /api/auth/register` | IP | 5 por hora |
| `POST /api/auth/login` | IP | 10 a cada 15 minutos |
| `POST /api/auth/login` | e-mail | 10 a cada 15 minutos |

- **Implementação**: janela fixa, com chave `rl:{rota}:{sujeito}:{janela}`, `INCR` e `EXPIRE` na primeira contagem. Fica numa dependência do FastAPI.
- **Ao estourar**: `429 {"detail": "Too many requests"}` com o cabeçalho `Retry-After`.
- **IP**: vem de `request.client.host`. Atrás de proxy, o Uvicorn roda com `--proxy-headers --forwarded-allow-ips=<proxy>`; sem isso, o `X-Forwarded-For` não é usado, porque qualquer um pode forjá-lo. Endereços IPv6 são agrupados por prefixo `/64`, porque uma única conexão recebe um bloco inteiro de endereços.
- **Redis fora do ar**: a requisição passa sem limite e o erro vai para o log. A disponibilidade foi priorizada, e isso é um risco aceito.
- O limite por e-mail no login protege uma conta específica contra tentativas de senha vindas de vários IPs.

## Riscos aceitos

Esta seção vai para o README.

- **Links não são checados contra listas de URLs maliciosas** (Safe Browsing ou Web Risk), e não há denúncia nem moderação. A mitigação é login obrigatório, rate limit por conta e por IP, e recusa de outros encurtadores.
- **Sem verificação de e-mail**, criar contas em massa só é freado pelo rate limit de cadastro por IP.
- **Um token roubado vale até expirar**, no máximo 7 dias, mesmo depois do logout.
- **Com o Redis fora do ar, o rate limit fica desligado.**
- **Sem recuperação de senha**, quem esquece a senha perde a conta.

## Impacto no front

O contrato muda e quebra o front atual: `POST /links` vira `POST /api/links` e passa a exigir login, e o proxy do Vite precisa encaminhar `/api`. O front da 2.1 é planejado separadamente.

## Estrutura

```
backend/
  app/
    main.py          # lifespan (Mongo + Redis), routers, /health
    config.py        # novas envs
    db.py            # ensure_schema: users, urls (collMod, índices)
    codes.py
    security.py      # hash de senha, JWT, cookie
    deps.py          # get_db, get_redis, current_user, check_origin
    ratelimit.py     # Limit, enforce_limit, client_ip
    blocklist.py     # domínio próprio + encurtadores
    schemas.py       # + UserCreate, UserOut, LinkPage, expiresIn
    repository.py    # + usuários, ownerId, expiresAt, paginação, exclusões
    routes/
      auth.py        # /api/auth/*, /api/me
      links.py       # /api/links
      redirect.py    # /{code}
  scripts/
    migrate_phase_2_1.py
  tests/
```

Novas dependências: `pyjwt`, `pwdlib[argon2]`, `email-validator` (para o `EmailStr`), `redis`.

## Testes

Rodam com o Mongo e o Redis do compose. O Redis de testes usa um banco separado (`/15`) e é limpo a cada teste.

- **Cadastro**:
  - sucesso define o cookie;
  - e-mail duplicado, mesmo com maiúsculas diferentes → 409;
  - senha curta ou longa demais → 422.
- **Login**:
  - sucesso define o cookie;
  - senha errada e e-mail inexistente → o mesmo 401.
- **Sessão**:
  - `GET /api/me` com e sem cookie;
  - token expirado, com assinatura errada ou com `alg: none` → 401;
  - logout apaga o cookie.
- **Exclusão de conta**: apaga os links, e o token antigo passa a dar 401.
- **CSRF**: `POST` com `Origin` fora da lista → 403; com origem permitida, ou sem `Origin` → passa.
- **Criação de link**:
  - sem login → 401;
  - para cada `expiresIn`, o `expiresAt` correto, e `null` em `never`;
  - o documento gravado tem `ownerId`.
- **Blocklist**: o próprio domínio, `bit.ly`, `www.bit.ly` → 422; `bit.ly.exemplo.com` → aceito.
- **Listagem**: só os links do usuário, sem os expirados, com paginação e `total` corretos.
- **Exclusão de link**: do próprio usuário → 204; de outra pessoa ou inexistente → 404.
- **Redirect**:
  - link com `expiresAt` no passado → 404;
  - link sem `expiresAt` → 302.
- **Rate limit**:
  - a requisição de número N+1 → 429 com `Retry-After`;
  - o limite de um usuário não afeta outro;
  - com o Redis inacessível, a requisição passa.
- **Schema**: o índice TTL em `expiresAt` existe, o índice antigo não existe mais, o validator recusa link sem `ownerId`, e o `ensure_schema` funciona sobre um banco da fase 1.

## Passos de implementação

1. ✅ Redis no compose, novas envs, prefixo `/api` e reorganização das rotas.
2. ✅ Schema: `users`, o novo validator e os índices de `urls`, e o script de migração.
3. ✅ Autenticação: hash, JWT, cookie, `current_user`, CSRF e os endpoints de auth.
4. ✅ Links: `ownerId`, `expiresIn`, blocklist, listagem e exclusão; expiração no redirect.
5. ✅ Rate limit.
6. ✅ README: Redis, envs, migração e riscos aceitos.
