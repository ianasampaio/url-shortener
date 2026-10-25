import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { json, makeLink, mockApi, page, USER } from '../test/api'
import { currentPath, renderApp } from '../test/render'

const me = () => json(USER)

describe('meus links', () => {
  it('lista com cliques, expiração relativa e "nunca expira"', async () => {
    mockApi({
      'GET /me': me,
      'GET /links': () =>
        json(
          page([
            makeLink({ code: 'AAAAAAA', clickCount: 1234 }),
            makeLink({ code: 'BBBBBBB', expiresAt: null }),
            makeLink({ code: 'CCCCCCC', expiresAt: new Date(Date.now() + 5 * 3600_000).toISOString() }),
          ]),
        ),
    })
    renderApp('/app/links')

    const row = (await screen.findByText('localhost:8000/AAAAAAA')).closest('tr')!
    expect(within(row).getByText('1.234')).toBeInTheDocument()
    expect(within(row).getByText('expira em 3 dias')).toBeInTheDocument()
    const never = screen.getByText('localhost:8000/BBBBBBB').closest('tr')!
    expect(within(never).getByText('nunca expira')).toBeInTheDocument()
    const soon = screen.getByText('localhost:8000/CCCCCCC').closest('tr')!
    expect(within(soon).getByText('expira em 5 horas')).toBeInTheDocument()
  })

  it('sem links mostra o convite para criar o primeiro', async () => {
    mockApi({ 'GET /me': me, 'GET /links': () => json(page([])) })
    renderApp('/app/links')

    expect(await screen.findByText(/Você ainda não tem links/)).toBeInTheDocument()
  })

  it.each([
    ['1 dia', '1d'],
    ['7 dias', '7d'],
    ['30 dias', '30d'],
    ['Sem validade', 'never'],
  ])('cria com validade "%s" e o link novo aparece no topo', async (label, expiresIn) => {
    const created = makeLink({ code: 'NOVO123', originalUrl: 'https://novo.com/' })
    const api = mockApi({
      'GET /me': me,
      'GET /links': () => json(page([])),
      'POST /links': () => json(created, 201),
    })
    const { user } = renderApp('/app/links')
    await screen.findByText(/Você ainda não tem links/)

    api.set('GET /links', () => json(page([created])))
    await user.type(screen.getByLabelText('URL longa'), 'https://novo.com')
    await user.click(screen.getByRole('button', { name: 'Validade 30 dias' }))
    await user.click(screen.getByRole('option', { name: label }))
    await user.click(screen.getByRole('button', { name: 'Encurtar' }))

    const copy = await screen.findByRole('button', { name: 'Copiar localhost:8000/NOVO123' })
    expect(api.callsTo('POST', '/links')[0].body).toEqual({ url: 'https://novo.com', expiresIn })
    expect(copy).toHaveFocus()
    expect(screen.getByLabelText('URL longa')).toHaveValue('')
  })

  it.each([
    [
      json({ detail: [{ type: 'blocked_url', loc: ['body', 'url'], msg: 'x' }] }, 422),
      'Não é possível encurtar links deste serviço ou de outros encurtadores.',
    ],
    [
      json({ detail: [{ type: 'url_parsing', loc: ['body', 'url'], msg: 'x' }] }, 422),
      'URL inválida. Use um endereço começando com http:// ou https://',
    ],
    [json({ detail: 'Too many requests' }, 429, { 'Retry-After': '30' }), 'Tente de novo em 1 minuto.'],
    [json({ detail: 'Could not generate a unique code' }, 503), 'Não foi possível gerar o link agora.'],
  ])('mostra o erro da criação (%#)', async (response, message) => {
    mockApi({ 'GET /me': me, 'GET /links': () => json(page([])), 'POST /links': () => response })
    const { user } = renderApp('/app/links')

    await user.type(await screen.findByLabelText('URL longa'), 'https://bit.ly/abc')
    await user.click(screen.getByRole('button', { name: 'Encurtar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('URL sem http(s) é barrada antes de chamar a API', async () => {
    const api = mockApi({ 'GET /me': me, 'GET /links': () => json(page([])) })
    const { user } = renderApp('/app/links')

    await user.type(await screen.findByLabelText('URL longa'), 'exemplo.com')
    await user.click(screen.getByRole('button', { name: 'Encurtar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('URL inválida')
    expect(api.callsTo('POST', '/links')).toHaveLength(0)
  })

  it('excluir pede confirmação, chama a API e atualiza a lista', async () => {
    const api = mockApi({
      'GET /me': me,
      'GET /links': () => json(page([makeLink({ code: 'APAGAR1' })])),
      'DELETE /links/:code': () => json(null, 204),
    })
    const { user } = renderApp('/app/links')

    await user.click(await screen.findByRole('button', { name: 'Excluir localhost:8000/APAGAR1' }))
    const dialog = screen.getByRole('dialog', { name: 'Excluir link?' })
    expect(dialog).toHaveTextContent('os cliques dele são apagados')

    api.set('GET /links', () => json(page([])))
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText(/Você ainda não tem links/)).toBeInTheDocument()
    expect(api.callsTo('DELETE', '/links/APAGAR1')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancelar a confirmação não apaga', async () => {
    const api = mockApi({
      'GET /me': me,
      'GET /links': () => json(page([makeLink({ code: 'FICA123' })])),
    })
    const { user } = renderApp('/app/links')

    await user.click(await screen.findByRole('button', { name: 'Excluir localhost:8000/FICA123' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.callsTo('DELETE', '/links/:code')).toHaveLength(0)
  })

  it('a paginação muda ?page e busca a página certa', async () => {
    const api = mockApi({
      'GET /me': me,
      'GET /links': (call) =>
        json(page([makeLink({ code: `PAGINA${call.query.get('page')}` })], 45, Number(call.query.get('page')))),
    })
    const { user, router } = renderApp('/app/links')

    await screen.findByText('Página 1 de 3')
    await user.click(screen.getByRole('button', { name: 'Próxima' }))

    expect(await screen.findByText('localhost:8000/PAGINA2')).toBeInTheDocument()
    expect(currentPath(router)).toBe('/app/links?page=2')
    expect(api.callsTo('GET', '/links').at(-1)!.query.get('pageSize')).toBe('20')
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
  })

  it('copiar escreve o link curto na área de transferência', async () => {
    mockApi({ 'GET /me': me, 'GET /links': () => json(page([makeLink({ code: 'COPIAR1' })])) })
    const { user } = renderApp('/app/links')

    await user.click(await screen.findByRole('button', { name: 'Copiar localhost:8000/COPIAR1' }))

    expect(await screen.findByText('Copiado!')).toBeInTheDocument()
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe('http://localhost:8000/COPIAR1'),
    )
  })
})

describe('validade', () => {
  it('abre a lista, marca a opção atual e escolhe pelo teclado', async () => {
    mockApi({ 'GET /me': me, 'GET /links': () => json(page([])) })
    const { user } = renderApp('/app/links')
    const trigger = await screen.findByRole('button', { name: 'Validade 30 dias' })

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    const listbox = screen.getByRole('listbox', { name: 'Validade' })
    expect(within(listbox).getByRole('option', { name: '30 dias' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.keyboard('{ArrowDown}{Enter}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validade Sem validade' })).toHaveFocus()
  })

  it('Esc fecha a lista sem mudar a escolha', async () => {
    mockApi({ 'GET /me': me, 'GET /links': () => json(page([])) })
    const { user } = renderApp('/app/links')

    await user.click(await screen.findByRole('button', { name: 'Validade 30 dias' }))
    await user.keyboard('{ArrowUp}{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validade 30 dias' })).toBeInTheDocument()
  })
})

describe('ações da lista', () => {
  it('relatório e excluir são ícones com nome acessível e dica ao passar o mouse', async () => {
    mockApi({ 'GET /me': me, 'GET /links': () => json(page([makeLink({ code: 'ICONE12' })])) })
    const { user, router } = renderApp('/app/links')

    const report = await screen.findByRole('link', { name: 'Relatório de localhost:8000/ICONE12' })
    expect(report).toHaveAttribute('data-tooltip', 'Relatório')
    expect(report).not.toHaveTextContent(/\w/)
    expect(screen.getByRole('button', { name: 'Excluir localhost:8000/ICONE12' })).toHaveAttribute(
      'data-tooltip',
      'Excluir',
    )

    await user.click(report)
    // A tela de relatório é carregada sob demanda: a navegação termina quando o módulo chega.
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/links/ICONE12'))
  })

  it('a URL vinda da Home preenche o formulário e sai da barra de endereço', async () => {
    mockApi({ 'GET /me': me, 'GET /links': () => json(page([])) })
    const { router } = renderApp(`/app/links?url=${encodeURIComponent('https://vindo.da/home')}`)

    expect(await screen.findByLabelText('URL longa')).toHaveValue('https://vindo.da/home')
    await waitFor(() => expect(currentPath(router)).toBe('/app/links'))
  })
})
