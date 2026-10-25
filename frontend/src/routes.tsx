import { Navigate, type RouteObject } from 'react-router'
import Layout from './components/Layout'
import { LoadingScreen, RequireAuth, RequireGuest } from './components/RouteGuards'
import AccountPage from './pages/AccountPage'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import LinksPage from './pages/LinksPage'
import NotFoundPage from './pages/NotFoundPage'

// Tudo sob /app: num deploy no mesmo domínio dos links curtos, rotas como /signup
// (6 letras) colidiriam com o /{code} da API.
export const routes: RouteObject[] = [
  {
    // Visitante vê a Home; quem está logado vai direto para o painel de links.
    path: '/',
    element: (
      <RequireGuest>
        <HomePage />
      </RequireGuest>
    ),
  },
  { path: '/app', element: <Navigate to="/app/links" replace /> },
  {
    path: '/app/login',
    element: (
      <RequireGuest>
        <AuthPage key="login" mode="login" />
      </RequireGuest>
    ),
  },
  {
    path: '/app/signup',
    element: (
      <RequireGuest>
        <AuthPage key="signup" mode="signup" />
      </RequireGuest>
    ),
  },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { path: 'links', element: <LinksPage /> },
      {
        path: 'links/:code',
        // Carregada sob demanda: só o relatório usa o Recharts, que é a maior dependência.
        lazy: async () => ({ Component: (await import('./pages/LinkStatsPage')).default }),
        // Mostrado ao abrir o relatório direto pela URL, enquanto o módulo carrega.
        hydrateFallbackElement: <LoadingScreen />,
      },
      { path: 'account', element: <AccountPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
