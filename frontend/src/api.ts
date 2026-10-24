export type ShortLink = {
  code: string
  shortUrl: string
  originalUrl: string
  expiresAt: string
}

export const ERROR_MESSAGES = {
  invalidUrl: 'URL inválida. Use um endereço começando com http:// ou https://',
  unavailable: 'Não foi possível gerar o link agora. Tente de novo.',
  network: 'Não foi possível falar com o servidor.',
} as const

export class ShortenError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ShortenError'
    this.status = status
  }
}

// Com a API fora do ar, o proxy do Vite responde 502 em vez de falhar a conexão,
// então qualquer status inesperado também cai em "não foi possível falar com o servidor".
export function errorMessageForStatus(status: number): string {
  switch (status) {
    case 422:
      return ERROR_MESSAGES.invalidUrl
    case 503:
      return ERROR_MESSAGES.unavailable
    default:
      return ERROR_MESSAGES.network
  }
}

export async function shortenUrl(url: string): Promise<ShortLink> {
  let response: Response
  try {
    response = await fetch('/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch {
    throw new ShortenError(ERROR_MESSAGES.network, null)
  }

  if (response.status !== 201) {
    throw new ShortenError(errorMessageForStatus(response.status), response.status)
  }

  try {
    return (await response.json()) as ShortLink
  } catch {
    throw new ShortenError(ERROR_MESSAGES.network, response.status)
  }
}
