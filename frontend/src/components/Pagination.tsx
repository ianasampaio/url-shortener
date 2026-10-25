import ui from './ui.module.css'
import styles from './Pagination.module.css'

type Props = {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

export default function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null
  return (
    <nav className={styles.pagination} aria-label="Paginação">
      <button
        type="button"
        className={ui.buttonSecondary}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        Anterior
      </button>
      <span aria-current="page">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        className={ui.buttonSecondary}
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        Próxima
      </button>
    </nav>
  )
}
