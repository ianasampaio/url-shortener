import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { json, mockApi, page, USER } from '../test/api'
import { currentPath, renderApp } from '../test/render'

describe('conta', () => {
  it('mostra o e-mail e a data de criação', async () => {
    mockApi({ 'GET /me': () => json(USER) })
    renderApp('/app/account')

    await screen.findByRole('heading', { name: 'Minha conta' })
    expect(screen.getAllByText('iana@exemplo.com').length).toBeGreaterThan(0)
    expect(screen.getByText('1 de outubro de 2026')).toBeInTheDocument()
  })

  it('excluir pede confirmação, apaga e leva à Home', async () => {
    const api = mockApi({ 'GET /me': () => json(USER), 'DELETE /me': () => json(null, 204) })
    const { user, router } = renderApp('/app/account')

    await screen.findByRole('heading', { name: 'Minha conta' })
    const section = screen.getByRole('region', { name: 'Excluir conta' })
    await user.click(within(section).getByRole('button', { name: 'Excluir conta' }))
    const dialog = screen.getByRole('dialog', { name: 'Excluir a conta?' })
    expect(dialog).toHaveTextContent('todos os seus links e todos os cliques deles')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir conta' }))

    await screen.findByRole('heading', { name: 'Encurte links e acompanhe cada clique' })
    expect(currentPath(router)).toBe('/')
    expect(api.callsTo('DELETE', '/me')).toHaveLength(1)
  })

  it('rota desconhecida mostra "página não encontrada"', async () => {
    mockApi({ 'GET /me': () => json(USER) })
    renderApp('/qualquer/coisa')

    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
  })
})

describe('navegação da conta', () => {
  it('"Meus links" volta para o painel', async () => {
    mockApi({ 'GET /me': () => json(USER), 'GET /links': () => json(page([])) })
    const { user, router } = renderApp('/app/account')

    await user.click(await screen.findByRole('link', { name: '← Meus links' }))

    await screen.findByRole('heading', { name: 'Meus links' })
    expect(router.state.location.pathname).toBe('/app/links')
  })

  it('a conta não tem o rodapé de crédito', async () => {
    mockApi({ 'GET /me': () => json(USER) })
    renderApp('/app/account')

    await screen.findByRole('heading', { name: 'Minha conta' })
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })
})
