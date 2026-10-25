import { useId } from 'react'
import { SITE_NAME } from '../site'
import styles from './Logo.module.css'

/**
 * Logotipo do Levo (proposta em docs/brand/levo-logo.html): letras em traço, e uma trilha
 * pontilhada que sai do "l" e leva até o "o" em magenta, o destino. As cores vêm dos tokens
 * do tema por style, porque atributos SVG não resolvem var().
 */
export default function Logo({ className }: { className?: string }) {
  // useId pode ter caracteres que quebram url(#...); só letras, números e hífen.
  const trailId = `logo-trail-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  return (
    <svg
      className={`${styles.logo} ${className ?? ''}`}
      viewBox="-20 -50 270 170"
      role="img"
      aria-label={SITE_NAME}
    >
      <defs>
        <linearGradient id={trailId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--violet)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-fg)' }} />
        </linearGradient>
      </defs>
      <g fill="none" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2 V100" stroke="currentColor" />
        <path d="M30 70 H90 A30 30 0 1 0 83 89.3" stroke="currentColor" />
        <path d="M110 40 L135 100 L160 40" stroke="currentColor" />
        <circle cx="205" cy="70" r="30" style={{ stroke: 'var(--accent-fg)' }} />
        <path
          d="M10 -14 Q107 -74 196 26"
          stroke={`url(#${trailId})`}
          strokeWidth="6"
          strokeDasharray="0 14"
        />
      </g>
    </svg>
  )
}
