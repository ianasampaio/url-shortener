import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// A API não tem CORS: em dev o Vite encaminha /api para ela e o front usa caminho relativo.
// O cookie de sessão funciona pelo proxy, e a origem http://localhost:5173 está em
// ALLOWED_ORIGINS no backend.
const API_URL = 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': API_URL,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Fuso fixo para as datas e os períodos do relatório não dependerem da máquina.
    env: { TZ: 'America/Sao_Paulo' },
  },
})
