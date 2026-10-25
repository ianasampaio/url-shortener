import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useMe } from '../api/hooks'
import ui from './ui.module.css'

export function LoadingScreen() {
  return (
    <p className={ui.status} role="status">
      Carregando…
    </p>
  )
}

/** Só para quem está logado; os demais vão ao login e voltam depois. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe()
  const location = useLocation()

  if (isPending) return <LoadingScreen />
  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/app/login?next=${encodeURIComponent(next)}`} replace />
  }
  return children
}

/** Login e cadastro: quem já está logado vai direto para os links. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe()
  if (isPending) return <LoadingScreen />
  if (user) return <Navigate to="/app/links" replace />
  return children
}
