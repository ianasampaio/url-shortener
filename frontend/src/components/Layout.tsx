import { Outlet, useMatch } from 'react-router'
import Footer from './Footer'
import ProfileMenu from './ProfileMenu'
import SiteHeader from './SiteHeader'
import styles from './Layout.module.css'

/** Telas de quem está logado: o painel de links já é a página inicial, então o cabeçalho só tem o perfil. */
export default function Layout() {
  // O crédito do rodapé só aparece nas páginas iniciais: aqui, em Meus links.
  const isHome = useMatch('/app/links') !== null
  return (
    <>
      <SiteHeader>
        <ProfileMenu />
      </SiteHeader>
      <main className={styles.main}>
        <Outlet />
      </main>
      {isHome && <Footer />}
    </>
  )
}
