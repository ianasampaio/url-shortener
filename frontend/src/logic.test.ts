import { describe, expect, it } from 'vitest'
import { ApiError } from './api/client'
import { errorMessage } from './api/errors'
import { describeExpiry, formatDayShort } from './format'
import { botLabel, rankLabel } from './stats/labels'
import { addDays, parsePeriod, periodToSearch, todayIn, validateCustom } from './stats/period'

const TODAY = '2026-10-25'

describe('período', () => {
  it('padrão de 30 dias terminando hoje', () => {
    expect(parsePeriod(new URLSearchParams(), TODAY)).toEqual({
      preset: '30d',
      from: '2026-09-26',
      to: TODAY,
    })
  })

  it('atalho vindo da URL', () => {
    expect(parsePeriod(new URLSearchParams('period=90d'), TODAY).from).toBe('2026-07-28')
  })

  it('período personalizado inválido na URL volta ao padrão', () => {
    expect(parsePeriod(new URLSearchParams('from=2026-10-20&to=2026-10-01'), TODAY).preset).toBe('30d')
    expect(parsePeriod(new URLSearchParams('from=ontem&to=hoje'), TODAY).preset).toBe('30d')
  })

  it.each([
    ['2026-10-01', '2026-10-10', null],
    ['2026-10-10', '2026-10-01', 'A data inicial precisa ser anterior à final.'],
    ['2026-10-01', '2026-10-26', 'A data final não pode ser depois de hoje.'],
    [addDays(TODAY, -400), TODAY, 'O período pode ter no máximo 400 dias.'],
    [addDays(TODAY, -399), TODAY, null],
    ['', TODAY, 'Informe as duas datas.'],
  ])('valida %s a %s', (from, to, expected) => {
    expect(validateCustom(from, to, TODAY)).toBe(expected)
  })

  it('o padrão não polui a URL', () => {
    expect(periodToSearch({ preset: '30d', from: '', to: '' }, false).toString()).toBe('')
    expect(periodToSearch({ preset: '7d', from: '', to: '' }, true).toString()).toBe('period=7d&bots=1')
  })

  it('hoje depende do fuso', () => {
    const lateNightUtc = new Date('2026-10-26T01:00:00Z')
    expect(todayIn('America/Sao_Paulo', lateNightUtc)).toBe('2026-10-25')
    expect(todayIn('UTC', lateNightUtc)).toBe('2026-10-26')
  })
})

describe('formatação', () => {
  const now = new Date('2026-10-25T12:00:00Z')

  it.each([
    [null, 'nunca expira', false],
    ['2026-10-28T12:00:00Z', 'expira em 3 dias', false],
    ['2026-10-26T12:00:00Z', 'expira amanhã', false],
    // Link de 1 dia recém-criado: 23,6 horas arredondam para amanhã, mas ainda é "em breve".
    ['2026-10-26T11:36:00Z', 'expira amanhã', true],
    ['2026-10-25T17:00:00Z', 'expira em 5 horas', true],
    ['2026-10-25T12:20:00Z', 'expira em 20 minutos', true],
    ['2026-10-25T11:00:00Z', 'expirado', true],
  ])('expiração %s', (expiresAt, text, soon) => {
    expect(describeExpiry(expiresAt, now)).toEqual({ text, soon })
  })

  it('dia curto sem deslocamento de fuso', () => {
    expect(formatDayShort('2026-10-01')).toBe('01/10')
  })
})

describe('mensagens de erro', () => {
  it.each([
    [new ApiError(null), 'generic', 'Não foi possível falar com o servidor.'],
    [new ApiError(401), 'login', 'E-mail ou senha inválidos.'],
    [new ApiError(401), 'generic', 'Sua sessão expirou. Entre de novo.'],
    [new ApiError(409), 'signup', 'Já existe uma conta com este e-mail.'],
    [new ApiError(429, null, 61), 'generic', 'Muitas tentativas. Tente de novo em 2 minutos.'],
    [new ApiError(429), 'generic', 'Muitas tentativas. Tente de novo mais tarde.'],
    [new ApiError(503), 'createLink', 'Não foi possível gerar o link agora. Tente de novo.'],
    [new ApiError(502), 'generic', 'Não foi possível falar com o servidor.'],
    [
      new ApiError(422, [{ type: 'string_too_short', loc: ['body', 'password'], msg: 'x' }]),
      'signup',
      'A senha precisa ter entre 8 e 128 caracteres.',
    ],
  ] as const)('%o em %s', (error, context, expected) => {
    expect(errorMessage(error, context)).toBe(expected)
  })
})

describe('rótulos', () => {
  it.each([
    ['countries', 'BR', 'Brasil'],
    ['countries', 'PT', 'Portugal'],
    ['regions', 'BR-SP', 'São Paulo'],
    ['regions', 'US-CA', 'US-CA'],
    ['referers', null, 'Direto ou sem origem'],
    ['browsers', null, 'Desconhecido'],
    ['os', 'other', 'Outros'],
    ['devices', 'desktop', 'Computador'],
  ] as const)('%s %s -> %s', (dimension, key, expected) => {
    expect(rankLabel(dimension, key)).toBe(expected)
  })

  it('bots com nome amigável', () => {
    expect(botLabel('Slackbot-LinkExpanding')).toBe('Slack')
    expect(botLabel('BotNovo')).toBe('BotNovo')
  })
})
