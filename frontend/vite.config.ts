import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// A API não tem CORS: em dev o Vite encaminha /links para ela e o front usa caminho relativo.
const API_URL = 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/links': API_URL,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Fuso fixo para o teste da data de expiração não depender da máquina.
    env: { TZ: 'America/Sao_Paulo' },
  },
})
