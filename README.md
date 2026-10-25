# url-shortener

Encurtador de URLs. Monorepo com a API em FastAPI + MongoDB + Redis ([backend/](backend/)) e o front em React + Vite ([frontend/](frontend/)). Os planos estão em [docs/](docs/): [fase 1](docs/plan-phase-1.md), [fase 2.1](docs/plan-phase-2.1.md), [fase 2.2](docs/plan-phase-2.2.md) e [front das fases 2.1 e 2.2](docs/plan-frontend-phase-2.md).

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

Worker de cliques, em outro terminal, também em `backend/` (sem ele os redirects funcionam, mas os cliques ficam na fila sem ser gravados):

```bash
cd backend
uv run rq worker --worker-class rq.worker.SimpleWorker --url redis://localhost:6379/0 clicks
```

Front, em `frontend/` (com a API de pé):

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

> O front ainda é o da fase 1: chama `POST /links` sem login e não funciona com a API da fase 2.1, que usa `/api/links` e exige login. Ele será atualizado à parte.

- Health check: `GET http://localhost:8000/health`
- OpenAPI: http://localhost:8000/docs

Ao subir, a API cria ou atualiza as collections `urls` e `users`, com validators e índices (TTL em `expiresAt`, índice de "meus links" e e-mail único), e a collection de séries temporais `clicks`.

### Geolocalização (GeoLite2)

País e estado dos cliques vêm da base gratuita GeoLite2 City, da MaxMind, consultada localmente pelo worker. Sem ela, os cliques são gravados sem `geo`. Em dev isso é o normal de qualquer forma: os acessos chegam de `127.0.0.1`, que não está na base.

1. Crie uma conta gratuita em https://www.maxmind.com/en/geolite2/signup e gere uma chave de licença.
2. Baixe e mantenha a base atualizada com a ferramenta oficial `geoipupdate`. A licença exige trocar a base em até 30 dias depois de cada versão nova; rodar semanalmente cumpre isso com folga:

   ```bash
   docker run --rm -v "$PWD/backend/geoip:/usr/share/GeoIP" \
     -e GEOIPUPDATE_ACCOUNT_ID=<id> -e GEOIPUPDATE_LICENSE_KEY=<chave> \
     -e GEOIPUPDATE_EDITION_IDS=GeoLite2-City \
     maxmindinc/geoipupdate
   ```
3. Aponte o worker para a base no `backend/.env`: `GEOIP_DB_PATH=geoip/GeoLite2-City.mmdb`. Arquivos `.mmdb` não vão para o repositório.

This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com.

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
  "expiresAt": "2026-10-31T13:16:35.514000Z",
  "clickCount": 0
}
```

Seguir o link (público, sem login):

```bash
curl -i http://localhost:8000/uyeaKNy
# HTTP/1.1 302 Found
# location: https://exemplo.com/um/caminho/longo
```

Código inexistente, malformado ou expirado responde `404 {"detail": "Link not found"}`.

Relatório de cliques de um link (só para o dono; `from` e `to` são dias inteiros no fuso `tz`, padrão: últimos 30 dias em UTC, máximo de 400 dias):

```bash
curl -b cookies.txt 'http://localhost:8000/api/links/uyeaKNy/stats?from=2026-10-01&to=2026-10-31&tz=America/Sao_Paulo'
```

A resposta traz totais, a série diária (com zero nos dias sem clique) e os 10 primeiros de cada ranking (país, estado, origem, navegador, sistema e dispositivo), com o restante somado em `"other"` e `null` para desconhecido. Bots ficam fora dos totais, a menos que se passe `includeBots=true`, mas sempre aparecem em `bots`: as pré-visualizações de WhatsApp, Slack e afins indicam quantas vezes o link foi compartilhado. `uniqueVisitors` é a soma dos visitantes únicos de cada dia.

| Rota | Login | Descrição |
|---|---|---|
| `POST /api/auth/register` | — | cria a conta e define o cookie |
| `POST /api/auth/login` | — | define o cookie |
| `POST /api/auth/logout` | — | apaga o cookie |
| `GET /api/me` | sim | usuário logado |
| `DELETE /api/me` | sim | apaga a conta, os links e os cliques dela |
| `POST /api/links` | sim | cria um link |
| `GET /api/links?page=1&pageSize=20` | sim | meus links ativos, do mais novo ao mais antigo |
| `GET /api/links/{code}` | sim | um link meu (404 se for de outra pessoa ou tiver expirado) |
| `DELETE /api/links/{code}` | sim | apaga um link meu e os cliques dele (404 se for de outra pessoa) |
| `GET /api/links/{code}/stats` | sim | relatório de cliques de um link meu |
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

## Métricas de cliques

O redirect responde primeiro e só depois publica o clique numa fila (Redis + RQ), então o visitante nunca espera por ela. Pré-carregamentos do navegador (`Sec-Purpose: prefetch`) recebem `503`: se a pré-carga fosse aceita, o clique real reaproveitaria a cópia guardada e nunca chegaria ao servidor. Recusada, o clique que vier depois chega normalmente e é contado. Um worker processa cada evento: identifica bots e pré-visualizações, extrai navegador, sistema, dispositivo, país e estado, reduz o referer ao domínio e grava o clique na collection de séries temporais `clicks`.

**Privacidade.** O IP só passa pela fila (que apaga o job assim que ele é processado) e é usado para a geolocalização e para o `visitorHash`, um SHA-256 do IP e do User-Agent com um sal que muda todo dia e depois é descartado. O IP não é gravado, e o hash não serve para seguir alguém entre dias ou entre links. Cidade e versão do sistema também não são gravadas. Os cliques são mantidos por 13 meses (`CLICKS_RETENTION_DAYS`).

### Riscos aceitos das métricas

- **Com o Redis fora do ar**, os cliques do período se perdem, mas os redirects continuam funcionando.
- **Um clique pode ser contado duas vezes** se o worker cair no meio do processamento.
- **Visitantes únicos são aproximados**: só valem por dia, e um mesmo visitante pode contar duas vezes perto da meia-noite UTC.
- **A detecção de bots se baseia no User-Agent**, que um bot pode falsificar.
- **A geolocalização por IP erra** com VPN, rede móvel e proxies corporativos.

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
