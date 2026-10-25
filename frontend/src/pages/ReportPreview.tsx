import { CopyIcon } from '../components/icons'
import { formatNumber } from '../format'
import Ranking from '../stats/Ranking'
import styles from './ReportPreview.module.css'

// Dados de exemplo, coerentes entre si: as barras e os rankings somam o mesmo total.
const DAILY = [
  19, 27, 30, 27, 28, 25, 22, 30, 38, 40, 36, 38, 36, 32, 41, 49, 50, 46, 48, 46, 44, 52, 59, 61,
  56, 58, 57, 55, 63, 71,
]
const TOTAL = 1284
const Y_MAX = 75
const Y_TICKS = [75, 50, 25, 0]
const X_LABELS = ['26/09', '03/10', '10/10', '17/10', '25/10']

const COUNTRIES = [
  { key: 'BR', label: 'Brasil', value: 1142 },
  { key: 'PT', label: 'Portugal', value: 86 },
  { key: 'US', label: 'Estados Unidos', value: 39 },
  { key: 'other', label: 'Outros', value: 17 },
]
const REFERERS = [
  { key: 'instagram.com', label: 'instagram.com', value: 612 },
  { key: null, label: 'Direto ou sem origem', value: 431 },
  { key: 'l.facebook.com', label: 'l.facebook.com', value: 168 },
  { key: 'other', label: 'Outros', value: 73 },
]

/**
 * Miniatura do relatório de cliques, para a Home mostrar o produto. Usa as mesmas peças
 * e estilos da tela real, mas com o gráfico em CSS: o Recharts deixaria a Home ~370 kB
 * mais pesada. É ilustrativa, então fica fora da árvore de acessibilidade.
 */
export default function ReportPreview() {
  return (
    <div className={styles.frame} aria-hidden="true">
      <div className={styles.header}>
        <div>
          <div className={styles.link}>
            levo.dev.br/aB3xK9q
            <span className={styles.copy}>
              <CopyIcon />
            </span>
          </div>
          <div className={styles.meta}>
            Destino: <span className={styles.accent}>loja.exemplo.com/promocao</span> · expira em 7
            dias
          </div>
        </div>
        <div className={styles.presets}>
          <span>7 dias</span>
          <span className={styles.presetActive}>30 dias</span>
          <span>90 dias</span>
        </div>
      </div>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Cliques</div>
          <div className={styles.tileValue}>{formatNumber(TOTAL)}</div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Visitantes únicos</div>
          <div className={styles.tileValue}>903</div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Acessos de robôs e prévias</div>
          <div className={styles.tileValue}>41</div>
        </div>
      </div>

      <div className={styles.chartCard}>
        <div className={styles.chartTitle}>Cliques por dia</div>
        <div className={styles.chart}>
          <div className={styles.yAxis}>
            {Y_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <div className={styles.plot}>
            {Y_TICKS.map((tick) => (
              <span
                key={tick}
                className={styles.gridLine}
                style={{ bottom: `${(tick / Y_MAX) * 100}%` }}
              />
            ))}
            <div className={styles.bars}>
              {DAILY.map((value, index) => (
                <span key={index} style={{ height: `${(value / Y_MAX) * 100}%` }} />
              ))}
            </div>
          </div>
          <div className={styles.xAxis}>
            {X_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.rankings}>
        <Ranking title="Países" entries={COUNTRIES} />
        <Ranking title="Origem" entries={REFERERS} />
      </div>
    </div>
  )
}
