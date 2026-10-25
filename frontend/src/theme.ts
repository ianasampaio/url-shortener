import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

// A mesma chave é lida pelo script do index.html, antes do app carregar, para a página
// não piscar no tema errado.
export const THEME_STORAGE_KEY = 'theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'
const THEME_COLORS: Record<Theme, string> = { light: '#faf8fb', dark: '#0e0c11' }

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    // Navegação privada ou armazenamento bloqueado: segue o sistema.
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme | null) {
  const root = document.documentElement
  if (theme) root.dataset.theme = theme
  else delete root.dataset.theme
  // Barra do navegador no celular acompanha o tema escolhido.
  const effective = theme ?? systemTheme()
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => (meta.content = THEME_COLORS[effective]))
}

/** Tema efetivo e a troca entre claro e escuro. Sem escolha salva, segue o sistema. */
export function useTheme() {
  const [choice, setChoice] = useState<Theme | null>(storedTheme)
  const [system, setSystem] = useState<Theme>(systemTheme)

  // Enquanto não há escolha, o tema acompanha mudanças do sistema em tempo real.
  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY)
    if (!media) return
    const onChange = () => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const theme = choice ?? system

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Sem armazenamento, a escolha vale só até recarregar.
    }
    applyTheme(next)
    setChoice(next)
  }, [theme])

  return { theme, toggle }
}
