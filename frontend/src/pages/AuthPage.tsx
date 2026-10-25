import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { errorMessage, MESSAGES } from '../api/errors'
import { useLogin, useRegister } from '../api/hooks'
import { consumeSessionExpired } from '../api/session'
import Logo from '../components/Logo'
import PageHeading from '../components/PageHeading'
import ui from '../components/ui.module.css'
import styles from './AuthPage.module.css'

type Mode = 'login' | 'signup'

const COPY = {
  login: {
    title: 'Entrar',
    submit: 'Entrar',
    busy: 'Entrando…',
    switchText: 'Ainda não tem conta?',
    switchLink: 'Crie uma',
    switchTo: '/app/signup',
  },
  signup: {
    title: 'Criar conta',
    submit: 'Criar conta',
    busy: 'Criando…',
    switchText: 'Já tem conta?',
    switchLink: 'Entre',
    switchTo: '/app/login',
  },
} as const

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Só caminhos internos do app, para o ?next= não virar um redirecionamento para fora. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/app/') && !value.startsWith('//') ? value : '/app/links'
}

function validate(mode: Mode, email: string, password: string): string | null {
  if (!EMAIL.test(email)) return MESSAGES.invalidEmail
  if (mode === 'signup' && (password.length < 8 || password.length > 128)) {
    return MESSAGES.invalidPassword
  }
  if (password === '') return 'Informe a senha.'
  return null
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const copy = COPY[mode]
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const login = useLogin()
  const register = useRegister()
  const mutation = mode === 'login' ? login : register

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)
  const [expired] = useState(() => mode === 'login' && consumeSessionExpired())

  function clearErrors() {
    setClientError(null)
    if (mutation.isError) mutation.reset()
  }

  const error = clientError ?? (mutation.error ? errorMessage(mutation.error, mode) : null)
  const next = safeNext(searchParams.get('next'))
  const switchTo = searchParams.has('next')
    ? `${copy.switchTo}?next=${encodeURIComponent(next)}`
    : copy.switchTo

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    const trimmed = email.trim()
    const problem = validate(mode, trimmed, password)
    setClientError(problem)
    if (problem) return
    mutation.mutate(
      { email: trimmed, password },
      { onSuccess: () => navigate(next, { replace: true }) },
    )
  }

  return (
    <main className={styles.page}>
      <Link to="/" className={styles.brand}>
        <Logo className={styles.logo} />
      </Link>
      <div className={styles.card}>
        <PageHeading title={copy.title} className={styles.title} />
        {expired && (
          <p className={styles.notice} role="status">
            {MESSAGES.sessionExpired}
          </p>
        )}
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={ui.field}>
            <label htmlFor="email" className={ui.label}>
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={ui.input}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearErrors()
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'auth-error' : undefined}
              required
            />
          </div>
          <div className={ui.field}>
            <label htmlFor="password" className={ui.label}>
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={ui.input}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearErrors()
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={mode === 'signup' ? 'password-hint auth-error' : 'auth-error'}
              required
            />
            {mode === 'signup' && (
              <p id="password-hint" className={ui.hint}>
                De 8 a 128 caracteres.
              </p>
            )}
          </div>
          {error && (
            <p id="auth-error" className={ui.error} role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className={ui.button}
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending && <span className={ui.spinner} aria-hidden="true" />}
            {mutation.isPending ? copy.busy : copy.submit}
          </button>
        </form>
        <p className={styles.switch}>
          {copy.switchText} <Link to={switchTo}>{copy.switchLink}</Link>
        </p>
      </div>
    </main>
  )
}
