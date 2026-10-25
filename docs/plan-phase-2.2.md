# Fase 2.2: métricas de cliques

Escopo do back-end. Depende da [fase 2.1](plan-phase-2.1.md): o relatório só existe porque todo link tem dono. O front desta fase é planejado à parte, em `frontend/`.

## Escopo

- Registrar cada acesso a `GET /{code}` sem deixar o redirect mais lento: o redirect publica um evento numa fila (Redis + RQ), e um worker o processa.
- O worker extrai país, estado, navegador, sistema, dispositivo, referer e idioma, detecta bots e calcula um identificador anônimo do visitante.
- Relatório por link, visível só para o dono: `GET /api/links/{code}/stats`.
- Contador de cliques no próprio link, para a listagem de "meus links".

Fora do escopo: painel somando todos os links, exportação, relatório público, métricas em tempo real.

## Do relatório para os campos

O ponto de partida são as perguntas que o relatório responde. Cada pergunta exige um campo:

| Pergunta | Campo | Origem |
|---|---|---|
| Quantos cliques por dia? | `timestamp` | hora do redirect |
| De quais países e estados? | `geo.country`, `geo.region` | IP → base GeoLite2 City |
| Quais navegadores, sistemas e dispositivos? | `browser`, `os.name`, `device` | User-Agent |
| De onde vieram? | `referer` | cabeçalho `Referer`, só o domínio |
| Em que idioma? | `language` | primeira opção do `Accept-Language` |
| Quantas pessoas diferentes? | `visitorHash` | hash do IP e do User-Agent com um sal diário |
| É gente ou robô? | `isBot`, `botName` | User-Agent |

## Modelo de dados

### Collection `clicks` (nova, de séries temporais)

```js
{
  _id:         ObjectId("..."),
  timestamp:   ISODate("2026-10-19T14:32:10Z"),
  meta:        { linkId: "aB3xK9q", ownerId: ObjectId("...") },
  visitorHash: "e3b0c442...",
  geo:         { country: "BR", region: "TO" },
  browser:     { name: "Chrome", version: "130" },
  os:          { name: "Android" },
  device:      "mobile",
  isBot:       false,
  botName:     "WhatsApp",            // só quando isBot = true
  referer:     "instagram.com",
  language:    "pt-BR"
}
```

- **Collection de séries temporais**: `timeField: "timestamp"`, `metaField: "meta"`, `granularity: "hours"`. O Mongo agrupa os cliques do mesmo link em blocos comprimidos, e as consultas por link e período ficam baratas.
- **Por que `hours`**: a granularidade deve acompanhar o intervalo típico entre cliques **do mesmo link**, que é de horas, não de minutos. Com `hours`, um bloco cobre até 30 dias e junta cliques de várias semanas; com `minutes`, cobriria até 1 dia e um link comum geraria blocos quase vazios, que comprimem mal. Um link viral não é prejudicado, porque o bloco também fecha ao atingir 1000 cliques.
- **Retenção**: `expireAfterSeconds` de 395 dias (13 meses, o que permite comparar um mês com o mesmo mês do ano anterior), configurável em `CLICKS_RETENTION_DAYS`.
- **Índices**: `{ "meta.linkId": 1, timestamp: -1 }` para o relatório e `{ "meta.ownerId": 1, timestamp: -1 }` para a exclusão de conta.
- **Por que `meta` agrupa `linkId` e `ownerId`**: a collection de séries temporais aceita um único campo de metadados. O `ownerId` é copiado do link para que a exclusão de conta não precise passar pela collection `urls`.
- **Campos ausentes são omitidos**: país desconhecido, referer vazio e sem `botName` em clique humano.
- **O que não é gravado, e por quê**:
  - **IP**: só entra no cálculo do hash e da geolocalização.
  - **Cidade**: a localização por IP costuma errar o município, e cidade pequena somada a navegador e horário ajuda a identificar alguém.
  - **Versão do sistema**: o Chrome reduziu o User-Agent. Todo Android aparece como "10", todo Windows como "NT 10.0" e todo macOS como "10_15_7". A informação real só viria por Client Hints, que o navegador só envia a partir da segunda requisição, e um redirect tem uma só.
  - **Versão completa do navegador**: só a versão *major*, porque as menores também foram zeradas.
- **Validação**: feita no worker, com um modelo Pydantic, antes de gravar.

### Collection `urls` (alterada)

- Novo campo `clickCount` (int, opcional no validator). O worker o incrementa com `$inc` para cada clique **humano**.
- Entra na resposta de `GET /api/links` e no `LinkOut`.

## Captura no redirect

1. O `GET /{code}` encontra o link válido e monta o evento cru:
   ```python
   {"code", "ownerId", "timestamp", "ip", "userAgent", "referer", "acceptLanguage"}
   ```
2. Responde `302`. A publicação do evento é agendada como `BackgroundTasks` do FastAPI, que roda **depois** de a resposta ser enviada, então o redirect não espera pela fila.
3. A tarefa em segundo plano chama `queue.enqueue_call("app.worker.process_click", ...)`, com a descrição `click on {code}`. A descrição padrão do RQ repetiria os argumentos, IP incluído, nos logs e no registro de jobs que falharam.

### Prefetch e prerender: recusados

O navegador às vezes carrega um link **antes** do clique, para abrir mais rápido: as *speculation rules* do Chrome (pedidas pela página onde o link está) ou a previsão do próprio navegador. Ele avisa com `Sec-Purpose: prefetch` (ou `prefetch;prerender`; `Purpose` é o nome antigo do cabeçalho).

- **O problema**: se a pessoa clica depois, o navegador reaproveita a cópia pré-carregada (o Chrome a guarda por 5 minutos) e o clique **não chega ao servidor**. Contar a pré-carga como clique infla os números com quem nunca clicou; não contar perde os cliques reais.
- **A solução**: o redirect responde `503` com `Cache-Control: no-store` a qualquer requisição especulativa, sem consultar o banco nem publicar na fila. Um status fora da faixa 2xx é o meio que a MDN e a documentação do Chrome indicam para o servidor recusar carregamento especulativo: nada é guardado, e se a pessoa clicar, o clique chega como uma requisição normal e é contado.
- **O custo**: a pessoa perde a aceleração da pré-carga, que num redirect é pequena, porque o lento é a página de destino.

Detalhes:

- **O RQ é síncrono.** O `BackgroundTasks` roda funções síncronas numa thread, então o `enqueue` não bloqueia o event loop.
- **Dois clientes Redis**: o RQ exige o cliente síncrono do redis-py (`redis.Redis`), separado do assíncrono usado pelo rate limit.
- **O redirect não depende do Redis.** O cliente do RQ usa `socket_timeout` curto (50 ms), e qualquer erro no `enqueue` vira log. O redirect já foi respondido de qualquer forma.
- **O IP fica pouco tempo no Redis.** O evento cru contém IP, por isso:
  - `result_ttl=0`, para não guardar o resultado;
  - `failure_ttl` de 6 horas, para não deixar IP indefinidamente no registro de jobs que falharam;
  - `ttl` de 1 hora, para que um evento não processado nesse prazo seja descartado.
- **Fila**: `clicks`.

## Worker

**Como roda**: `rq worker --worker-class rq.worker.SimpleWorker --url $REDIS_URL clicks`.

- O `SimpleWorker` executa os jobs no próprio processo. O worker padrão cria um processo novo para cada job, o que custa mais do que gravar um clique.
- Com isso, a base GeoLite2, o cliente Mongo (síncrono, `MongoClient`) e o cliente Redis são carregados uma vez só.

**O que `process_click(event)` faz**:

1. **Bots**:
   - **Pré-visualizações**, por lista explícita de User-Agents conferida em ordem, com o nome gravado em `botName`: `WhatsApp`, `Slackbot-LinkExpanding`, `facebookexternalhit`, `TelegramBot`, `Twitterbot`, `Discordbot`, `LinkedInBot`. O Telegram vem antes do Twitter porque o User-Agent dele é `TelegramBot (like TwitterBot)`.
   - **Demais crawlers**, pelo `crawlerdetect` (que inclui `curl` e afins), com `botName: "crawler"`. User-Agent vazio também conta como crawler, porque navegador real sempre envia um.
2. **User-Agent**: a biblioteca `user-agents` extrai navegador, versão *major*, sistema e dispositivo (`mobile`, `tablet`, `desktop` ou `other`). A palavra "Mobile" sai do nome do navegador ("Chrome Mobile" vira "Chrome", "Mobile Safari" vira "Safari"), porque o dispositivo já é um campo próprio e o ranking não deve separar o mesmo navegador em dois.
3. **Geo**: `geoip2` com a base GeoLite2 City em `GEOIP_DB_PATH`, gravando o país (ISO) e o estado (código da subdivisão). Se a base não estiver configurada ou o IP não for encontrado, o `geo` é omitido e o worker continua. Em dev isso é o normal: os cliques chegam de `127.0.0.1` ou do IP interno do Docker, que não estão na base.
4. **`visitorHash`**: `sha256(sal_do_dia + code + ip + userAgent)`.
   - O sal do dia fica no Redis em `salt:{AAAA-MM-DD}`, onde a data é a do evento em UTC. É criado com `SET NX EX 172800` e descartado depois de 48 horas.
   - O hash não serve para seguir a mesma pessoa entre dias nem entre links.
5. **Referer**: só o hostname, em minúsculas e sem `www.`. Sem referer, o campo é omitido.
6. **Idioma**: a primeira opção do `Accept-Language`, por exemplo `pt-BR`.
7. **Gravação**: insere em `clicks` e, se `isBot` for falso, faz `$inc` de `clickCount` em `urls`.

**Entrega**: a fila entrega cada evento pelo menos uma vez. Se o worker cair entre a gravação e a confirmação, o clique é contado duas vezes. Para métricas isso é aceitável.

## Relatório

### `GET /api/links/{code}/stats` (requer login)

```
GET /api/links/aB3xK9q/stats?from=2026-10-01&to=2026-10-31&tz=America/Sao_Paulo&includeBots=false
```

| Parâmetro | Padrão | Regra |
|---|---|---|
| `from`, `to` | últimos 30 dias | datas `AAAA-MM-DD` no fuso `tz`, com o dia final incluído; no máximo 400 dias |
| `tz` | `UTC` | nome IANA, validado com `zoneinfo`; o front envia o fuso do navegador |
| `includeBots` | `false` | se `true`, os bots entram nos totais e nos rankings |

- `404` se o link não existe ou é de outra pessoa, como no `DELETE`.

Resposta `200`:

```json
{
  "code": "aB3xK9q",
  "from": "2026-10-01",
  "to": "2026-10-31",
  "tz": "America/Sao_Paulo",
  "totals": { "clicks": 1284, "uniqueVisitors": 903, "botHits": 41 },
  "daily": [
    { "date": "2026-10-01", "clicks": 37, "uniqueVisitors": 29 }
  ],
  "countries": [{ "key": "BR", "clicks": 1100 }],
  "regions":   [{ "key": "BR-TO", "clicks": 420 }],
  "referers":  [{ "key": "instagram.com", "clicks": 610 }, { "key": null, "clicks": 480 }],
  "browsers":  [{ "key": "Chrome", "clicks": 800 }],
  "os":        [{ "key": "Android", "clicks": 700 }],
  "devices":   [{ "key": "mobile", "clicks": 950 }],
  "bots":      [{ "key": "WhatsApp", "hits": 30 }, { "key": "Slackbot-LinkExpanding", "hits": 11 }]
}
```

- **Série diária com todos os dias**: a API preenche os dias sem clique com zero, para o gráfico não pular datas.
- **Rankings**: as 10 primeiras opções, e o resto somado numa entrada `{ "key": "other" }`. A chave `null` significa desconhecido; no referer, é o acesso direto.
- **`bots`** sempre lista as pré-visualizações e os crawlers, qualquer que seja o `includeBots`. É a métrica de "compartilhamentos".
- **`uniqueVisitors` diário**: hashes distintos no dia. No total, é a **soma dos únicos diários**, porque o sal muda a cada dia e não há como identificar a mesma pessoa em dias diferentes. Na resposta, o campo é documentado como "visitantes únicos por dia, somados".
- **Diferença de fuso**: o sal vira à meia-noite UTC, e o dia do relatório segue o `tz`. Quem acessar dos dois lados da meia-noite UTC dentro do mesmo dia local conta duas vezes. É aceito.

**Implementação**: uma única agregação.

1. `$match` por `meta.linkId` e período, e por `isBot: false` quando `includeBots` é falso.
2. `$facet` com:
   - a série diária, com `$dateTrunc` em dia no fuso `tz` e os únicos agrupados por dia e `visitorHash`;
   - um ranking para cada dimensão;
   - os totais.

Os bots vêm de um `$facet` próprio, que não leva o filtro de `isBot`.

## Exclusões e retenção

- **Exclusão de link** (`DELETE /api/links/{code}`): apaga também os cliques do link (`deleteMany({"meta.linkId": code})`). O Mongo 8 aceita exclusão com filtro em collections de séries temporais.
- **Exclusão de conta** (`DELETE /api/me`): apaga os cliques por `meta.ownerId`.
- **Link que expira pelo TTL**: o TTL não apaga em cascata, então os cliques ficam até a retenção de 13 meses. Não contêm IP, e o hash não identifica ninguém. O relatório deixa de estar disponível quando o link expira, porque não há mais link para conferir o dono.

## Configuração (env)

| Variável                | Padrão   | Uso |
|-------------------------|----------|-----|
| `GEOIP_DB_PATH`         | vazio    | caminho do `GeoLite2-City.mmdb`; vazio = sem geo |
| `CLICKS_RETENTION_DAYS` | `395`    | `expireAfterSeconds` da collection `clicks` |
| `CLICKS_QUEUE`          | `clicks` | nome da fila do RQ |

**Base GeoLite2**:

- **Download**: exige conta gratuita na MaxMind e uma chave de licença.
- **Repositório**: a base não vai para o repositório (`*.mmdb` no `.gitignore`).
- **Atualização**: a licença exige apagar a base em até 30 dias depois de sair uma versão nova. A MaxMind não publica um calendário fixo, então o guia [docs/geolite.md](geolite.md) explica como atualizar semanalmente com a ferramenta oficial `geoipupdate` (também roda em Docker, `maxmindinc/geoipupdate`), o que cumpre o prazo com folga. O limite é de 30 downloads por dia.
- **Licença**: o GeoLite é gratuito com conta e permite uso em aplicações para usuários externos, desde que com atribuição. Proíbe usar os dados para identificar uma pessoa, um domicílio ou um endereço, o que não fazemos (só país e estado, sem IP).
- **Reinício do worker**: o worker abre a base uma vez, quando sobe. O `geoipupdate` grava um arquivo novo e o troca de lugar com o antigo, e o worker segue lendo a versão antiga até ser reiniciado. Por isso, cada atualização precisa vir seguida de um reinício do worker.
- **Divulgação**: a licença proíbe repassar a base a terceiros sem autorização da MaxMind. Ela não vai para o repositório, nem para uma imagem Docker pública; num servidor, é baixada lá mesmo.
- **Atribuição**: a licença exige o crédito "This product includes GeoLite Data created by MaxMind, available from https://www.maxmind.com". Vai no README e na tela de relatório do front.

## Riscos aceitos

Somam-se aos da 2.1; o README remete aos planos.

- **Com o Redis fora do ar**, os cliques do período se perdem, mas os redirects continuam funcionando.
- **Um clique pode ser contado duas vezes** se o worker cair no meio do processamento.
- **Visitantes únicos são aproximados**: só valem por dia, e um mesmo visitante pode contar duas vezes perto da meia-noite UTC.
- **A detecção de bots se baseia no User-Agent**, que um bot pode falsificar.
- **A geolocalização por IP erra** com VPN, rede móvel e proxies corporativos.

## Estrutura

```
backend/
  app/
    click_queue.py    # cliente Redis síncrono, Queue do RQ, build_event, enqueue_click
    worker.py         # process_click e os clientes do worker
    analytics/
      bots.py         # lista de pré-visualizações, crawlerdetect
      useragent.py    # navegador, sistema, dispositivo
      geo.py          # leitor GeoLite2
      visitor.py      # sal diário e visitorHash
      referer.py      # referer e idioma
    stats.py          # pipeline de agregação
    routes/
      redirect.py     # + BackgroundTasks
      links.py        # + /api/links/{code}/stats
  tests/
```

Novas dependências: `rq`, `user-agents`, `crawlerdetect`, `geoip2`.

## Testes

- **Unidade, sem banco**:
  - pré-visualizações (WhatsApp, Slack…) e crawler genérico detectados com o `botName` certo;
  - User-Agents reais de Chrome Android, Safari iOS e Firefox desktop com navegador, sistema e dispositivo corretos;
  - referer reduzido ao domínio (`https://www.instagram.com/p/x?y=1` → `instagram.com`), e vazio omitido;
  - `Accept-Language: pt-BR,pt;q=0.9,en;q=0.8` → `pt-BR`;
  - mesmo IP e User-Agent no mesmo dia dão o mesmo hash, e em dias ou links diferentes dão hashes diferentes.
- **Geo**: com um leitor mockado, `geo` correto; sem a base, `geo` omitido e o clique gravado.
- **Worker**:
  - o clique gravado **não tem IP**;
  - o `clickCount` sobe para humano e não sobe para bot.
- **Integração**: com a `Queue(is_async=False)`, o job roda na hora, então um `GET /{code}` gera um clique gravado.
- **Prefetch**: `Sec-Purpose: prefetch`, `prefetch;prerender` e `Purpose: prefetch` → 503 com `no-store`, sem `Location` e sem clique gravado; a requisição normal seguinte é contada.
- **Redis inacessível**: o redirect continua respondendo 302.
- **Relatório**:
  - com cliques inseridos direto no banco, a série diária vem com zeros nos dias vazios;
  - um clique às 01:00 UTC aparece no dia anterior com `tz=America/Sao_Paulo`;
  - o `includeBots` muda os totais, e `bots` não muda;
  - os rankings agrupam o excedente em `other`;
  - o link de outra pessoa → 404;
  - sem login → 401;
  - período acima de 400 dias ou `tz` inválido → 422.
- **Exclusões**: apagar o link apaga os cliques dele; apagar a conta apaga os cliques de todos os links dela.
- **Schema**: `clicks` é uma collection de séries temporais com granularidade `hours`, com a retenção e os índices esperados.

## Passos de implementação

1. ✅ Collection `clicks`, `clickCount` no validator de `urls`, novas envs.
2. ✅ Módulos de `analytics/` com os testes de unidade.
3. ✅ Worker (`process_click`) e fila (`enqueue_click`); captura no redirect com `BackgroundTasks`.
4. ✅ Endpoint de estatísticas e a agregação.
5. ✅ Exclusão de cliques ao apagar link e conta.
6. ✅ README: worker, GeoLite2 (download, `geoipupdate` e atribuição), novas envs, riscos aceitos.
