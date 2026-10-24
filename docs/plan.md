# Fase 1: criação e redirecionamento

## Escopo

- `POST /links` recebe uma URL longa e devolve o código curto.
- `GET /{code}` redireciona para a URL original, ou retorna 404 se o código não existir.
- O código é único no banco e a colisão é tratada.
- O link expira sozinho 30 dias depois de criado (TTL index).

Fora do escopo desta fase: autenticação, código customizado, contagem de acessos, rate limit, deleção manual.

## Stack

- Python 3.11, FastAPI, Uvicorn
- MongoDB 8 via `docker compose`
- PyMongo com a API async (`AsyncMongoClient`); o Motor está descontinuado
- `pydantic-settings` para configuração, `uv` para dependências, `ruff` para lint, `pytest` para testes

## Configuração (env)

| Variável      | Padrão                      | Uso                                      |
|---------------|-----------------------------|------------------------------------------|
| `MONGO_URI`   | `mongodb://localhost:27017` | conexão com o Mongo                      |
| `MONGO_DB`    | `url_shortener`             | nome do banco (testes: `url_shortener_test`) |
| `BASE_URL`    | `http://localhost:8000`     | prefixo de `shortUrl` na resposta        |
| `CODE_LENGTH` | `7`                         | tamanho do código gerado (6 a 8)         |

## Modelo de dados

Collection `urls`, com o validator e o índice definidos na especificação:

```js
{
  _id:         "aB3xK9q",               // código curto, ^[a-zA-Z0-9]{6,8}$
  originalUrl: "https://exemplo.com/…", // ^https?://
  createdAt:   ISODate("2026-10-17T12:00:00Z")
}
```

- **Unicidade:** o código é o `_id`, então o índice único já existe por padrão. Não há índice extra.
- **TTL:** `createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 })`.
- **Criação:** no startup (lifespan), a app cria a collection com o validator se ela não existir e chama `create_index` para o TTL (idempotente). Se o índice já existir com outro `expireAfterSeconds`, o Mongo recusa e a app falha ao subir de propósito: a correção é manual (`collMod`).

## Endpoints

### `POST /links`

Request:

```json
{ "url": "https://exemplo.com/um/caminho/longo" }
```

Resposta `201 Created`:

```json
{
  "code": "aB3xK9q",
  "shortUrl": "http://localhost:8000/aB3xK9q",
  "originalUrl": "https://exemplo.com/um/caminho/longo",
  "expiresAt": "2026-11-16T12:00:00Z"
}
```

- Validação com `HttpUrl` do Pydantic: só `http`/`https`, até 2048 caracteres. URL inválida → `422`.
- A URL é gravada já normalizada pelo Pydantic (`str(HttpUrl)`). Por exemplo, `https://exemplo.com` vira `https://exemplo.com/`.
- A mesma URL enviada duas vezes gera dois códigos diferentes, cada um com seus 30 dias.
- `expiresAt = createdAt + 30 dias` é calculado na resposta; não é gravado.

### `GET /{code}`

- Código fora do padrão `^[a-zA-Z0-9]{6,8}$` → `404` (não `422`, para não diferenciar "inválido" de "inexistente").
- Busca só por `{ _id: code }` e confere a expiração na aplicação:
  - Encontrou e `createdAt > agora - 30 dias` → `302 Found` com `Location: originalUrl`.
  - Não encontrou, ou já passou de 30 dias → `404 {"detail": "Link not found"}`.
- **Por que 302 e não 301:** o navegador guarda o 301 em cache indefinidamente e continuaria redirecionando depois que o link expirasse.
- **Por que conferir `createdAt`:** o TTL monitor do Mongo roda a cada ~60 s e pode atrasar quando o banco está sob carga. A conferência torna a expiração exata, e o TTL fica só com a limpeza física.
- **Por que conferir no Python e não na consulta:** uma busca só por `_id` usa o caminho rápido do Mongo, que pula o planejador de consultas (IDHACK). Com um filtro a mais em `createdAt`, a consulta passaria pelo planejador normal. O resultado é o mesmo, e a comparação de data no Python custa nanossegundos.
- `/docs`, `/redoc` e `/openapi.json` do FastAPI não casam com o padrão do código. Já `/health` casa (6 caracteres), então `health` fica em `RESERVED_CODES` e o gerador nunca o produz. A rota `/health` é registrada antes de `/{code}`.

### `GET /health`

Faz `ping` no Mongo e retorna `{"status": "ok"}` (já existe no bootstrap).

## Geração do código e colisão

- `secrets.choice` sobre `[a-zA-Z0-9]` (base62), com `CODE_LENGTH` caracteres, descartando códigos reservados (`health`).
- Não consultamos o banco antes de inserir: o `insert_one` direto é atômico. Se der `DuplicateKeyError` no `_id`, geramos outro código e tentamos de novo.
- Até 5 tentativas. Depois disso, `503 Service Unavailable`, sinal de que o espaço de códigos está saturado e o `CODE_LENGTH` precisa crescer.
- Espaço com 7 caracteres: 62⁷ ≈ 3,5 trilhões. Com 10 milhões de links ativos, a chance de colisão numa inserção é de ~1 em 350 mil, e o TTL limita o estoque.

## Estrutura

```
backend/
  app/
    main.py        # FastAPI, lifespan, inclusão das rotas
    config.py      # Settings (pydantic-settings)
    db.py          # cliente, ensure_schema (validator + TTL)
    codes.py       # generate_code(length), RESERVED_CODES
    schemas.py     # LinkCreate, LinkOut
    repository.py  # insert_link (com retry), find_link (por _id)
    routes.py      # POST /links, GET /{code}
  tests/
    conftest.py    # TestClient; dropa o banco de teste a cada teste
    test_health.py
    test_codes.py
    test_links.py
    test_redirect.py
    test_schema.py
frontend/        # React + Vite (consome POST /links via proxy do Vite)
```

## Testes

Rodam contra o Mongo do `docker compose`, no banco `url_shortener_test`, que é dropado a cada teste. Sem mongomock: validator e índices precisam ser exercitados de verdade.

- `POST /links` com URL válida → 201, código com o tamanho configurado, documento gravado.
- `POST /links` com URL inválida (`ftp://`, sem esquema, texto, > 2048) → 422.
- Colisão: `generate_code` mockado para repetir um código existente e depois devolver um novo → 201 com o código novo.
- Colisão persistente: mock sempre repete → 503.
- `GET /{code}` existente → 302 com `Location` correto.
- `GET /{code}` inexistente ou fora do padrão → 404.
- Link com `createdAt` de 31 dias atrás inserido direto no banco → 404.
- Schema: o índice TTL existe com `expireAfterSeconds = 2592000`; o validator rejeita um documento fora do padrão.

## Passos de implementação

1. ✅ Bootstrap: `pyproject`, compose, settings, lifespan, `/health`, teste de health.
2. ✅ `ensure_schema` no startup e `test_schema.py`.
3. ✅ `generate_code`, `schemas.py` e `POST /links` com retry de colisão, e testes.
4. ✅ `GET /{code}` com conferência de expiração, e testes.
5. ✅ README com exemplos de `curl`.
