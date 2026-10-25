import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyStats } from '../api/types'
import { formatDayFull, formatDayShort, formatNumber } from '../format'
import styles from './Stats.module.css'

type Props = { daily: DailyStats[] }

const GRADIENT_ID = 'daily-bar-gradient'

/** Barras de cliques por dia, com uma tabela equivalente para leitores de tela. */
export default function DailyChart({ daily }: Props) {
  return (
    <>
      <div aria-hidden="true" className={styles.chart}>
        <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 800, height: 280 }}>
          <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              {/* Cores por style: em atributos SVG, var() não funciona, e o tema mudaria. */}
              <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--chart-bar-top)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--chart-bar-bottom)' }} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDayShort} minTickGap={16} fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: '0.75rem',
                boxShadow: 'var(--shadow-lg)',
                color: 'var(--text)',
              }}
              labelStyle={{ color: 'var(--muted)' }}
              itemStyle={{ color: 'var(--text)' }}
              labelFormatter={(value) => formatDayFull(String(value))}
              formatter={(value, name) => [
                formatNumber(Number(value)),
                name === 'clicks' ? 'Cliques' : 'Visitantes únicos',
              ]}
            />
            {/* Sem animação: é decorativa, e redimensionar a tela a recomeçaria. */}
            <Bar
              dataKey="clicks"
              fill={`url(#${GRADIENT_ID})`}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="visually-hidden">
        <caption>Cliques por dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Cliques</th>
            <th scope="col">Visitantes únicos</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((day) => (
            <tr key={day.date}>
              <th scope="row">{formatDayFull(day.date)}</th>
              <td>{day.clicks}</td>
              <td>{day.uniqueVisitors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
