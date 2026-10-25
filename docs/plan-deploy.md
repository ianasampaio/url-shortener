# Deploy: Levo no ar com custo zero

O backend ([fase 2.1](plan-phase-2.1.md), [fase 2.2](plan-phase-2.2.md)) e o [front](plan-frontend-phase-2.md) estão prontos. Este plano coloca o Levo em `https://levo.dev.br` usando só planos gratuitos.

## Escopo

- Front na **Vercel**, que também repassa `/api` e os links curtos para a API, tudo no domínio `levo.dev.br`.
- API no **Render** (web service gratuito), processando os cliques dentro dela mesma (sem worker separado).
- MongoDB no **Atlas** (M0 gratuito) e Redis no **Render Key Value** (gratuito).
- GitHub Actions para testes, para manter a API acordada e para a atualização semanal da GeoLite.
- Página de privacidade e termos de uso, com contato para denúncias.

Fora do escopo: e-mail com domínio próprio (o contato é o Gmail), monitoramento pago, backups automáticos (veja [Backups](#backups)).

## Restrição: custo zero

É um projeto pessoal, de uso gratuito e com poucos usuários previstos. Nenhuma peça pode ter custo. As consequências estão nas [Decisões](#decisões) e nos [Riscos aceitos](#riscos-aceitos).

## Arquitetura

```
                 levo.dev.br (DNS no Registro.br → Vercel)
                              │
                       ┌──────▼──────┐
  visitante ─────────► │   Vercel    │  /, /app/*, /assets/*, /favicon.svg → arquivos do build
                       │  (Hobby)    │  /api/*  e  /{código}  → repassa para a API
                       └──────┬──────┘
                              │ HTTPS
                       ┌──────▼──────────────┐
                       │ Render web service  │  FastAPI + cliques inline (BackgroundTasks)
                       │ (free, Docker)      │  baixa a GeoLite ao subir
                       └───┬─────────────┬───┘
                           │             │
                 ┌─────────▼───┐   ┌─────▼──────────────┐
                 │ MongoDB     │   │ Render Key Value   │  rate limit e sal diário
                 │ Atlas M0    │   │ (free, em memória) │
                 └─────────────┘   └────────────────────┘

  GitHub Actions: CI (testes), ping de /health a cada 10 min, reinício semanal (GeoLite)
```

Com tudo no mesmo domínio, o cookie de sessão e a checagem de `Origin` (CSRF) funcionam como em dev, sem CORS.

## Decisões

| Tema | Decisão | Motivo |
|---|---|---|
| Front | Vercel Hobby | gratuito para uso pessoal e não comercial; HTTPS e domínio próprio inclusos; repassa rotas para fora (*rewrites*) |
| API | Render, web service gratuito, via Docker | único serviço gratuito do Render que roda processo contínuo; o Docker fixa a versão do Python e as dependências |
| Worker | **não existe em produção**; cliques em modo `inline` | o Render não tem worker gratuito. A função do worker roda dentro da API, depois da resposta do redirect |
| Mongo | Atlas M0 | 512 MB, MongoDB 8. Não tem backup automático e pausa após 30 dias sem conexões |
| Redis | Render Key Value gratuito | só em memória: um reinício zera o rate limit e o sal do dia, o que é aceitável |
| API dormindo | ping de `/health` a cada 10 minutos (GitHub Actions) | o Render dorme após 15 minutos sem acesso e leva ~1 minuto para acordar, o que é ruim para um link curto. Uma API acordada o mês todo usa ~744 das 750 horas gratuitas |
| GeoLite | baixada quando a API sobe; reinício semanal | sem disco persistente no plano gratuito; o reinício semanal cumpre o prazo de 30 dias da licença |
| Contato | `ianasampaiodev@gmail.com` | já é público nos commits; e-mail com domínio próprio fica para depois |
| Repositório | público | sem segredos no histórico (verificado); GitHub Actions ilimitado em repositório público |

## Rotas na Vercel

A Vercel serve primeiro os arquivos que existem no build (`index.html`, `/assets/*`, `/favicon.svg`) e só depois aplica as regras. `frontend/vercel.json`:

| Origem | Destino | Por quê |
|---|---|---|
| `/api/:path*` | `https://<api>.onrender.com/api/:path*` | API |
| `/app` e `/app/:path*` | `/index.html` | rotas do React Router |
| `/` | `/index.html` | Home (já é o padrão) |
| `/:code` | `https://<api>.onrender.com/:code` | link curto: a API responde o `302`, e a Vercel o repassa |

- **Arquivos do build**: `/assets/*` com cache longo (`immutable`), porque os nomes têm hash; `index.html` sem cache.
- **Endereço da API no `vercel.json`**: o arquivo não lê variáveis de ambiente nos destinos, então o endereço `onrender.com` fica escrito nele. Não é segredo, porque fica visível de qualquer jeito.
- **`assets` reservado**: entra em `RESERVED_CODES`, para nenhum link curto ter o mesmo nome da pasta do build.

## Mudanças no código

### Backend

1. **`CLICKS_MODE`** (`queue` ou `inline`; padrão `queue`):
   - `queue`: como hoje (RQ e worker). Continua valendo em dev.
   - `inline`: o redirect agenda `process_click(event)` direto no `BackgroundTasks`, sem Redis no meio. A função é a mesma do worker, e o contexto do worker (Mongo síncrono, Redis, GeoLite) é criado uma vez por processo.
2. **`scripts/download_geolite.py`**: com `MAXMIND_ACCOUNT_ID` e `MAXMIND_LICENSE_KEY` definidas, baixa a GeoLite2 City pelo endereço de download direto da MaxMind (autenticação básica) e extrai o `.mmdb` para `GEOIP_DB_PATH`. Sem as variáveis, ou se o download falhar, só avisa no log: a API sobe sem geo, em vez de não subir.
3. **`backend/Dockerfile`**: Python 3.11 slim e `uv sync --frozen --no-dev`. O comando de início baixa a GeoLite e sobe o Uvicorn em `0.0.0.0:$PORT` com `--proxy-headers --forwarded-allow-ips='*'`, para o IP do visitante chegar ao rate limit e à geolocalização, já que a requisição passa pela Vercel e pelo proxy do Render.
4. **`assets` em `RESERVED_CODES`**.
5. **`render.yaml`** (Blueprint): o web service (gratuito, Docker, raiz `backend/`, `healthCheckPath: /health`, deploy só quando `backend/` muda) e o Key Value gratuito, com as variáveis que não são segredo. Os segredos ficam com `sync: false` e são preenchidos no painel.

### Frontend

6. **`vercel.json`** com as rotas e os cabeçalhos de cache acima.
7. **Página `/app/privacidade`**, pública: privacidade, termos de uso e contato numa página só (conteúdo em [Privacidade e termos](#privacidade-e-termos)).
   - Link no rodapé das páginas iniciais.
   - Frase no cadastro: "Ao criar a conta, você concorda com os termos de uso e a política de privacidade".

### GitHub Actions (`.github/workflows/`)

8. **`ci.yml`**, a cada push e PR:
   - backend: `ruff` e `pytest`, com `mongo:8.0` e `redis:7` como serviços do job;
   - frontend: `npm ci`, lint, testes e build.
9. **`keepalive.yml`**: agendado a cada 10 minutos, faz `curl` no `/health` da API. O endereço fica no secret `API_HEALTH_URL` e aponta direto para o `onrender.com`, sem passar pela Vercel. O `/health` faz `ping` no Mongo, o que também evita a pausa do Atlas por inatividade.
10. **`weekly-restart.yml`**: agendado uma vez por semana, chama o *deploy hook* do Render (secret `RENDER_DEPLOY_HOOK`). A API reconstrói, sobe e baixa a GeoLite mais recente. O *deploy hook* só permite disparar deploys, o que é menos poder que uma chave da API do Render.

### Deploys automáticos

- **Render**: deploy a cada push na `main` que mexa em `backend/`.
- **Vercel**: deploy a cada push na `main` que mexa em `frontend/` (diretório raiz `frontend`), com prévia em PRs.

## Configuração

### Render: variáveis do web service

| Variável | Valor | Segredo |
|---|---|---|
| `MONGO_URI` | `mongodb+srv://…` do Atlas | sim |
| `MONGO_DB` | `url_shortener` | não |
| `REDIS_URL` | URL interna do Key Value | não (rede interna) |
| `JWT_SECRET` | 32+ caracteres aleatórios (`secrets.token_urlsafe(32)`) | sim |
| `COOKIE_SECURE` | `true` | não |
| `BASE_URL` | `https://levo.dev.br` | não |
| `ALLOWED_ORIGINS` | `https://levo.dev.br` | não |
| `CLICKS_MODE` | `inline` | não |
| `GEOIP_DB_PATH` | `/tmp/geoip/GeoLite2-City.mmdb` | não |
| `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY` | da conta MaxMind | sim |

### GitHub: secrets do repositório

`API_HEALTH_URL` e `RENDER_DEPLOY_HOOK`.

### MongoDB Atlas

1. Cluster M0 numa região próxima da do Render. Sugestão: AWS `us-east-1` no Atlas e Virginia no Render.
2. Usuário só com `readWrite` no banco `url_shortener`, e senha longa e aleatória.
3. Acesso de rede `0.0.0.0/0`: o Render gratuito não tem IP de saída fixo, então a proteção é a senha (veja os riscos).

### DNS no Registro.br

- **`levo.dev.br`**: registro `A` com o valor que a Vercel indicar ao adicionar o domínio. Um domínio raiz não aceita `CNAME`.
- **`www.levo.dev.br`**: `CNAME` para o endereço que a Vercel indicar, com redirecionamento para o domínio sem `www`.
- O HTTPS é emitido pela Vercel automaticamente.

### Repositório público

- Ativar *secret scanning* com *push protection*, que barra um push contendo segredo.
- Ativar o Dependabot (alertas e atualizações de segurança).
- Escolher uma licença. Sugestão: MIT, comum em portfólio. Sem licença, o código fica visível, mas sem permissão de reuso.
- Proteger a `main`: o CI precisa passar antes de entrar.

## Privacidade e termos

Uma página, `/app/privacidade`, em linguagem simples:

**Privacidade**
- **Dados da conta**: e-mail e senha, guardada só como hash (argon2).
- **Dados dos links**: URL de destino, datas e validade.
- **Dados dos cliques**: país e estado (a partir do IP, que **não** é guardado), navegador, sistema, tipo de dispositivo, domínio de origem, idioma e um identificador anônimo diário, que não permite seguir alguém entre dias ou entre links.
- **Finalidade**: funcionar o encurtador e mostrar o relatório ao dono do link.
- **Retenção**:
  - links até expirarem ou serem excluídos;
  - cliques por 13 meses;
  - conta até ser excluída.
- **Exclusão**: a conta, os links e os cliques podem ser excluídos a qualquer momento em "Minha conta".
- **Armazenamento e cookies**: só o cookie de sessão e a preferência de tema (no navegador). Nada de publicidade ou rastreamento de terceiros.
- **Provedores**: Vercel (site), Render (API e Redis), MongoDB Atlas (banco). A geolocalização usa a base GeoLite da MaxMind localmente, sem enviar o IP a terceiros.
- **Responsável e contato**: Iana Sampaio, `ianasampaiodev@gmail.com`.

**Termos de uso**
- **Proibido**: encurtar links para phishing, malware, spam, conteúdo ilegal, ou que enganem sobre o destino.
- **Remoção**: links abusivos podem ser removidos, e contas desativadas, sem aviso prévio. A remoção é feita à mão no banco, porque não há painel de moderação.
- **Sem garantias**: serviço gratuito, oferecido como está; pode mudar ou sair do ar.
- **Denúncias**: `ianasampaiodev@gmail.com`, com o link curto.

## Backups

O Atlas M0 não tem backup automático, e **o backup não pode ir para os artefatos do GitHub Actions**: em repositório público, qualquer pessoa consegue baixá-los, e o backup tem e-mails e hashes de senha.

- Backup manual de vez em quando, rodando `mongodump --uri "$MONGO_URI"` na sua máquina, guardado fora do repositório.
- O passo a passo de deploy (`docs/deploy.md`) documenta o comando e a restauração (`mongorestore`).

## Verificação depois do deploy

1. `https://levo.dev.br` abre a Home com HTTPS; `/app/login` abre direto pela URL.
2. Cadastro e login funcionam. No navegador, o cookie `access_token` aparece com `Secure`, `HttpOnly` e `SameSite=Lax`.
3. Criar um link devolve `shortUrl` com `https://levo.dev.br/…`, e abri-lo redireciona com `302`.
4. **Séries temporais no Atlas M0**: a API subiu, e a collection `clicks` existe como série temporal (`db.getCollectionInfos({name: "clicks"})`). A documentação do Atlas não confirma nem nega o suporte no plano gratuito. Se não houver suporte, a API não sobe, e a alternativa é criar `clicks` como collection comum com TTL em `timestamp`.
5. **IP e geolocalização**: um clique de verdade, pelo celular fora do Wi-Fi, aparece no relatório com país e estado. Isso confirma que o IP do visitante, e não o da Vercel, chega à API através dos dois proxies.
6. Os logs do Render mostram a GeoLite baixada no início.
7. Rate limit: o 51º link na mesma hora dá `429`.
8. O `keepalive.yml` aparece rodando no GitHub, e a API não dorme (o primeiro acesso depois de 30 minutos parado é rápido).
9. `POST /api/links` com `Origin` de outro site dá `403`.

## Riscos aceitos

Somam-se aos da 2.1 e da 2.2; o README remete aos planos.

- **Ping para manter a API acordada**: os termos do Render não proíbem, mas é uma zona cinzenta. Se o ping falhar, o primeiro acesso depois de 15 minutos parados leva ~1 minuto.
- **Workflows agendados desligados**: o GitHub desliga workflows agendados de repositórios públicos depois de 60 dias sem atividade. Sem commits nesse período, o ping e o reinício semanal param, e o GitHub avisa por e-mail antes. Basta reativar no painel ou fazer um commit.
- **IP forjado**: quem chamar a API direto pelo endereço `onrender.com` consegue forjar o IP de origem. Isso enfraquece o rate limit e permite falsificar o país nas métricas.
- **Atlas aberto a qualquer IP**: a proteção é só a senha do usuário do banco, que deve ser longa e aleatória.
- **Redis em memória**: um reinício zera o rate limit e o sal do dia. Visitantes daquele dia podem contar duas vezes.
- **Cliques no meio do processamento**: se a API reiniciar naquele instante, eles se perdem (sem fila em produção).
- **Sem backup automático**: só o manual.
- **Limites dos planos gratuitos**: estourar horas, banda ou armazenamento (512 MB no Atlas) suspende o serviço até o mês seguinte, em vez de cobrar. Nenhum método de pagamento é cadastrado.
- **Vercel Hobby é para uso não comercial**: se o projeto virar produto, precisa mudar de plano.

## Estrutura

```
.github/workflows/
  ci.yml
  keepalive.yml
  weekly-restart.yml
backend/
  Dockerfile
  .dockerignore
  scripts/download_geolite.py
  app/config.py          # + CLICKS_MODE, MAXMIND_*
  app/routes/redirect.py # + modo inline
  app/codes.py           # + "assets" reservado
frontend/
  vercel.json
  src/pages/PrivacyPage.tsx
render.yaml
docs/deploy.md           # passo a passo do deploy e backup manual
README.md                # + link do site, quando estiver no ar
```

## Passos de implementação

1. Backend: `CLICKS_MODE`, `assets` reservado, `download_geolite.py`, `Dockerfile` e testes do modo inline e do download (sem rede, com o download simulado).
2. Frontend: `vercel.json`, página de privacidade e termos, links no rodapé e no cadastro.
3. GitHub Actions: `ci.yml` primeiro (precisa passar), depois `keepalive.yml` e `weekly-restart.yml`.
4. `render.yaml` e `docs/deploy.md` (passo a passo, backup manual). No README, só o link do site quando estiver no ar, para ele continuar enxuto.
5. Contas e painéis, passo seu: Atlas, Render, Vercel, MaxMind (já existe), DNS no Registro.br e secrets no GitHub.
6. Verificação depois do deploy, com a lista acima.
