export const UNKNOWN_LABEL = 'Desconhecido'
export const OTHER_LABEL = 'Outros'
export const DIRECT_LABEL = 'Direto ou sem origem'

const regionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' })

// O navegador traduz países, mas não estados. Os brasileiros cobrem o caso principal;
// os de outros países ficam com o código.
const BR_STATES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}

const DEVICES: Record<string, string> = {
  mobile: 'Celular',
  tablet: 'Tablet',
  desktop: 'Computador',
  other: 'Outro',
}

const BOTS: Record<string, string> = {
  WhatsApp: 'WhatsApp',
  'Slackbot-LinkExpanding': 'Slack',
  facebookexternalhit: 'Facebook, Instagram ou iMessage',
  TelegramBot: 'Telegram',
  Twitterbot: 'X (Twitter)',
  Discordbot: 'Discord',
  LinkedInBot: 'LinkedIn',
  crawler: 'Outros robôs',
}

export type Dimension = 'countries' | 'regions' | 'referers' | 'browsers' | 'os' | 'devices'

function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

function regionName(key: string): string {
  const [country, state] = key.split('-')
  return country === 'BR' && state in BR_STATES ? BR_STATES[state] : key
}

/** Texto de uma entrada de ranking. null = desconhecido; "other" = além do top 10. */
export function rankLabel(dimension: Dimension, key: string | null): string {
  if (key === null) return dimension === 'referers' ? DIRECT_LABEL : UNKNOWN_LABEL
  if (key === 'other') return OTHER_LABEL
  switch (dimension) {
    case 'countries':
      return countryName(key)
    case 'regions':
      return regionName(key)
    case 'devices':
      return DEVICES[key] ?? key
    default:
      return key
  }
}

export const botLabel = (key: string) => BOTS[key] ?? key
