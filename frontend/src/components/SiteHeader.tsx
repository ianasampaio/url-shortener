import type { ReactNode } from 'react'
import { Link } from 'react-router'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import styles from './SiteHeader.module.css'

/** Cabeçalho comum à Home e às telas de quem está logado; à direita, as ações de cada uma. */
export default function SiteHeader({ children }: { children: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <Logo />
        </Link>
        <div className={styles.actions}>
          <ThemeToggle />
          {children}
        </div>
      </div>
    </header>
  )
}
