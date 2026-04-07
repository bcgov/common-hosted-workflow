/**
 * Tiny dev server that serves the dashboard and proxies /rest/* to n8n,
 * eliminating CORS issues entirely (same-origin requests).
 *
 * Usage:  node server.js
 * Then open http://localhost:8081
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8081;
const N8N_TARGET = process.env.N8N_TARGET || 'http://localhost:5678';

const server = http.createServer((req, res) => {
  // Proxy any /rest/* or /webhook* request to n8n
  if (req.url.startsWith('/rest/') || req.url.startsWith('/webhook')) {
    const target = new URL(req.url, N8N_TARGET);
    const proxyOpts = {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    };

    const proxyReq = http.request(proxyOpts, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  // Serve static files from this directory
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Dashboard → http://localhost:${PORT}`);
  console.log(`Proxying /rest/* → ${N8N_TARGET}`);
});
