# url-shortener

Encurtador de URLs. Monorepo com a API em FastAPI + MongoDB ([backend/](backend/)) e o front em React + Vite ([frontend/](frontend/)). Os planos estão em [docs/](docs/): [fase 1](docs/plan-phase-1.md), [fase 2.1](docs/plan-phase-2.1.md) e [fase 2.2](docs/plan-phase-2.2.md).

```
backend/             API (FastAPI, PyMongo async), gerenciada com uv
frontend/            SPA (React, Vite, TypeScript), gerenciada com npm
docs/                planos
docker-compose.yml   MongoDB local
```

## Rodando localmente

Na raiz, suba o Mongo:

```bash
docker compose up -d mongo
```

API, em `backend/`:

```bash
cd backend
cp .env.example .env   # opcional: os padrões já apontam para o Mongo do compose
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000
```

Front, em `frontend/` (com a API de pé):

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

Em dev, o Vite encaminha `/links` para a API em `http://localhost:8000`, então o front chama caminhos relativos e a API não precisa de CORS.

- Health check: `GET http://localhost:8000/health`
- OpenAPI: http://localhost:8000/docs

Ao subir, a API cria a collection `urls` com o validator e o índice TTL de 30 dias, se ainda não existirem.

## Uso da API

Criar um link:

```bash
curl -X POST http://localhost:8000/links \
  -H 'content-type: application/json' \
  -d '{"url": "https://exemplo.com/um/caminho/longo"}'
```

```json
{
  "code": "VvqrXFo",
  "shortUrl": "http://localhost:8000/VvqrXFo",
  "originalUrl": "https://exemplo.com/um/caminho/longo",
  "expiresAt": "2026-11-16T12:40:08.419000Z"
}
```

Seguir o link:

```bash
curl -i http://localhost:8000/VvqrXFo
# HTTP/1.1 302 Found
# location: https://exemplo.com/um/caminho/longo
```

Código inexistente, malformado ou com mais de 30 dias responde `404 {"detail": "Link not found"}`.

## Testes e lint

Backend (usa o Mongo do `docker compose`, banco `url_shortener_test`):

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
