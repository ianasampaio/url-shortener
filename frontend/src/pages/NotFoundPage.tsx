import { Link } from 'react-router'
import PageHeading from '../components/PageHeading'
import ui from '../components/ui.module.css'

export default function NotFoundPage() {
  return (
    <main className={ui.status}>
      <PageHeading title="Página não encontrada" />
      <p>
        <Link to="/app/links">Voltar para os seus links</Link>
      </p>
    </main>
  )
}
