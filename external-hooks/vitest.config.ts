import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/api/**/*.ts'],
      exclude: ['src/api/swagger-ui.ts', 'src/api/openapi.json'],
    },
  },
});
