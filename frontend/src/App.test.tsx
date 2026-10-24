import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { ShortLink } from './api'

const LINK: ShortLink = {
  code: 'aB3xK9q',
  shortUrl: 'http://localhost:8000/aB3xK9q',
  originalUrl: 'https://exemplo.com/',
  expiresAt: '2026-11-16T12:40:08.419000Z',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function submit(url: string) {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByLabelText('URL longa'), url)
  await user.click(screen.getByRole('button', { name: 'Encurtar' }))
  return user
}

describe('App', () => {
  it('mostra o link curto, a URL normalizada pela API e a expiração em pt-BR', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(LINK, 201))

    await submit('HTTPS://Exemplo.com')

    const shortLink = await screen.findByRole('link', { name: 'localhost:8000/aB3xK9q' })
    expect(shortLink).toHaveAttribute('href', LINK.shortUrl)
    expect(shortLink).toHaveAttribute('target', '_blank')
    expect(shortLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('https://exemplo.com/')).toBeInTheDocument()
    // 12:40 UTC no fuso de São Paulo (fixado em vite.config.ts).
    expect(screen.getByText('16 de novembro de 2026 às 09:40')).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledOnce()
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/links')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ url: 'HTTPS://Exemplo.com' })
  })

  it.each([
    [422, { detail: [{ loc: ['body', 'url'], msg: 'invalid', type: 'url_parsing' }] }, 'URL inválida. Use um endereço começando com http:// ou https://'],
    [503, { detail: 'Could not generate a unique code' }, 'Não foi possível gerar o link agora. Tente de novo.'],
    [500, { detail: 'Internal Server Error' }, 'Não foi possível falar com o servidor.'],
  ])('mostra a mensagem do status %i ligada ao campo', async (status, body, message) => {
    mockFetch(async () => jsonResponse(body, status))

    await submit('https://exemplo.com')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    const input = screen.getByLabelText('URL longa')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(expect.stringContaining(message))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('mostra erro de servidor quando a rede falha', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await submit('https://exemplo.com')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor.',
    )
  })

  it('desabilita o botão durante o envio e não envia duas vezes', async () => {
    let resolve!: (response: Response) => void
    const fetchMock = mockFetch(() => new Promise<Response>((r) => (resolve = r)))

    const user = await submit('https://exemplo.com')

    const button = screen.getByRole('button', { name: /encurtando/i })
    expect(button).toBeDisabled()
    await user.click(button)
    await user.type(screen.getByLabelText('URL longa'), '{Enter}')
    expect(fetchMock).toHaveBeenCalledOnce()

    resolve(jsonResponse(LINK, 201))
    expect(await screen.findByRole('button', { name: 'Encurtar' })).toBeEnabled()
  })

  it('copia o link curto e confirma', async () => {
    mockFetch(async () => jsonResponse(LINK, 201))

    const user = await submit('https://exemplo.com')
    await user.click(await screen.findByRole('button', { name: 'Copiar' }))

    expect(screen.getByRole('button', { name: 'Copiado!' })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(LINK.shortUrl)
  })

  it('valida no cliente sem chamar a API', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(LINK, 201))

    await submit('exemplo.com')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'URL inválida. Use um endereço começando com http:// ou https://',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('permite encurtar outra URL depois de um sucesso', async () => {
    const second: ShortLink = { ...LINK, code: 'Zz9Yy8x', shortUrl: 'http://localhost:8000/Zz9Yy8x' }
    const fetchMock = mockFetch(async () => jsonResponse(LINK, 201))
    fetchMock.mockImplementationOnce(async () => jsonResponse(LINK, 201))
    fetchMock.mockImplementationOnce(async () => jsonResponse(second, 201))

    const user = await submit('https://exemplo.com')
    await screen.findByRole('link', { name: 'localhost:8000/aB3xK9q' })

    const input = screen.getByLabelText('URL longa')
    await user.clear(input)
    await user.type(input, 'https://outro.com')
    await user.click(screen.getByRole('button', { name: 'Encurtar' }))

    expect(await screen.findByRole('link', { name: 'localhost:8000/Zz9Yy8x' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'localhost:8000/aB3xK9q' })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
