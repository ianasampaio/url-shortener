import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CheckIcon, ChevronDownIcon } from './icons'
import styles from './Select.module.css'

export type SelectOption<T extends string> = { value: T; label: string }

type Props<T extends string> = {
  /** id do rótulo visível; o nome acessível do botão é "rótulo + valor atual". */
  labelId: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
}

/**
 * Lista suspensa com o visual do app (o menu do <select> nativo não aceita estilo).
 * Segue o padrão de listbox do ARIA: setas, Home/End, Enter/Espaço escolhem, Esc fecha.
 */
export default function Select<T extends string>({ labelId, value, options, onChange }: Props<T>) {
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const [active, setActive] = useState(selectedIndex)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const baseId = useId()
  const triggerId = `${baseId}-trigger`
  const optionId = (index: number) => `${baseId}-option-${index}`

  useEffect(() => {
    if (!open) return
    listRef.current?.focus()
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function openList() {
    setActive(selectedIndex)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(index: number) {
    onChange(options[index].value)
    close()
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openList()
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1
    const moves: Record<string, () => number> = {
      ArrowDown: () => Math.min(last, active + 1),
      ArrowUp: () => Math.max(0, active - 1),
      Home: () => 0,
      End: () => last,
    }
    if (event.key in moves) {
      event.preventDefault()
      setActive(moves[event.key]())
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${triggerId}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{options[selectedIndex].label}</span>
        <span className={styles.chevron} aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className={styles.listbox}
          aria-labelledby={labelId}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={index === selectedIndex}
              className={`${styles.option} ${index === active ? styles.active : ''}`}
              onClick={() => choose(index)}
              onMouseEnter={() => setActive(index)}
            >
              {option.label}
              {index === selectedIndex && (
                <span className={styles.check} aria-hidden="true">
                  <CheckIcon />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
