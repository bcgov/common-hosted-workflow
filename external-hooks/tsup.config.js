"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tsup_1 = require("tsup");
exports.default = (0, tsup_1.defineConfig)({
    entry: ['src'],
    format: ['cjs'],
    clean: true,
    splitting: false,
    cjsInterop: false,
    minify: false,
    external: [/^(\/usr\/local\/lib\/node_modules\/n8n)/],
    noExternal: ['drizzle-orm', 'pg'],
    footer: {
        js: '',
    },
});
