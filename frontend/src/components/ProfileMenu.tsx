import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLogout, useMe } from '../api/hooks'
import { UserIcon } from './icons'
import styles from './ProfileMenu.module.css'

const HOVER_CLOSE_DELAY_MS = 200

/** Ícone de perfil: abre ao passar o mouse ou ao clicar, com o e-mail, a conta e "Sair". */
export default function ProfileMenu() {
  const { data: user } = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  // Aberto pelo hover: o clique que costuma vir em seguida mantém aberto em vez de fechar.
  const openedByHover = useRef(false)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  function handleClick() {
    if (open && openedByHover.current) {
      openedByHover.current = false
      return
    }
    openedByHover.current = false
    setOpen((value) => !value)
  }

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })
  }

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return
        window.clearTimeout(closeTimer.current)
        if (!open) openedByHover.current = true
        setOpen(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return
        closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS)
      }}
      // Sair do menu pelo teclado (Tab) também fecha.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label="Menu da conta"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={handleClick}
      >
        <UserIcon />
      </button>
      {open && (
        <div id={panelId} className={styles.panel}>
          {user && (
            <div className={styles.account}>
              <p className={styles.accountLabel}>Conectado como</p>
              <p className={styles.email}>{user.email}</p>
            </div>
          )}
          <Link to="/app/account" className={styles.item} onClick={() => setOpen(false)}>
            Minha conta
          </Link>
          <button
            type="button"
            className={styles.item}
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
