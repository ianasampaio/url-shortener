import { useEffect, useRef, type ReactNode } from 'react'
import { SITE_NAME } from '../site'

type Props = {
  /** Texto da aba do navegador, além do título visível. */
  title: string
  className?: string
  children?: ReactNode
}

/** Título principal da tela; recebe o foco ao abrir, para leitores de tela anunciarem a troca. */
export default function PageHeading({ title, className, children }: Props) {
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} · ${SITE_NAME}`
    ref.current?.focus()
  }, [title])

  return (
    <h1 ref={ref} tabIndex={-1} className={className}>
      {children ?? title}
    </h1>
  )
}
