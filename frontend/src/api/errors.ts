import { ApiError } from './client'

export type ErrorContext = 'login' | 'signup' | 'createLink' | 'generic'

export const MESSAGES = {
  network: 'Não foi possível falar com o servidor.',
  invalidCredentials: 'E-mail ou senha inválidos.',
  emailTaken: 'Já existe uma conta com este e-mail.',
  invalidEmail: 'Informe um e-mail válido.',
  invalidPassword: 'A senha precisa ter entre 8 e 128 caracteres.',
  invalidUrl: 'URL inválida. Use um endereço começando com http:// ou https://',
  blockedUrl: 'Não é possível encurtar links deste serviço ou de outros encurtadores.',
  unavailable: 'Não foi possível gerar o link agora. Tente de novo.',
  sessionExpired: 'Sua sessão expirou. Entre de novo.',
  unexpected: 'Algo deu errado. Tente de novo.',
} as const

function tooManyRequests(retryAfter: number | null): string {
  if (retryAfter === null) return 'Muitas tentativas. Tente de novo mais tarde.'
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return `Muitas tentativas. Tente de novo em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`
}

function validationMessage(error: ApiError): string {
  const items = error.validationItems
  if (items.some((item) => item.type === 'blocked_url')) return MESSAGES.blockedUrl
  const fields = new Set(items.map((item) => item.loc.at(-1)))
  if (fields.has('url')) return MESSAGES.invalidUrl
  if (fields.has('email')) return MESSAGES.invalidEmail
  if (fields.has('password')) return MESSAGES.invalidPassword
  return MESSAGES.unexpected
}

/** Mensagem em português para um erro de chamada à API. */
export function errorMessage(error: unknown, context: ErrorContext = 'generic'): string {
  if (!(error instanceof ApiError)) return MESSAGES.unexpected

  switch (error.status) {
    case null:
      return MESSAGES.network
    case 401:
      return context === 'login' ? MESSAGES.invalidCredentials : MESSAGES.sessionExpired
    case 409:
      return context === 'signup' ? MESSAGES.emailTaken : MESSAGES.unexpected
    case 422:
      return validationMessage(error)
    case 429:
      return tooManyRequests(error.retryAfter)
    case 503:
      return context === 'createLink' ? MESSAGES.unavailable : MESSAGES.network
    default:
      // Com a API fora do ar, o proxy do Vite responde 502/504 em vez de falhar a conexão.
      return error.status >= 500 ? MESSAGES.network : MESSAGES.unexpected
  }
}
