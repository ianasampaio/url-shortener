import { useId } from 'react'
import { formatNumber } from '../format'
import ui from '../components/ui.module.css'
import styles from './Stats.module.css'

type Entry = { key: string | null; value: number; label: string }

type Props = {
  title: string
  entries: Entry[]
  emptyText?: string
}

/** Lista com barras proporcionais: texto puro, que leitores de tela leem sem esforço. */
export default function Ranking({ title, entries, emptyText = 'Sem dados no período.' }: Props) {
  const max = Math.max(1, ...entries.map((entry) => entry.value))
  const titleId = useId()
  return (
    <section className={ui.card} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.sectionTitle}>
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className={styles.muted}>{emptyText}</p>
      ) : (
        <ol className={styles.rankList}>
          {entries.map((entry) => (
            <li key={entry.key ?? '__null'} className={styles.rankItem}>
              <span className={styles.rankBar} style={{ width: `${(entry.value / max) * 100}%` }} />
              <span>{entry.label}</span>
              <span className={styles.rankValue}>{formatNumber(entry.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
