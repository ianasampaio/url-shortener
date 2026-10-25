import { vi } from 'vitest'
import type { Link, LinkPage, Stats, User } from '../api/types'

export type Call = { method: string; path: string; query: URLSearchParams; body: unknown }
type Handler = (call: Call) => Response | Promise<Response>

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function matches(pattern: string, path: string): boolean {
  const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`)
  return regex.test(path)
}

/**
 * Substitui o fetch por respostas por rota, ex.: { 'GET /me': () => json(USER) }.
 * Aceita parâmetros no caminho ('DELETE /links/:code'). Rota não mapeada responde 404.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Call[] = []
  const handlers = { ...routes }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const call: Call = {
      method,
      path: url.pathname.replace(/^\/api/, ''),
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(call)
    const key = Object.keys(handlers).find((route) => {
      const [routeMethod, routePath] = route.split(' ')
      return routeMethod === method && matches(routePath, call.path)
    })
    return key ? handlers[key](call) : json({ detail: 'Not Found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)

  return {
    calls,
    /** Troca ou acrescenta uma rota no meio do teste. */
    set(route: string, handler: Handler) {
      handlers[route] = handler
    },
    callsTo(method: string, path: string) {
      return calls.filter((call) => call.method === method && matches(path, call.path))
    },
  }
}

export const USER: User = {
  id: '6adcafb3249ab049d8a39c78',
  email: 'iana@exemplo.com',
  createdAt: '2026-10-01T12:00:00Z',
}

const DAY_MS = 24 * 60 * 60 * 1000

export function makeLink(overrides: Partial<Link> = {}): Link {
  const code = overrides.code ?? 'aB3xK9q'
  return {
    code,
    shortUrl: `http://localhost:8000/${code}`,
    originalUrl: 'https://exemplo.com/um/caminho/longo',
    createdAt: '2026-10-20T12:00:00Z',
    expiresAt: new Date(Date.now() + 3 * DAY_MS + 60_000).toISOString(),
    clickCount: 0,
    ...overrides,
  }
}

export function page(items: Link[], total = items.length, pageNumber = 1): LinkPage {
  return { items, page: pageNumber, pageSize: 20, total }
}

export function makeStats(overrides: Partial<Stats> = {}): Stats {
  return {
    code: 'aB3xK9q',
    from: '2026-09-26',
    to: '2026-10-25',
    tz: 'America/Sao_Paulo',
    totals: { clicks: 0, uniqueVisitors: 0, botHits: 0 },
    daily: [],
    countries: [],
    regions: [],
    referers: [],
    browsers: [],
    os: [],
    devices: [],
    bots: [],
    ...overrides,
  }
}
