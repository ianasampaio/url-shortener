export type Preset = '7d' | '30d' | '90d'

export const PRESETS: { value: Preset; label: string; days: number }[] = [
  { value: '7d', label: '7 dias', days: 7 },
  { value: '30d', label: '30 dias', days: 30 },
  { value: '90d', label: '90 dias', days: 90 },
]

export const DEFAULT_PRESET: Preset = '30d'
export const MAX_DAYS = 400

export type Period = { preset: Preset | 'custom'; from: string; to: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
}

function toUtc(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function addDays(isoDate: string, days: number): string {
  return new Date(toUtc(isoDate) + days * 86_400_000).toISOString().slice(0, 10)
}

export function daysInclusive(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1
}

function isValidDate(value: string | null): value is string {
  return value !== null && ISO_DATE.test(value) && !Number.isNaN(toUtc(value))
}

/** null se o período personalizado é válido; senão, a mensagem do problema. */
export function validateCustom(from: string, to: string, today: string): string | null {
  if (!isValidDate(from) || !isValidDate(to)) return 'Informe as duas datas.'
  if (from > to) return 'A data inicial precisa ser anterior à final.'
  if (to > today) return 'A data final não pode ser depois de hoje.'
  if (daysInclusive(from, to) > MAX_DAYS) return `O período pode ter no máximo ${MAX_DAYS} dias.`
  return null
}

function presetPeriod(preset: Preset, today: string): Period {
  const days = PRESETS.find((p) => p.value === preset)!.days
  return { preset, from: addDays(today, -(days - 1)), to: today }
}

/** Lê o período da query string; valores inválidos voltam ao padrão (30 dias). */
export function parsePeriod(params: URLSearchParams, today: string): Period {
  const from = params.get('from')
  const to = params.get('to')
  if (isValidDate(from) && isValidDate(to) && validateCustom(from, to, today) === null) {
    return { preset: 'custom', from, to }
  }
  const preset = PRESETS.find((p) => p.value === params.get('period'))?.value ?? DEFAULT_PRESET
  return presetPeriod(preset, today)
}

export function periodFromPreset(preset: Preset, today: string): Period {
  return presetPeriod(preset, today)
}

/** Query string que representa o período e a chave de robôs. */
export function periodToSearch(period: Period, includeBots: boolean): URLSearchParams {
  const params = new URLSearchParams()
  if (period.preset === 'custom') {
    params.set('from', period.from)
    params.set('to', period.to)
  } else if (period.preset !== DEFAULT_PRESET) {
    params.set('period', period.preset)
  }
  if (includeBots) params.set('bots', '1')
  return params
}
