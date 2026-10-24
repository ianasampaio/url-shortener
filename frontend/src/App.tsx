import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ERROR_MESSAGES, ShortenError, shortenUrl, type ShortLink } from './api'
import styles from './App.module.css'

const COPIED_FEEDBACK_MS = 2000

const expiresAtFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
})

function formatExpiresAt(iso: string): string {
  return expiresAtFormat.format(new Date(iso))
}

function validateUrl(value: string): string | null {
  if (value === '') return 'Informe a URL que você quer encurtar.'
  if (!/^https?:\/\//i.test(value)) return ERROR_MESSAGES.invalidUrl
  return null
}

type CopyState = 'idle' | 'copied' | 'failed'

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export default function App() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState<ShortLink | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  // O estado `loading` só vale no próximo render; o ref barra um segundo submit imediato.
  const submittingRef = useRef(false)
  const copyTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(copyTimerRef.current), [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return

    const value = url.trim()
    const validationError = validateUrl(value)
    if (validationError) {
      setError(validationError)
      return
    }

    submittingRef.current = true
    setLoading(true)
    setError(null)
    setLink(null)
    setCopyState('idle')
    try {
      setLink(await shortenUrl(value))
    } catch (err) {
      setError(err instanceof ShortenError ? err.message : ERROR_MESSAGES.network)
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!link) return
    window.clearTimeout(copyTimerRef.current)
    try {
      await navigator.clipboard.writeText(link.shortUrl)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), COPIED_FEEDBACK_MS)
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Encurtador de URLs</h1>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <label htmlFor="url" className={styles.label}>
          URL longa
        </label>
        <div className={styles.row}>
          <input
            id="url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://exemplo.com/um/caminho/longo"
            className={styles.input}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (error) setError(null)
            }}
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'url-hint url-error' : 'url-hint'}
          />
          <button type="submit" className={styles.button} disabled={loading} aria-busy={loading}>
            {loading ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Encurtando…
              </>
            ) : (
              'Encurtar'
            )}
          </button>
        </div>
        <p id="url-hint" className={styles.hint}>
          Comece com http:// ou https://
        </p>
        {error && (
          <p id="url-error" className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>

      <section className={styles.result} aria-live="polite">
        {link && (
          <>
            <div className={styles.shortRow}>
              <h2 className={styles.resultTitle}>Seu link curto</h2>
              <span className={styles.linkGroup}>
                <a
                  href={link.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.shortUrl}
                  title={link.shortUrl}
                >
                  {link.shortUrl.replace(/^https?:\/\//, '')}
                </a>
                <span className={styles.copyWrap}>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={handleCopy}
                    aria-label={copyState === 'copied' ? 'Copiado!' : 'Copiar'}
                    title={copyState === 'copied' ? 'Copiado!' : 'Copiar'}
                  >
                    {copyState === 'copied' ? <CheckIcon /> : <CopyIcon />}
                  </button>
                  {copyState === 'copied' && (
                    <span className={styles.copied} aria-hidden="true">
                      Copiado!
                    </span>
                  )}
                </span>
              </span>
            </div>
            {copyState === 'failed' && (
              <p className={styles.error}>Não foi possível copiar. Selecione o link e copie.</p>
            )}
            <dl className={styles.details}>
              <dt>URL original</dt>
              <dd className={styles.originalUrl}>{link.originalUrl}</dd>
              <dt>Expira em</dt>
              <dd>
                <time dateTime={link.expiresAt}>{formatExpiresAt(link.expiresAt)}</time>
              </dd>
            </dl>
          </>
        )}
      </section>
    </main>
  )
}
