import { useEffect, useRef, useState } from 'react'
import styles from './CopyButton.module.css'
import { CheckIcon, CopyIcon } from './icons'

const FEEDBACK_MS = 2000

type Props = {
  text: string
  /** Nome acessível, ex.: "Copiar link curto". */
  label?: string
  autoFocus?: boolean
}

type CopyState = 'idle' | 'copied' | 'failed'

export default function CopyButton({ text, label = 'Copiar', autoFocus }: Props) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    timer.current = window.setTimeout(() => setState('idle'), FEEDBACK_MS)
  }

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={copy}
        aria-label={label}
        data-tooltip="Copiar"
        autoFocus={autoFocus}
      >
        {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span aria-live="polite" className={state === 'failed' ? styles.failed : styles.feedback}>
        {state === 'copied' && 'Copiado!'}
        {state === 'failed' && 'Não foi possível copiar.'}
      </span>
    </span>
  )
}
