import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, request } from './client'
import { queryKeys, type StatsParams } from './keys'
import type { ExpiresIn, Link, LinkPage, Stats, User } from './types'

export const PAGE_SIZE = 20

type Credentials = { email: string; password: string }

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    // Sem sessão a API responde 401: para o front isso é "deslogado", não um erro.
    queryFn: async () => {
      try {
        return await request<User>('GET', '/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: Infinity,
  })
}

function useAuthMutation(path: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: Credentials) => request<User>('POST', path, credentials),
    // Aqui um 401 é senha errada, não sessão expirada.
    meta: { authForm: true },
    onSuccess: (user) => {
      // Nada de outra conta pode sobrar em cache.
      queryClient.removeQueries()
      queryClient.setQueryData(queryKeys.me, user)
    },
  })
}

export const useLogin = () => useAuthMutation('/auth/login')
export const useRegister = () => useAuthMutation('/auth/register')

function useSignOutMutation(method: 'POST' | 'DELETE', path: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => request<void>(method, path),
    onSuccess: () => {
      queryClient.removeQueries()
      queryClient.setQueryData(queryKeys.me, null)
    },
  })
}

export const useLogout = () => useSignOutMutation('POST', '/auth/logout')
export const useDeleteAccount = () => useSignOutMutation('DELETE', '/me')

export function useLinks(page: number) {
  return useQuery({
    queryKey: queryKeys.linksPage(page),
    queryFn: () => request<LinkPage>('GET', `/links?page=${page}&pageSize=${PAGE_SIZE}`),
    // Mantém a página anterior na tela enquanto a próxima carrega.
    placeholderData: keepPreviousData,
  })
}

export function useLink(code: string) {
  return useQuery({
    queryKey: queryKeys.link(code),
    queryFn: () => request<Link>('GET', `/links/${encodeURIComponent(code)}`),
  })
}

export function useLinkStats(code: string, params: StatsParams) {
  const search = new URLSearchParams({
    from: params.from,
    to: params.to,
    tz: params.tz,
    includeBots: String(params.includeBots),
  })
  return useQuery({
    queryKey: queryKeys.statsFor(code, params),
    queryFn: () => request<Stats>('GET', `/links/${encodeURIComponent(code)}/stats?${search}`),
    placeholderData: keepPreviousData,
  })
}

export function useCreateLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { url: string; expiresIn: ExpiresIn }) =>
      request<Link>('POST', '/links', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.links }),
  })
}

export function useDeleteLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => request<void>('DELETE', `/links/${encodeURIComponent(code)}`),
    onSuccess: (_data, code) => {
      queryClient.removeQueries({ queryKey: queryKeys.link(code) })
      queryClient.removeQueries({ queryKey: queryKeys.stats(code) })
      return queryClient.invalidateQueries({ queryKey: queryKeys.links })
    },
  })
}
