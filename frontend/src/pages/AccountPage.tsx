import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { errorMessage } from '../api/errors'
import { useDeleteAccount, useLogout, useMe } from '../api/hooks'
import ConfirmDialog from '../components/ConfirmDialog'
import PageHeading from '../components/PageHeading'
import ui from '../components/ui.module.css'
import { formatDate } from '../format'
import styles from './AccountPage.module.css'

export default function AccountPage() {
  const { data: user } = useMe()
  const logout = useLogout()
  const deleteAccount = useDeleteAccount()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (!user) return null

  return (
    <>
      <Link to="/app/links" className={ui.backLink}>
        ← Meus links
      </Link>
      <PageHeading title="Minha conta" className={styles.title} />

      <section className={`${ui.card} ${styles.section}`} aria-labelledby="account-details">
        <h2 id="account-details" className={styles.sectionTitle}>
          Dados da conta
        </h2>
        <dl className={styles.details}>
          <dt>E-mail</dt>
          <dd>{user.email}</dd>
          <dt>Conta criada em</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </dl>
        <div className={styles.actions}>
          <button
            type="button"
            className={ui.buttonSecondary}
            disabled={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => navigate('/', { replace: true }),
              })
            }
          >
            Sair
          </button>
        </div>
      </section>

      {/* A exclusão fica separada do resto, para não ser clicada por engano. */}
      <section className={`${ui.card} ${styles.danger}`} aria-labelledby="account-delete">
        <div>
          <h2 id="account-delete" className={styles.sectionTitle}>
            Excluir conta
          </h2>
          <p className={styles.dangerText}>
            Apaga a conta, todos os seus links e os cliques deles. Os links curtos deixam de
            funcionar, e não dá para desfazer.
          </p>
        </div>
        <button type="button" className={ui.buttonDangerSoft} onClick={() => setConfirming(true)}>
          Excluir conta
        </button>
      </section>

      <ConfirmDialog
        open={confirming}
        title="Excluir a conta?"
        confirmLabel="Excluir conta"
        busy={deleteAccount.isPending}
        error={deleteAccount.error ? errorMessage(deleteAccount.error) : null}
        onCancel={() => {
          setConfirming(false)
          deleteAccount.reset()
        }}
        onConfirm={() =>
          deleteAccount.mutate(undefined, {
            onSuccess: () => navigate('/', { replace: true }),
          })
        }
      >
        <p>
          A conta <strong>{user.email}</strong>, todos os seus links e todos os cliques deles serão
          apagados de forma permanente. Os links curtos deixam de funcionar.
        </p>
      </ConfirmDialog>
    </>
  )
}
