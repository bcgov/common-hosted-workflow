import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src'],
  format: ['cjs'],
  clean: true,
  splitting: false,
  cjsInterop: false,
  minify: false,
  external: [/^(\/usr\/local\/lib\/node_modules\/n8n)/],
  footer: {
    js: '',
  },
});
