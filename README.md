# url-shortener

Encurtador de URLs. Monorepo com a API em FastAPI + MongoDB + Redis ([backend/](backend/)) e o front em React + Vite ([frontend/](frontend/)). Os planos estão em [docs/](docs/): [fase 1](docs/plan-phase-1.md), [fase 2.1](docs/plan-phase-2.1.md) e [fase 2.2](docs/plan-phase-2.2.md).

```
backend/             API (FastAPI, PyMongo async, Redis), gerenciada com uv
frontend/            SPA (React, Vite, TypeScript), gerenciada com npm
docs/                planos
docker-compose.yml   MongoDB e Redis locais
```

## Rodando localmente

Na raiz, suba o Mongo e o Redis:

```bash
docker compose up -d
```

API, em `backend/`:

```bash
cd backend
cp .env.example .env   # obrigatório: a API não sobe sem JWT_SECRET
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000
```

Troque o `JWT_SECRET` do `.env` por um valor gerado com `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

Front, em `frontend/` (com a API de pé):

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

> O front ainda é o da fase 1: chama `POST /links` sem login e não funciona com a API da fase 2.1, que usa `/api/links` e exige login. Ele será atualizado à parte.

- Health check: `GET http://localhost:8000/health`
- OpenAPI: http://localhost:8000/docs

Ao subir, a API cria ou atualiza as collections `urls` e `users`, com validators e índices: TTL em `expiresAt`, índice de "meus links" e e-mail único.

### Atualizando um banco da fase 1

Os links da fase 1 não têm dono e, depois da fase 2.1, nunca expirariam. Apague-os uma vez:

```bash
cd backend
uv run python -m scripts.migrate_phase_2_1           # só conta
uv run python -m scripts.migrate_phase_2_1 --apply   # apaga
```

## Uso da API

Todas as rotas JSON ficam em `/api`. A sessão é um JWT num cookie `httpOnly`, então o `curl` precisa de um arquivo de cookies (`-c` grava, `-b` envia).

Criar conta (já entra logado):

```bash
curl -c cookies.txt -X POST http://localhost:8000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email": "voce@exemplo.com", "password": "uma senha longa"}'
```

Criar um link (`expiresIn`: `1d`, `7d`, `30d` ou `never`; padrão `30d`):

```bash
curl -b cookies.txt -X POST http://localhost:8000/api/links \
  -H 'content-type: application/json' \
  -d '{"url": "https://exemplo.com/um/caminho/longo", "expiresIn": "7d"}'
```

```json
{
  "code": "uyeaKNy",
  "shortUrl": "http://localhost:8000/uyeaKNy",
  "originalUrl": "https://exemplo.com/um/caminho/longo",
  "createdAt": "2026-10-24T13:16:35.514000Z",
  "expiresAt": "2026-10-31T13:16:35.514000Z"
}
```

Seguir o link (público, sem login):

```bash
curl -i http://localhost:8000/uyeaKNy
# HTTP/1.1 302 Found
# location: https://exemplo.com/um/caminho/longo
```

Código inexistente, malformado ou expirado responde `404 {"detail": "Link not found"}`.

| Rota | Login | Descrição |
|---|---|---|
| `POST /api/auth/register` | — | cria a conta e define o cookie |
| `POST /api/auth/login` | — | define o cookie |
| `POST /api/auth/logout` | — | apaga o cookie |
| `GET /api/me` | sim | usuário logado |
| `DELETE /api/me` | sim | apaga a conta e todos os links dela |
| `POST /api/links` | sim | cria um link |
| `GET /api/links?page=1&pageSize=20` | sim | meus links ativos, do mais novo ao mais antigo |
| `DELETE /api/links/{code}` | sim | apaga um link meu (404 se for de outra pessoa) |
| `GET /{code}` | — | redireciona |

## Proteção contra abuso

Encurtador aberto ao público é muito usado para espalhar phishing e spam, e o domínio pode acabar em listas de bloqueio. As defesas:

- **Login obrigatório para criar links.** Todo link tem um dono responsável.
- **Rate limit** no Redis:

  | Rota | Chave | Limite |
  |---|---|---|
  | criar link | usuário | 50 por hora |
  | cadastro | IP | 5 por hora |
  | login | IP | 10 a cada 15 minutos |
  | login | e-mail | 10 a cada 15 minutos |

  Endereços IPv6 são agrupados por prefixo `/64`. Atrás de proxy, rode o Uvicorn com `--proxy-headers --forwarded-allow-ips=<ip do proxy>`; sem isso, o `X-Forwarded-For` é ignorado, porque qualquer um pode forjá-lo.
- **Recusa de URLs** que apontam para o próprio serviço ou para outros encurtadores (`bit.ly`, `tinyurl.com`, `t.co`…), o que evita loops e esconder o destino real.
- **CSRF**: cookie `SameSite=Lax`, e as rotas que alteram dados recusam um `Origin` fora de `ALLOWED_ORIGINS`.

### Riscos aceitos

- **Links não são checados contra listas de URLs maliciosas** (Safe Browsing ou Web Risk), e não há denúncia nem moderação.
- **Sem verificação de e-mail**, criar contas em massa só é freado pelo rate limit de cadastro por IP.
- **Um token roubado vale até expirar**, no máximo 7 dias, mesmo depois do logout.
- **Com o Redis fora do ar, o rate limit fica desligado**, para que a API continue disponível.
- **Sem recuperação de senha**, quem esquece a senha perde a conta.

## Testes e lint

Backend (usa o Mongo e o Redis do `docker compose`, com o banco `url_shortener_test` e o Redis `/15`):

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Frontend:

```bash
cd frontend
npm test
npm run lint
npm run build
```
