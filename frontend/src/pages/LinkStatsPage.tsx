import { useMemo } from 'react'
import { Link as RouterLink, useParams, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { errorMessage } from '../api/errors'
import { useLink, useLinkStats } from '../api/hooks'
import type { Stats } from '../api/types'
import CopyButton from '../components/CopyButton'
import PageHeading from '../components/PageHeading'
import { LoadingScreen } from '../components/RouteGuards'
import ui from '../components/ui.module.css'
import { describeExpiry, formatDate, formatNumber, stripScheme } from '../format'
import DailyChart from '../stats/DailyChart'
import { botLabel, rankLabel, type Dimension } from '../stats/labels'
import PeriodPicker from '../stats/PeriodPicker'
import {
  browserTimeZone,
  parsePeriod,
  periodFromPreset,
  periodToSearch,
  todayIn,
  type Period,
} from '../stats/period'
import Ranking from '../stats/Ranking'
import styles from '../stats/Stats.module.css'

const RANKINGS: { dimension: Dimension; title: string }[] = [
  { dimension: 'countries', title: 'Países' },
  { dimension: 'regions', title: 'Estados' },
  { dimension: 'referers', title: 'Origem' },
  { dimension: 'browsers', title: 'Navegadores' },
  { dimension: 'os', title: 'Sistemas' },
  { dimension: 'devices', title: 'Dispositivos' },
]

function NotFound() {
  return (
    <div className={ui.status}>
      <PageHeading title="Link não encontrado ou expirado" />
      <p>
        <RouterLink to="/app/links">Voltar para os seus links</RouterLink>
      </p>
    </div>
  )
}

function Report({ stats }: { stats: Stats }) {
  const { totals } = stats
  return (
    <>
      <div className={styles.tiles}>
        <div className={ui.card}>
          <p className={styles.tileLabel}>Cliques</p>
          <p className={styles.tileValue}>{formatNumber(totals.clicks)}</p>
        </div>
        <div className={ui.card}>
          <p className={styles.tileLabel}>Visitantes únicos</p>
          <p className={styles.tileValue}>{formatNumber(totals.uniqueVisitors)}</p>
          <p className={styles.tileNote}>
            Soma dos visitantes únicos de cada dia; quem volta em outro dia conta de novo.
          </p>
        </div>
        <div className={ui.card}>
          <p className={styles.tileLabel}>Acessos de robôs e prévias</p>
          <p className={styles.tileValue}>{formatNumber(totals.botHits)}</p>
        </div>
      </div>

      {totals.clicks === 0 && (
        <p className={`${ui.card} ${styles.section}`}>
          Nenhum clique neste período. Os cliques aparecem aqui alguns segundos depois de
          acontecerem.
        </p>
      )}

      <section className={`${ui.card} ${styles.section}`} aria-labelledby="daily-title">
        <h2 id="daily-title" className={styles.sectionTitle}>
          Cliques por dia
        </h2>
        <DailyChart daily={stats.daily} />
      </section>

      <div className={styles.rankings}>
        {RANKINGS.map(({ dimension, title }) => (
          <Ranking
            key={dimension}
            title={title}
            entries={stats[dimension].map((entry) => ({
              key: entry.key,
              value: entry.clicks,
              label: rankLabel(dimension, entry.key),
            }))}
          />
        ))}
        <Ranking
          title="Compartilhamentos e robôs"
          emptyText="Nenhuma prévia de link nem acesso de robô no período."
          entries={stats.bots.map((entry) => ({
            key: entry.key,
            value: entry.hits,
            label: botLabel(entry.key),
          }))}
        />
      </div>
    </>
  )
}

export default function LinkStatsPage() {
  const { code = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const timeZone = useMemo(() => browserTimeZone(), [])
  const today = todayIn(timeZone)
  const period = parsePeriod(searchParams, today)
  const includeBots = searchParams.get('bots') === '1'

  const link = useLink(code)
  const stats = useLinkStats(code, {
    from: period.from,
    to: period.to,
    tz: timeZone,
    includeBots,
  })

  function update(next: Period, bots: boolean) {
    setSearchParams(periodToSearch(next, bots), { replace: true })
  }

  const notFound =
    (link.error instanceof ApiError && link.error.status === 404) ||
    (stats.error instanceof ApiError && stats.error.status === 404)
  if (notFound) return <NotFound />
  if (link.isPending) return <LoadingScreen />
  if (link.isError) {
    return (
      <p className={ui.error} role="alert">
        {errorMessage(link.error)}
      </p>
    )
  }

  const data = link.data
  const expiry = describeExpiry(data.expiresAt)

  return (
    <>
      <RouterLink to="/app/links" className={ui.backLink}>
        ← Meus links
      </RouterLink>
      <div className={styles.header}>
        <div>
          <PageHeading title={`Relatório de ${stripScheme(data.shortUrl)}`} className={styles.title}>
            <span>{stripScheme(data.shortUrl)}</span>
            <CopyButton text={data.shortUrl} label="Copiar link curto" />
          </PageHeading>
          <p className={styles.meta}>
            Destino: <a href={data.originalUrl}>{data.originalUrl}</a>
          </p>
          <p className={styles.meta}>
            Criado em {formatDate(data.createdAt)} · {expiry.text}
          </p>
        </div>
      </div>

      <div className={styles.controls}>
        <PeriodPicker
          key={`${period.preset}-${period.from}-${period.to}`}
          period={period}
          today={today}
          onPreset={(preset) => update(periodFromPreset(preset, today), includeBots)}
          onCustom={(from, to) => update({ preset: 'custom', from, to }, includeBots)}
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={includeBots}
            onChange={(e) => update(period, e.target.checked)}
          />
          Incluir robôs nos números
        </label>
      </div>

      {stats.isPending && <LoadingScreen />}
      {stats.isError && (
        <p className={ui.error} role="alert">
          {errorMessage(stats.error)}
        </p>
      )}
      {stats.data && <Report stats={stats.data} />}

      <p className={styles.attribution}>
        This product includes GeoLite Data created by MaxMind, available from{' '}
        <a href="https://www.maxmind.com">https://www.maxmind.com</a>.
      </p>
    </>
  )
}
