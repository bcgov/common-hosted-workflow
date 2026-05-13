import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  base: '/ui/',
  plugins: [tailwindcss(), react()],
  server: {
    watch: {
      ignored: ['**/node_modules/**', '**/.pnpm/**'],
    },
  },
});
