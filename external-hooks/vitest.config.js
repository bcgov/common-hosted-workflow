'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const node_path_1 = __importDefault(require('node:path'));
const config_1 = require('vitest/config');
exports.default = (0, config_1.defineConfig)({
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@config': node_path_1.default.resolve(__dirname, 'src/config.ts'),
    },
  },
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
