/** Um item de erro de validação, no formato do FastAPI (422). */
export type ValidationItem = {
  type: string
  loc: (string | number)[]
  msg: string
}

export class ApiError extends Error {
  /** null quando a requisição nem chegou ao servidor (falha de rede). */
  readonly status: number | null
  readonly detail: unknown
  /** Segundos até poder tentar de novo, do cabeçalho Retry-After (429). */
  readonly retryAfter: number | null

  constructor(status: number | null, detail: unknown = null, retryAfter: number | null = null) {
    super(status === null ? 'Network error' : `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.retryAfter = retryAfter
  }

  get validationItems(): ValidationItem[] {
    return Array.isArray(this.detail) ? (this.detail as ValidationItem[]) : []
  }
}

type Method = 'GET' | 'POST' | 'DELETE'

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(null)
  }

  const payload: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined)

  if (!response.ok) {
    const detail = (payload as { detail?: unknown } | undefined)?.detail ?? null
    const retryAfter = Number(response.headers.get('Retry-After'))
    throw new ApiError(response.status, detail, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null)
  }
  return payload as T
}
