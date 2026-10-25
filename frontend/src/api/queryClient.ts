import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'
import { queryKeys } from './keys'
import { markSessionExpired } from './session'

type Options = { retry?: boolean }

export function createQueryClient({ retry = true }: Options = {}): QueryClient {
  // Um 401 fora do login/cadastro quer dizer sessão expirada: esquece o usuário, e o guarda
  // de rotas leva para o login.
  const onError = (error: unknown, meta?: Record<string, unknown>) => {
    if (error instanceof ApiError && error.status === 401 && !meta?.authForm) {
      markSessionExpired()
      client.setQueryData(queryKeys.me, null)
    }
  }

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => onError(error, query.meta) }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => onError(error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        // Só vale tentar de novo em falha de rede ou erro do servidor; 4xx não muda sozinho.
        retry: (count, error) =>
          retry &&
          count < 2 &&
          error instanceof ApiError &&
          (error.status === null || error.status >= 500),
        refetchOnWindowFocus: false,
      },
    },
  })
  return client
}
