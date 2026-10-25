import { AUTHOR_GITHUB_URL, AUTHOR_NAME, SITE_NAME, SOURCE_CODE_URL } from '../site'
import { GitHubIcon } from './icons'
import styles from './Footer.module.css'

/** Crédito da autora, centralizado; só nas páginas iniciais (Home e Meus links). */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <p className={styles.inner}>
        <span>
          {SITE_NAME} · feito por{' '}
          {AUTHOR_GITHUB_URL ? (
            <a className={`${styles.link} ${styles.author}`} href={AUTHOR_GITHUB_URL}>
              {AUTHOR_NAME}
            </a>
          ) : (
            <span className={styles.author}>{AUTHOR_NAME}</span>
          )}
        </span>
        {SOURCE_CODE_URL && (
          <>
            <span aria-hidden="true">·</span>
            <a className={styles.link} href={SOURCE_CODE_URL} aria-label="Código-fonte no GitHub">
              <GitHubIcon />
              GitHub
            </a>
          </>
        )}
      </p>
    </footer>
  )
}
