import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { json, mockApi, page, USER } from '../test/api'
import { currentPath, renderApp } from '../test/render'

const loggedOut = () => json({ detail: 'Not authenticated' }, 401)

describe('Home', () => {
  it('visitante vê o campo de URL e os botões de entrar e de cadastro', async () => {
    mockApi({ 'GET /me': loggedOut })
    renderApp('/')

    await screen.findByRole('heading', { name: 'Encurte links e acompanhe cada clique' })
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/app/login')
    expect(within(header).getByRole('link', { name: 'Cadastre-se gratuitamente' })).toHaveAttribute(
      'href',
      '/app/signup',
    )
    expect(screen.getByLabelText('URL longa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encurtar URL' })).toBeInTheDocument()
    // O logotipo é um link para a Home, com o nome da marca como texto alternativo.
    expect(within(header).getByRole('link', { name: 'Levo' })).toHaveAttribute('href', '/')
  })

  it('quem está logado vai direto para o painel de links', async () => {
    mockApi({ 'GET /me': () => json(USER), 'GET /links': () => json(page([])) })
    const { router } = renderApp('/')

    await screen.findByRole('heading', { name: 'Meus links' })
    expect(currentPath(router)).toBe('/app/links')
  })

  it('"Encurtar URL" abre o convite para criar conta, levando a URL junto', async () => {
    const api = mockApi({ 'GET /me': loggedOut })
    const { user } = renderApp('/')

    await user.type(await screen.findByLabelText('URL longa'), 'https://exemplo.com/longo')
    await user.click(screen.getByRole('button', { name: 'Encurtar URL' }))

    const dialog = screen.getByRole('dialog', { name: 'Crie sua conta gratuita para encurtar' })
    expect(dialog).toHaveTextContent('Veja quem clicou')
    const next = encodeURIComponent(`/app/links?url=${encodeURIComponent('https://exemplo.com/longo')}`)
    expect(within(dialog).getByRole('link', { name: 'Cadastre-se gratuitamente' })).toHaveAttribute(
      'href',
      `/app/signup?next=${next}`,
    )
    expect(within(dialog).getByRole('link', { name: 'Já tenho conta: entrar' })).toHaveAttribute(
      'href',
      `/app/login?next=${next}`,
    )
    // Sem conta, nada é enviado à API.
    expect(api.callsTo('POST', '/links')).toHaveLength(0)
  })

  it('o modal fecha pelo X', async () => {
    mockApi({ 'GET /me': loggedOut })
    const { user } = renderApp('/')

    await user.type(await screen.findByLabelText('URL longa'), 'https://exemplo.com/')
    await user.click(screen.getByRole('button', { name: 'Encurtar URL' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('URL vazia ou sem http(s) mostra o erro em vez do modal', async () => {
    mockApi({ 'GET /me': loggedOut })
    const { user } = renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Encurtar URL' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe a URL que você quer encurtar.')

    await user.type(screen.getByLabelText('URL longa'), 'exemplo.com')
    await user.click(screen.getByRole('button', { name: 'Encurtar URL' }))
    expect(screen.getByRole('alert')).toHaveTextContent('URL inválida')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cadastro pelo convite volta ao painel com a URL preenchida', async () => {
    mockApi({
      'GET /me': loggedOut,
      'POST /auth/register': () => json(USER, 201),
      'GET /links': () => json(page([])),
    })
    const { user, router } = renderApp('/')

    await user.type(await screen.findByLabelText('URL longa'), 'https://exemplo.com/longo')
    await user.click(screen.getByRole('button', { name: 'Encurtar URL' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('link', { name: 'Cadastre-se gratuitamente' }))

    await user.type(await screen.findByLabelText('E-mail'), 'iana@exemplo.com')
    await user.type(screen.getByLabelText('Senha'), 'uma senha longa')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByLabelText('URL longa')).toHaveValue('https://exemplo.com/longo')
    expect(router.state.location.pathname).toBe('/app/links')
  })
})

describe('menu de perfil', () => {
  it('mostra o e-mail, o link da conta e "Sair"; Esc fecha e devolve o foco', async () => {
    mockApi({ 'GET /me': () => json(USER), 'GET /links': () => json(page([])) })
    const { user } = renderApp('/app/links')

    const header = await screen.findByRole('banner')
    expect(within(header).queryByRole('link', { name: 'Meus links' })).not.toBeInTheDocument()
    const trigger = within(header).getByRole('button', { name: 'Menu da conta' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(header).getByText('iana@exemplo.com')).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Minha conta' })).toHaveAttribute(
      'href',
      '/app/account',
    )
    expect(within(header).getByRole('button', { name: 'Sair' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(within(header).queryByText('iana@exemplo.com')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('abre ao passar o mouse, e o clique logo depois mantém aberto', async () => {
    mockApi({ 'GET /me': () => json(USER), 'GET /links': () => json(page([])) })
    const { user } = renderApp('/app/links')
    const trigger = await screen.findByRole('button', { name: 'Menu da conta' })

    await user.hover(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('clique fora fecha', async () => {
    mockApi({ 'GET /me': () => json(USER), 'GET /links': () => json(page([])) })
    const { user } = renderApp('/app/links')
    const trigger = await screen.findByRole('button', { name: 'Menu da conta' })

    await user.click(trigger)
    await user.click(screen.getByRole('heading', { name: 'Meus links' }))

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('rodapé', () => {
  it.each([
    ['Home', '/', loggedOut],
    ['Meus links', '/app/links', () => json(USER)],
  ])('aparece em %s com o crédito e os links do GitHub', async (_name, path, me) => {
    mockApi({ 'GET /me': me, 'GET /links': () => json(page([])) })
    renderApp(path)

    const footer = await screen.findByRole('contentinfo')
    expect(footer).toHaveTextContent('Levo · feito por Iana Sampaio')
    expect(within(footer).getByRole('link', { name: 'Iana Sampaio' })).toHaveAttribute(
      'href',
      'https://github.com/ianasampaio',
    )
    expect(within(footer).getByRole('link', { name: 'Código-fonte no GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/ianasampaio/url-shortener',
    )
  })
})
