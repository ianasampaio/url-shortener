import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { MESSAGES } from '../api/errors'
import Footer from '../components/Footer'
import { ChartIcon, CheckIcon, ClockIcon, CopyIcon } from '../components/icons'
import Modal from '../components/Modal'
import PageHeading from '../components/PageHeading'
import SiteHeader from '../components/SiteHeader'
import ui from '../components/ui.module.css'
import styles from './HomePage.module.css'
import ReportPreview from './ReportPreview'

const BENEFITS = [
  {
    icon: <CopyIcon />,
    title: 'Todos os seus links num só lugar',
    text: 'Copie, acompanhe e apague os links que você criou, quando quiser.',
  },
  {
    icon: <ChartIcon />,
    title: 'Veja quem clicou',
    text: 'Cliques por dia, país, origem, navegador e dispositivo, sem guardar o IP de ninguém.',
  },
  {
    icon: <ClockIcon />,
    title: 'Você escolhe a validade',
    text: '1 dia, 7 dias, 30 dias ou sem validade.',
  },
]

/** Para onde voltar depois de entrar: o painel, já com a URL digitada aqui. */
function nextFor(url: string): string {
  const target = `/app/links?url=${encodeURIComponent(url)}`
  return encodeURIComponent(target)
}

export default function HomePage() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = url.trim()
    if (value === '') return setError('Informe a URL que você quer encurtar.')
    if (!/^https?:\/\//i.test(value)) return setError(MESSAGES.invalidUrl)
    setError(null)
    // Encurtar exige conta: o modal convida a entrar, levando a URL junto.
    setPendingUrl(value)
  }

  return (
    <>
      <SiteHeader>
        <Link to="/app/login" className={ui.buttonGhost}>
          Entrar
        </Link>
        <Link to="/app/signup" className={ui.button}>
          {/* Um span só: no botão (flex com gap), dois pedaços de texto ganhariam espaço extra. */}
          <span>
            Cadastre-se <span className={styles.longLabel}>gratuitamente</span>
          </span>
        </Link>
      </SiteHeader>

      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>Grátis, com relatório de cliques</span>
          <PageHeading title="Encurte links e acompanhe cada clique" className={styles.title}>
            Encurte links e acompanhe <span className={styles.titleAccent}>cada clique</span>
          </PageHeading>
          <p className={styles.subtitle}>
            Transforme endereços longos em links curtos e veja de onde vêm os seus visitantes.
          </p>
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <label htmlFor="home-url" className="visually-hidden">
              URL longa
            </label>
            <div className={styles.row}>
              <input
                id="home-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://exemplo.com/um/caminho/longo"
                className={ui.input}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  setError(null)
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'home-url-error' : undefined}
              />
              <button type="submit" className={ui.button}>
                Encurtar URL
              </button>
            </div>
            {error && (
              <p id="home-url-error" className={`${ui.error} ${styles.formError}`} role="alert">
                {error}
              </p>
            )}
          </form>
        </section>

        <ReportPreview />

        <ul className={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className={`${ui.card} ${styles.benefitCard}`}>
              <span className={styles.benefitIcon} aria-hidden="true">
                {benefit.icon}
              </span>
              <h2 className={styles.benefitTitle}>{benefit.title}</h2>
              <p className={styles.benefitText}>{benefit.text}</p>
            </li>
          ))}
        </ul>
      </main>
      <Footer />

      <Modal
        open={pendingUrl !== null}
        title="Crie sua conta gratuita para encurtar"
        onClose={() => setPendingUrl(null)}
      >
        <p className={styles.modalText}>
          Seu link fica guardado na sua conta, e você acompanha os cliques dele.
        </p>
        <ul className={styles.modalList}>
          {BENEFITS.map((benefit) => (
            <li key={benefit.title}>
              <span className={styles.modalCheck} aria-hidden="true">
                <CheckIcon />
              </span>
              <span>
                <strong>{benefit.title}.</strong> {benefit.text}
              </span>
            </li>
          ))}
        </ul>
        {pendingUrl !== null && (
          <div className={styles.modalActions}>
            <Link to={`/app/signup?next=${nextFor(pendingUrl)}`} className={ui.button}>
              Cadastre-se gratuitamente
            </Link>
            <Link to={`/app/login?next=${nextFor(pendingUrl)}`} className={ui.buttonSecondary}>
              Já tenho conta: entrar
            </Link>
          </div>
        )}
      </Modal>
    </>
  )
}
