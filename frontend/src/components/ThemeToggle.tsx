import { useTheme } from '../theme'
import { MoonIcon, SunIcon } from './icons'
import ui from './ui.module.css'

/** Alterna entre tema claro e escuro; o ícone mostra o tema para o qual o botão leva. */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'
  return (
    <button
      type="button"
      className={ui.iconButton}
      onClick={toggle}
      aria-label={label}
      data-tooltip={label}
      data-tooltip-position="bottom"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
