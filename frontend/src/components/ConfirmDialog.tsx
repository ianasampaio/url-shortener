import type { ReactNode } from 'react'
import Modal from './Modal'
import ui from './ui.module.css'
import styles from './ConfirmDialog.module.css'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmação de uma ação destrutiva. */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal open={open} title={title} onClose={onCancel} dismissible={!busy}>
      {children}
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={ui.buttonSecondary} onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className={ui.buttonDanger}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy}
        >
          {busy && <span className={ui.spinner} aria-hidden="true" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
