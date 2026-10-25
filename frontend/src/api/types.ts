import type { components } from './schema'

// Nomes curtos para os tipos gerados do OpenAPI (schema.d.ts, via npm run gen:api).
type Schemas = components['schemas']

export type User = Schemas['UserOut']
export type Link = Schemas['LinkOut']
export type LinkPage = Schemas['LinkPage']
export type ExpiresIn = Schemas['ExpiresIn']
export type Stats = Schemas['StatsOut']
export type RankEntry = Schemas['RankEntry']
export type BotEntry = Schemas['BotEntry']
export type DailyStats = Schemas['DailyStats']
