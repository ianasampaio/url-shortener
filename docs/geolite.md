# Geolocalização com a GeoLite2

O país e o estado dos cliques vêm da base gratuita GeoLite2 City, da MaxMind, consultada localmente por quem processa os cliques (o worker em dev, a própria API em produção). Sem a base, os cliques são gravados sem `geo`. Em dev isso é o normal de qualquer forma: os acessos chegam de `127.0.0.1`, que não está na base.

## Configurar em dev

1. Crie uma conta gratuita em https://www.maxmind.com/en/geolite2/signup e gere uma chave de licença.
2. Baixe a base com a ferramenta oficial `geoipupdate`, a partir da raiz do repositório:

   ```bash
   docker run --rm -v "$PWD/backend/geoip:/usr/share/GeoIP" \
     -e GEOIPUPDATE_ACCOUNT_ID=<id> -e GEOIPUPDATE_LICENSE_KEY=<chave> \
     -e GEOIPUPDATE_EDITION_IDS=GeoLite2-City \
     maxmindinc/geoipupdate
   ```

   A pasta `backend/geoip/` é ignorada pelo Git.
3. Aponte para a base no `backend/.env`: `GEOIP_DB_PATH=geoip/GeoLite2-City.mmdb`.
4. Reinicie o worker.

Para conferir, de dentro de `backend/`:

```bash
uv run python -c "
from app.analytics.geo import GeoLookup
print(GeoLookup('geoip/GeoLite2-City.mmdb').lookup('8.8.8.8'))"
```

## Manter atualizada

A licença exige trocar a base em até 30 dias depois de cada versão nova. Rode o comando do passo 2 uma vez por semana, o que cumpre o prazo com folga, e **reinicie o worker depois**: ele abre a base uma vez, quando sobe, e segue lendo a versão antiga até ser reiniciado.

Em produção, a API baixa a base sempre que sobe, e um reinício semanal mantém a base atualizada (veja o [plano de deploy](plan-deploy.md)).

## Obrigações da licença

- **Atribuição**: "This product includes GeoLite Data created by MaxMind, available from https://www.maxmind.com." Aparece no README e no rodapé do relatório.
- **Não repassar a base a terceiros**: ela não vai para o repositório, nem para uma imagem Docker pública, nem fica acessível por URL. Num servidor, é baixada lá mesmo.
- **Apagar as versões antigas** em até 30 dias depois de cada versão nova, inclusive cópias em backups.
- **Não usar os dados para localizar uma pessoa, um domicílio ou um endereço**: o projeto grava só país e estado, sem o IP.
