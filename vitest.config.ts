import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// Carrega todas as variáveis do .env da raiz do projeto usando o utilitário nativo do Vite
const env = loadEnv('test', process.cwd(), '');
process.env = { ...process.env, ...env };

export default defineConfig({
  test: {
    environment: 'node',
  },
});