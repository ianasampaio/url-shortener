import { useState, type FormEvent } from 'react'
import ui from '../components/ui.module.css'
import { MAX_DAYS, PRESETS, validateCustom, type Period, type Preset } from './period'
import styles from './Stats.module.css'

type Props = {
  period: Period
  today: string
  onPreset: (preset: Preset) => void
  onCustom: (from: string, to: string) => void
}

export default function PeriodPicker({ period, today, onPreset, onCustom }: Props) {
  const [showCustom, setShowCustom] = useState(period.preset === 'custom')
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)
  const [error, setError] = useState<string | null>(null)

  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = validateCustom(from, to, today)
    setError(problem)
    if (!problem) onCustom(from, to)
  }

  return (
    <div>
      <div className={styles.presets} role="group" aria-label="Período">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={`${ui.buttonSecondary} ${styles.preset}`}
            aria-pressed={period.preset === preset.value}
            onClick={() => {
              setShowCustom(false)
              setError(null)
              onPreset(preset.value)
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={`${ui.buttonSecondary} ${styles.preset}`}
          aria-pressed={period.preset === 'custom'}
          aria-expanded={showCustom}
          aria-controls="custom-period"
          onClick={() => setShowCustom((open) => !open)}
        >
          Personalizado
        </button>
      </div>
      {showCustom && (
        <form id="custom-period" className={styles.custom} onSubmit={applyCustom} noValidate>
          <div className={ui.field}>
            <label htmlFor="from" className={ui.label}>
              De
            </label>
            <input
              id="from"
              type="date"
              className={ui.input}
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label htmlFor="to" className={ui.label}>
              Até
            </label>
            <input
              id="to"
              type="date"
              className={ui.input}
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button type="submit" className={ui.button}>
            Aplicar
          </button>
          <p className={ui.hint}>Até {MAX_DAYS} dias.</p>
          {error && (
            <p className={ui.error} role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
