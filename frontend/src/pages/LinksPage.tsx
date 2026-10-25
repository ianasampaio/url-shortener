import { useEffect, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { errorMessage } from '../api/errors'
import { PAGE_SIZE, useDeleteLink, useLinks } from '../api/hooks'
import type { Link } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import CopyButton from '../components/CopyButton'
import { ChartIcon, TrashIcon } from '../components/icons'
import PageHeading from '../components/PageHeading'
import Pagination from '../components/Pagination'
import { LoadingScreen } from '../components/RouteGuards'
import ui from '../components/ui.module.css'
import { describeExpiry, formatDateCompact, formatNumber, stripScheme } from '../format'
import CreateLinkForm from './CreateLinkForm'
import styles from './LinksPage.module.css'

function parsePage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

export default function LinksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePage(searchParams.get('page'))
  const links = useLinks(page)
  const deleteLink = useDeleteLink()
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Link | null>(null)
  // A Home manda a URL digitada antes do login em ?url=; ela preenche o formulário uma vez.
  const [initialUrl] = useState(() => searchParams.get('url') ?? '')

  useEffect(() => {
    if (!searchParams.has('url')) return
    const next = new URLSearchParams(searchParams)
    next.delete('url')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  function goToPage(next: number) {
    setSearchParams(next === 1 ? {} : { page: String(next) })
  }

  function handleCreated(link: Link) {
    setCreatedCode(link.code)
    // O link novo é o mais recente: fica no topo da primeira página.
    if (page !== 1) goToPage(1)
  }

  function closeDelete() {
    setToDelete(null)
    deleteLink.reset()
  }

  function confirmDelete() {
    if (!toDelete) return
    deleteLink.mutate(toDelete.code, {
      onSuccess: () => {
        closeDelete()
        // Apagar o último item de uma página deixaria a tela vazia.
        if (links.data && links.data.items.length === 1 && page > 1) goToPage(page - 1)
      },
    })
  }

  const totalPages = links.data ? Math.max(1, Math.ceil(links.data.total / PAGE_SIZE)) : 1

  return (
    <>
      <div className={styles.header}>
        <PageHeading title="Meus links" className={styles.title} />
      </div>

      <CreateLinkForm onCreated={handleCreated} initialUrl={initialUrl} />

      {links.isPending && <LoadingScreen />}
      {links.isError && (
        <p className={ui.error} role="alert">
          {errorMessage(links.error)}
        </p>
      )}
      {links.data && links.data.total === 0 && (
        <p className={`${ui.card} ${styles.empty}`}>
          Você ainda não tem links. Cole uma URL acima para criar o primeiro.
        </p>
      )}
      {links.data && links.data.items.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="visually-hidden">Seus links, do mais recente ao mais antigo</caption>
            <thead>
              <tr>
                <th scope="col">Link curto</th>
                <th scope="col">Destino</th>
                <th scope="col">Validade</th>
                <th scope="col">Cliques</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {links.data.items.map((link) => {
                const expiry = describeExpiry(link.expiresAt)
                const isNew = link.code === createdCode
                return (
                  <tr key={link.code} className={isNew ? styles.highlight : undefined}>
                    <td>
                      <span className={styles.short}>
                        <a href={link.shortUrl} target="_blank" rel="noopener noreferrer">
                          {stripScheme(link.shortUrl)}
                        </a>
                        <CopyButton
                          text={link.shortUrl}
                          label={`Copiar ${stripScheme(link.shortUrl)}`}
                          autoFocus={isNew}
                        />
                      </span>
                    </td>
                    <td data-label="Destino" className={styles.destinationCell}>
                      <span className={styles.destination} title={link.originalUrl}>
                        {link.originalUrl}
                      </span>
                      {/* Sob o destino, e não numa coluna: seis colunas não cabem com as ações. */}
                      <span className={styles.created}>
                        criado em {formatDateCompact(link.createdAt)}
                      </span>
                    </td>
                    <td data-label="Validade" className={styles.nowrap}>
                      <span className={expiry.soon ? styles.soon : styles.validity}>
                        {expiry.text}
                      </span>
                    </td>
                    <td data-label="Cliques" className={styles.number}>
                      {formatNumber(link.clickCount)}
                    </td>
                    <td>
                      <span className={styles.actions}>
                        <RouterLink
                          to={`/app/links/${link.code}`}
                          className={ui.iconButton}
                          aria-label={`Relatório de ${stripScheme(link.shortUrl)}`}
                          data-tooltip="Relatório"
                        >
                          <ChartIcon />
                        </RouterLink>
                        <button
                          type="button"
                          className={ui.iconButtonDanger}
                          onClick={() => setToDelete(link)}
                          aria-label={`Excluir ${stripScheme(link.shortUrl)}`}
                          data-tooltip="Excluir"
                        >
                          <TrashIcon />
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={goToPage} />

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir link?"
        confirmLabel="Excluir"
        busy={deleteLink.isPending}
        error={deleteLink.error ? errorMessage(deleteLink.error) : null}
        onConfirm={confirmDelete}
        onCancel={closeDelete}
      >
        <p>
          O link <strong>{toDelete && stripScheme(toDelete.shortUrl)}</strong> deixa de funcionar, e
          os cliques dele são apagados. Não dá para desfazer.
        </p>
      </ConfirmDialog>
    </>
  )
}
