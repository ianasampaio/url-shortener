export type StatsParams = {
  from: string
  to: string
  tz: string
  includeBots: boolean
}

export const queryKeys = {
  me: ['me'] as const,
  links: ['links'] as const,
  linksPage: (page: number) => ['links', page] as const,
  link: (code: string) => ['link', code] as const,
  stats: (code: string) => ['stats', code] as const,
  statsFor: (code: string, params: StatsParams) => ['stats', code, params] as const,
}
