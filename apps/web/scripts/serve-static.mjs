/**
 * Local preview of the production build: serves out/ like Cloudflare Pages and proxies /api/v1 to the API.
 *   npm run build && npm run preview      (PORT=3000, API_INTERNAL_URL=http://localhost:4000)
 * Used by the Playwright E2E job so tests run against the exact static artefact that ships.
 */
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'out');
const port = Number(process.env.PORT ?? 3000);
const api = new URL(process.env.API_INTERNAL_URL ?? 'http://localhost:4000');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function resolveFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [join(root, clean), join(root, `${clean}.html`), join(root, clean, 'index.html')];
  return candidates.find((p) => p.startsWith(root) && existsSync(p) && statSync(p).isFile());
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/v1/')) {
    const proxied = httpRequest({ hostname: api.hostname, port: api.port, path: url.pathname + url.search, method: req.method, headers: { ...req.headers, host: api.host, ...(process.env.ORIGIN_SECRET ? { 'x-origin-secret': process.env.ORIGIN_SECRET, 'x-client-ip': req.socket.remoteAddress ?? '' } : {}) } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    proxied.on('error', () => {
      res.writeHead(502).end('API unavailable');
    });
    req.pipe(proxied);
    return;
  }
  const file = resolveFile(url.pathname) ?? join(root, '404.html');
  res.writeHead(file.endsWith('404.html') && url.pathname !== '/404' ? 404 : 200, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': url.pathname.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`static preview on http://localhost:${port} → API ${api.origin}`));
