'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.mountAssets = mountAssets;
const express_1 = require('express');
const _config_1 = require('@config');
function mountAssets(app, assetsPath = _config_1.EXTERNAL_HOOK_ASSETS_PATH) {
  app.use(
    '/assets',
    (0, express_1.static)(assetsPath, {
      index: false,
      maxAge: '1h',
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }),
  );
}
