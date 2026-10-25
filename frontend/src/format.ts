const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })
const compactDateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
const numberFormat = new Intl.NumberFormat('pt-BR')
const relativeFormat = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const formatDate = (iso: string) => dateFormat.format(new Date(iso))
/** "25 de out. de 2026": cabe numa coluna de tabela. */
export const formatDateCompact = (iso: string) => compactDateFormat.format(new Date(iso))
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso))
export const formatNumber = (value: number) => numberFormat.format(value)

/** "2026-10-01" -> "01/10", sem passar por Date (que aplicaria o fuso). */
export function formatDayShort(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

/** "2026-10-01" -> "01/10/2026". */
export function formatDayFull(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

export type Expiry = { text: string; soon: boolean }

/** "nunca expira", "expira em 3 dias", "expira amanhã", "expira em 5 horas"… */
export function describeExpiry(expiresAt: string | null, now: Date = new Date()): Expiry {
  if (expiresAt === null) return { text: 'nunca expira', soon: false }
  const diff = new Date(expiresAt).getTime() - now.getTime()
  if (diff <= 0) return { text: 'expirado', soon: true }
  if (diff < HOUR_MS) {
    return { text: `expira ${relativeFormat.format(Math.ceil(diff / 60000), 'minute')}`, soon: true }
  }
  const soon = diff < DAY_MS
  const hours = Math.round(diff / HOUR_MS)
  // Um link de 1 dia recém-criado está a 23,99 horas: "expira amanhã" lê melhor que "em 24 horas".
  if (hours < 24) return { text: `expira ${relativeFormat.format(hours, 'hour')}`, soon }
  return { text: `expira ${relativeFormat.format(Math.round(diff / DAY_MS), 'day')}`, soon }
}

/** Mostra o link sem o "http://" na frente. */
export const stripScheme = (url: string) => url.replace(/^https?:\/\//, '')
