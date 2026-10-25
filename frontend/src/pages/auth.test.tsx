import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { json, makeLink, mockApi, page, USER } from '../test/api'
import { currentPath, renderApp } from '../test/render'

const loggedOut = () => json({ detail: 'Not authenticated' }, 401)

async function fillLogin(user: ReturnType<typeof renderApp>['user'], email: string, password: string) {
  await user.type(await screen.findByLabelText('E-mail'), email)
  await user.type(screen.getByLabelText('Senha'), password)
}

describe('sessão', () => {
  it('sem sessão, leva ao login e volta para a tela pedida depois de entrar', async () => {
    const api = mockApi({
      'GET /me': loggedOut,
      'POST /auth/login': () => json(USER),
      'GET /links': () => json(page([makeLink()])),
    })
    const { user, router } = renderApp('/app/links?page=1')

    await screen.findByRole('heading', { name: 'Entrar' })
    expect(currentPath(router)).toBe(`/app/login?next=${encodeURIComponent('/app/links?page=1')}`)

    await fillLogin(user, 'iana@exemplo.com', 'uma senha longa')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await screen.findByRole('heading', { name: 'Meus links' })
    expect(currentPath(router)).toBe('/app/links?page=1')
    expect(api.callsTo('POST', '/auth/login')[0].body).toEqual({
      email: 'iana@exemplo.com',
      password: 'uma senha longa',
    })
  })

  it('logado, a tela de login leva para os links', async () => {
    mockApi({ 'GET /me': () => json(USER), 'GET /links': () => json(page([])) })
    const { router } = renderApp('/app/login')

    await screen.findByRole('heading', { name: 'Meus links' })
    expect(currentPath(router)).toBe('/app/links')
  })

  it('um 401 no meio do uso leva ao login com aviso de sessão expirada', async () => {
    mockApi({
      'GET /me': () => json(USER),
      'GET /links': () => json({ detail: 'Not authenticated' }, 401),
    })
    const { router } = renderApp('/app/links')

    await screen.findByRole('heading', { name: 'Entrar' })
    expect(screen.getByRole('status')).toHaveTextContent('Sua sessão expirou. Entre de novo.')
    expect(router.state.location.pathname).toBe('/app/login')
  })

  it('ignora um next que aponta para fora do app', async () => {
    mockApi({
      'GET /me': loggedOut,
      'POST /auth/login': () => json(USER),
      'GET /links': () => json(page([])),
    })
    const { user, router } = renderApp(`/app/login?next=${encodeURIComponent('https://malicioso.com')}`)

    await fillLogin(user, 'iana@exemplo.com', 'uma senha longa')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await screen.findByRole('heading', { name: 'Meus links' })
    expect(currentPath(router)).toBe('/app/links')
  })

  it('sair limpa o cache: outra conta não vê os links da anterior', async () => {
    const api = mockApi({
      'GET /me': () => json(USER),
      'GET /links': () => json(page([makeLink({ code: 'PRIMEIR' })])),
      'POST /auth/logout': () => json(null, 204),
      'POST /auth/login': () => json({ ...USER, email: 'outra@exemplo.com' }),
    })
    const { user, queryClient } = renderApp('/app/links')
    await screen.findByText('localhost:8000/PRIMEIR')

    await user.click(screen.getByRole('button', { name: 'Menu da conta' }))
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    // Sair leva à Home.
    await screen.findByRole('heading', { name: 'Encurte links e acompanhe cada clique' })
    // Logo depois de sair, sem esperar outro login: nada da conta fica em cache.
    expect(queryClient.getQueryCache().findAll({ queryKey: ['links'] })).toHaveLength(0)

    api.set('GET /links', () => json(page([makeLink({ code: 'SEGUNDO' })])))
    await user.click(screen.getByRole('link', { name: 'Entrar' }))
    expect(screen.queryByText('Sua sessão expirou. Entre de novo.')).not.toBeInTheDocument()
    await fillLogin(user, 'outra@exemplo.com', 'outra senha longa')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('localhost:8000/SEGUNDO')).toBeInTheDocument()
    expect(screen.queryByText('localhost:8000/PRIMEIR')).not.toBeInTheDocument()
  })
})

describe('login e cadastro', () => {
  it('senha errada mostra a mensagem genérica', async () => {
    mockApi({
      'GET /me': loggedOut,
      'POST /auth/login': () => json({ detail: 'Invalid email or password' }, 401),
    })
    const { user } = renderApp('/app/login')

    await fillLogin(user, 'iana@exemplo.com', 'errada')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.')
  })

  it('cadastro com e-mail em uso', async () => {
    mockApi({
      'GET /me': loggedOut,
      'POST /auth/register': () => json({ detail: 'Email already registered' }, 409),
    })
    const { user } = renderApp('/app/signup')

    await fillLogin(user, 'iana@exemplo.com', 'uma senha longa')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma conta com este e-mail.',
    )
  })

  it('cadastro com senha curta é barrado antes de chamar a API', async () => {
    const api = mockApi({ 'GET /me': loggedOut })
    const { user } = renderApp('/app/signup')

    await fillLogin(user, 'iana@exemplo.com', 'curta')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A senha precisa ter entre 8 e 128 caracteres.',
    )
    expect(api.callsTo('POST', '/auth/register')).toHaveLength(0)
  })

  it('muitas tentativas mostram em quantos minutos tentar de novo', async () => {
    mockApi({
      'GET /me': loggedOut,
      'POST /auth/login': () => json({ detail: 'Too many requests' }, 429, { 'Retry-After': '600' }),
    })
    const { user } = renderApp('/app/login')

    await fillLogin(user, 'iana@exemplo.com', 'uma senha longa')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Tente de novo em 10 minutos.',
    )
  })

  it('desabilita o botão enquanto envia', async () => {
    let release: (response: Response) => void = () => {}
    mockApi({
      'GET /me': loggedOut,
      'POST /auth/login': () => new Promise<Response>((resolve) => (release = resolve)),
      'GET /links': () => json(page([])),
    })
    const { user } = renderApp('/app/login')

    await fillLogin(user, 'iana@exemplo.com', 'uma senha longa')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled()
    release(json(USER))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Meus links' })).toBeInTheDocument())
  })

  it('o cadastro entra logado', async () => {
    mockApi({
      'GET /me': loggedOut,
      'POST /auth/register': () => json(USER, 201),
      'GET /links': () => json(page([])),
    })
    const { user } = renderApp('/app/signup')

    await fillLogin(user, 'iana@exemplo.com', 'uma senha longa')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByText(/Você ainda não tem links/)).toBeInTheDocument()
  })
})
