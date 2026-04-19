/**
 * seedance-proxy.js
 * Local CORS proxy for SEedance / BytePlus ModelArk video generation API.
 * No npm dependencies — uses only Node.js built-ins.
 *
 * Routes:
 *   POST /seedance/video/generate   → POST /api/v3/contents/generations/tasks
 *   GET  /seedance/video/task/:id   → GET  /api/v3/contents/generations/tasks/:id
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
  // Buffer the request body so we can log it
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const reqBody = Buffer.concat(chunks);

    const options = {
      hostname: targetHost,
      port:     443,
      path:     targetPath,
      method:   req.method,
      headers: {
        'Content-Type':    req.headers['content-type']  || 'application/json',
        'Authorization':   req.headers['authorization'] || '',
        'Content-Length':  reqBody.length,
        'User-Agent':      'MagicLens-Proxy/1.0',
      },
    };

    console.log(`\n[proxy] ${req.method} ${req.url}`);
    console.log(`        → https://${targetHost}${targetPath}`);
    if (reqBody.length > 0) {
      try { console.log(`        REQ: ${reqBody.toString().substring(0, 300)}`); } catch(e) {}
    }

    const proxyReq = https.request(options, (proxyRes) => {
      // Buffer the response body for logging
      const respChunks = [];
      proxyRes.on('data', chunk => respChunks.push(chunk));
      proxyRes.on('end', () => {
        const respBody = Buffer.concat(respChunks);
        console.log(`        STATUS: ${proxyRes.statusCode}`);
        try { console.log(`        RES: ${respBody.toString().substring(0, 400)}`); } catch(e) {}

        const responseHeaders = Object.assign({}, CORS_HEADERS, {
          'Content-Type':   proxyRes.headers['content-type'] || 'application/json',
          'Content-Length': respBody.length,
        });
        res.writeHead(proxyRes.statusCode, responseHeaders);
        res.end(respBody);
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[proxy error]', err.message);
      res.writeHead(502, CORS_HEADERS);
      res.end(JSON.stringify({ error: 'proxy_error', message: err.message }));
    });

    proxyReq.write(reqBody);
    proxyReq.end();
  });
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

  // Route mapping
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
  console.log(`[seedance-proxy] Full request/response logging enabled`);
});
