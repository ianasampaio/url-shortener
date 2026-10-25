import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { consumeSessionExpired } from '../api/session'

// O jsdom não implementa o <dialog> modal; o navegador real sim. Basta abrir e fechar.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

// O ResponsiveContainer do Recharts observa o tamanho do elemento; o jsdom não tem
// ResizeObserver nem layout. Os testes conferem a tabela equivalente, não o SVG.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

afterEach(() => {
  cleanup()
  // O tema escolhido fica no <html> e no localStorage; não pode vazar para o próximo teste.
  localStorage.clear()
  delete document.documentElement.dataset.theme
  consumeSessionExpired()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
