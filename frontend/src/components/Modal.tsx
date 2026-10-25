import { useEffect, useId, useRef, type ReactNode } from 'react'
import { CloseIcon } from './icons'
import styles from './Modal.module.css'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  /** false enquanto algo está em andamento: Esc, clique fora e o X não fecham. */
  dismissible?: boolean
  children: ReactNode
}

/** Modal com o <dialog> nativo, que já cuida do foco, do Esc e do fundo escurecido. */
export default function Modal({ open, title, onClose, dismissible = true, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      // O Esc fecha o diálogo nativo por conta própria; quem decide é o estado do pai.
      onCancel={(event) => {
        event.preventDefault()
        if (dismissible) onClose()
      }}
      // Clique no fundo escurecido (fora do conteúdo) fecha.
      onClick={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose()
      }}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {dismissible && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        )}
      </div>
      {children}
    </dialog>
  )
}
