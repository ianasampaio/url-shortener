import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, makeLink, makeStats, mockApi, USER } from '../test/api'
import { currentPath, renderApp } from '../test/render'

const LINK = makeLink({ code: 'aB3xK9q', expiresAt: null })

const FULL_STATS = makeStats({
  totals: { clicks: 1284, uniqueVisitors: 903, botHits: 41 },
  daily: [
    { date: '2026-10-24', clicks: 37, uniqueVisitors: 29 },
    { date: '2026-10-25', clicks: 0, uniqueVisitors: 0 },
  ],
  countries: [
    { key: 'BR', clicks: 1100 },
    { key: null, clicks: 100 },
    { key: 'other', clicks: 84 },
  ],
  regions: [{ key: 'BR-TO', clicks: 420 }, { key: 'US-CA', clicks: 3 }],
  referers: [{ key: null, clicks: 480 }, { key: 'instagram.com', clicks: 610 }],
  devices: [{ key: 'mobile', clicks: 950 }],
  bots: [{ key: 'facebookexternalhit', hits: 30 }, { key: 'crawler', hits: 11 }],
})

function setup(stats = FULL_STATS) {
  return mockApi({
    'GET /me': () => json(USER),
    'GET /links/:code': () => json(LINK),
    'GET /links/:code/stats': () => json(stats),
  })
}

describe('relatório', () => {
  beforeEach(() => {
    // Só o relógio: hoje é 25/10/2026 em São Paulo (fuso fixado no vitest.config).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-25T15:00:00Z'))
  })

  it('mostra o link, os totais, os rankings com rótulos e a atribuição', async () => {
    const api = setup()
    renderApp('/app/links/aB3xK9q')

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('localhost:8000/aB3xK9q')
    expect(screen.getByText(/nunca expira/)).toBeInTheDocument()
    expect(await screen.findByText('1.284')).toBeInTheDocument()
    expect(screen.getByText('903')).toBeInTheDocument()

    const countries = screen.getByRole('region', { name: 'Países' })
    expect(within(countries).getByText('Brasil')).toBeInTheDocument()
    expect(within(countries).getByText('Desconhecido')).toBeInTheDocument()
    expect(within(countries).getByText('Outros')).toBeInTheDocument()
    const regions = screen.getByRole('region', { name: 'Estados' })
    expect(within(regions).getByText('Tocantins')).toBeInTheDocument()
    expect(within(regions).getByText('US-CA')).toBeInTheDocument()
    const origin = screen.getByRole('region', { name: 'Origem' })
    expect(within(origin).getByText('Direto ou sem origem')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Dispositivos' })).getByText('Celular')).toBeInTheDocument()
    const bots = screen.getByRole('region', { name: 'Compartilhamentos e robôs' })
    expect(within(bots).getByText('Facebook, Instagram ou iMessage')).toBeInTheDocument()
    expect(within(bots).getByText('Outros robôs')).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Cliques por dia' })
    expect(within(table).getByRole('rowheader', { name: '24/10/2026' })).toBeInTheDocument()

    expect(screen.getByText(/GeoLite Data created by MaxMind/)).toBeInTheDocument()

    const [call] = api.callsTo('GET', '/links/:code/stats')
    expect(Object.fromEntries(call.query)).toEqual({
      from: '2026-09-26',
      to: '2026-10-25',
      tz: 'America/Sao_Paulo',
      includeBots: 'false',
    })
  })

  it('os atalhos de período mudam a consulta e a URL', async () => {
    const api = setup()
    const { user, router } = renderApp('/app/links/aB3xK9q')
    await screen.findByText('1.284')

    await user.click(screen.getByRole('button', { name: '7 dias' }))

    await vi.waitFor(() => expect(api.callsTo('GET', '/links/:code/stats')).toHaveLength(2))
    const last = api.callsTo('GET', '/links/:code/stats').at(-1)!
    expect(last.query.get('from')).toBe('2026-10-19')
    expect(last.query.get('to')).toBe('2026-10-25')
    expect(currentPath(router)).toBe('/app/links/aB3xK9q?period=7d')
    expect(screen.getByRole('button', { name: '7 dias' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('abrir a URL com período e robôs restaura a visão', async () => {
    const api = setup()
    renderApp('/app/links/aB3xK9q?from=2026-10-01&to=2026-10-10&bots=1')

    await screen.findByText('1.284')
    const [call] = api.callsTo('GET', '/links/:code/stats')
    expect(call.query.get('from')).toBe('2026-10-01')
    expect(call.query.get('to')).toBe('2026-10-10')
    expect(call.query.get('includeBots')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Incluir robôs nos números' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Personalizado' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a chave de robôs envia includeBots=true', async () => {
    const api = setup()
    const { user, router } = renderApp('/app/links/aB3xK9q')
    await screen.findByText('1.284')

    await user.click(screen.getByRole('checkbox', { name: 'Incluir robôs nos números' }))

    await vi.waitFor(() =>
      expect(api.callsTo('GET', '/links/:code/stats').at(-1)!.query.get('includeBots')).toBe('true'),
    )
    expect(currentPath(router)).toBe('/app/links/aB3xK9q?bots=1')
  })

  it('período personalizado inválido mostra o problema e não consulta', async () => {
    const api = setup()
    const { user } = renderApp('/app/links/aB3xK9q')
    await screen.findByText('1.284')

    await user.click(screen.getByRole('button', { name: 'Personalizado' }))
    const from = screen.getByLabelText('De')
    await user.clear(from)
    await user.type(from, '2026-10-20')
    const to = screen.getByLabelText('Até')
    await user.clear(to)
    await user.type(to, '2026-10-10')
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A data inicial precisa ser anterior à final.')
    expect(api.callsTo('GET', '/links/:code/stats')).toHaveLength(1)
  })

  it('período personalizado válido vai para a URL', async () => {
    setup()
    const { user, router } = renderApp('/app/links/aB3xK9q')
    await screen.findByText('1.284')

    await user.click(screen.getByRole('button', { name: 'Personalizado' }))
    const from = screen.getByLabelText('De')
    await user.clear(from)
    await user.type(from, '2026-10-01')
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(currentPath(router)).toBe('/app/links/aB3xK9q?from=2026-10-01&to=2026-10-25')
  })

  it('sem cliques no período mostra o estado vazio', async () => {
    setup(makeStats())
    renderApp('/app/links/aB3xK9q')

    expect(await screen.findByText(/Nenhum clique neste período/)).toBeInTheDocument()
  })

  it('link de outra pessoa, inexistente ou expirado mostra a tela própria', async () => {
    mockApi({
      'GET /me': () => json(USER),
      'GET /links/:code': () => json({ detail: 'Link not found' }, 404),
      'GET /links/:code/stats': () => json({ detail: 'Link not found' }, 404),
    })
    renderApp('/app/links/ZZZZZZZ')

    expect(
      await screen.findByRole('heading', { name: 'Link não encontrado ou expirado' }),
    ).toBeInTheDocument()
  })
})
