import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { json, mockApi } from './test/api'
import { renderApp } from './test/render'
import { THEME_STORAGE_KEY } from './theme'

const loggedOut = () => json({ detail: 'Not authenticated' }, 401)

describe('tema', () => {
  it('alterna entre claro e escuro e lembra a escolha', async () => {
    mockApi({ 'GET /me': loggedOut })
    const { user } = renderApp('/')

    // Sem escolha salva, segue o sistema (claro no jsdom).
    const toEscuro = await screen.findByRole('button', { name: 'Usar tema escuro' })
    expect(document.documentElement.dataset.theme).toBeUndefined()

    await user.click(toEscuro)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Usar tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('começa pela escolha salva', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    mockApi({ 'GET /me': loggedOut })
    renderApp('/')

    expect(await screen.findByRole('button', { name: 'Usar tema claro' })).toBeInTheDocument()
  })
})
