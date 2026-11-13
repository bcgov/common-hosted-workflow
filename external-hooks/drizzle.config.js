'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const drizzle_kit_1 = require('drizzle-kit');
exports.default = (0, drizzle_kit_1.defineConfig)({
  schema: './src/db/schema/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CUSTOM_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/n8n_custom', // pragma: allowlist secret
  },
});
