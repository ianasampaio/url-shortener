import { useState, type FormEvent } from 'react'
import { errorMessage, MESSAGES } from '../api/errors'
import { useCreateLink } from '../api/hooks'
import type { ExpiresIn, Link } from '../api/types'
import Select, { type SelectOption } from '../components/Select'
import ui from '../components/ui.module.css'
import styles from './LinksPage.module.css'

const VALIDITY_OPTIONS: SelectOption<ExpiresIn>[] = [
  { value: '1d', label: '1 dia' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'never', label: 'Sem validade' },
]

type Props = {
  onCreated: (link: Link) => void
  /** URL já digitada na Home antes de entrar ou se cadastrar. */
  initialUrl?: string
}

export default function CreateLinkForm({ onCreated, initialUrl = '' }: Props) {
  const createLink = useCreateLink()
  const [url, setUrl] = useState(initialUrl)
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>('30d')
  const [clientError, setClientError] = useState<string | null>(null)

  const error =
    clientError ?? (createLink.error ? errorMessage(createLink.error, 'createLink') : null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (createLink.isPending) return
    const value = url.trim()
    if (value === '') return setClientError('Informe a URL que você quer encurtar.')
    if (!/^https?:\/\//i.test(value)) return setClientError(MESSAGES.invalidUrl)
    setClientError(null)
    createLink.mutate(
      { url: value, expiresIn },
      {
        onSuccess: (link) => {
          setUrl('')
          onCreated(link)
        },
      },
    )
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="Novo link">
      <div className={`${ui.field} ${styles.urlField}`}>
        <label htmlFor="url" className={ui.label}>
          URL longa
        </label>
        <input
          id="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://exemplo.com/um/caminho/longo"
          className={ui.input}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setClientError(null)
            if (createLink.isError) createLink.reset()
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'url-error' : undefined}
        />
      </div>
      <div className={ui.field}>
        <span id="validity-label" className={ui.label}>
          Validade
        </span>
        <Select
          labelId="validity-label"
          value={expiresIn}
          options={VALIDITY_OPTIONS}
          onChange={setExpiresIn}
        />
      </div>
      <button
        type="submit"
        className={ui.button}
        disabled={createLink.isPending}
        aria-busy={createLink.isPending}
      >
        {createLink.isPending && <span className={ui.spinner} aria-hidden="true" />}
        {createLink.isPending ? 'Encurtando…' : 'Encurtar'}
      </button>
      {error && (
        <div className={styles.formMessages}>
          <p id="url-error" className={ui.error} role="alert">
            {error}
          </p>
        </div>
      )}
    </form>
  )
}
