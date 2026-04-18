/**
 * seedance-proxy.js
 * Local CORS proxy for SEedance / BytePlus ModelArk video generation API.
 * No npm dependencies — uses only Node.js built-ins.
 *
 * Routes:
 *   POST /seedance/video/generate   → POST /api/v3/contents/generations/tasks
 *   GET  /seedance/video/task/:id   → GET  /api/v3/contents/generations/tasks/:id
 *
 * Also supports legacy /v1 paths for backward compatibility.
 *
 * Usage:  node seedance-proxy.js
 *         (runs on http://localhost:3001)
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

const PROXY_PORT = 3001;

// BytePlus ModelArk — the real, reachable endpoint
const ARK_HOST = 'ark.ap-southeast.bytepluses.com';
const ARK_BASE = '/api/v3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function proxyRequest(req, res, targetHost, targetPath) {
  const options = {
    hostname: targetHost,
    port:     443,
    path:     targetPath,
    method:   req.method,
    headers: {
      'Content-Type':  req.headers['content-type']  || 'application/json',
      'Authorization': req.headers['authorization'] || '',
      'User-Agent':    'MagicLens-Proxy/1.0',
    },
  };

  console.log(`[proxy] ${req.method} ${req.url} → https://${targetHost}${targetPath}`);

  const proxyReq = https.request(options, (proxyRes) => {
    const responseHeaders = Object.assign({}, CORS_HEADERS, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
    });
    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy error]', err.message);
    res.writeHead(502, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'proxy_error', message: err.message }));
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  // Pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsed = url.parse(req.url);
  const path   = parsed.pathname;

  // Health check
  if (path === '/health') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
    res.end(JSON.stringify({ status: 'ok', proxy: 'seedance', target: ARK_HOST }));
    return;
  }

  if (!path.startsWith('/seedance/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found — use /seedance/* paths');
    return;
  }

  // Strip /seedance prefix
  const subPath = path.replace(/^\/seedance/, '');

  // Route mapping:
  //   /video/generate  (or legacy /v1/video/generate)
  //   /video/task/:id  (or legacy /v1/video/task/:id)
  if ((subPath === '/video/generate' || subPath === '/v1/video/generate') && req.method === 'POST') {
    proxyRequest(req, res, ARK_HOST, `${ARK_BASE}/contents/generations/tasks`);
    return;
  }

  const taskMatch = subPath.match(/^(?:\/v1)?\/video\/task\/([^/?]+)/);
  if (taskMatch && req.method === 'GET') {
    const taskId = taskMatch[1];
    proxyRequest(req, res, ARK_HOST, `${ARK_BASE}/contents/generations/tasks/${taskId}`);
    return;
  }

  // Fallback: pass through any other /seedance/* path directly
  proxyRequest(req, res, ARK_HOST, ARK_BASE + subPath);
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`[seedance-proxy] listening on http://localhost:${PROXY_PORT}`);
  console.log(`[seedance-proxy] /seedance/video/generate → https://${ARK_HOST}${ARK_BASE}/contents/generations/tasks`);
  console.log(`[seedance-proxy] /seedance/video/task/:id → https://${ARK_HOST}${ARK_BASE}/contents/generations/tasks/:id`);
});
