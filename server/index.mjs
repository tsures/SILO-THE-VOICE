import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './api.mjs';
import { createConfig } from './config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const config = createConfig();
const production = process.argv.includes('--production');
const api = createApiHandler(config);
let vite;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const dist = path.join(root, 'dist');
if (production) {
  try { await stat(path.join(dist, 'index.html')); } catch { console.error('Build missing. Run npm run build before npm start.'); process.exit(1); }
}
const server = createServer(async (req, res) => {
  try {
    if (![`localhost:${config.port}`, `127.0.0.1:${config.port}`].includes(req.headers.host)) {
      res.writeHead(403); res.end('Invalid host. Open the app using localhost.'); return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), display-capture=()');
    if (await api(req, res)) return;
    if (vite) { vite.middlewares(req, res); return; }
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.openai.com wss://api.openai.com; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const content = await readFile(file);
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404); res.end('Not found'); }
  } catch (error) {
    console.error('Request failed:', error.name);
    if (!res.headersSent) res.writeHead(500);
    res.end('Local server error.');
  }
});
if (!production) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server } } });
}
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT in .env to another port.` : error.message); process.exitCode = 1; });
server.listen(config.port, '127.0.0.1', () => {
  console.log(`The Voice: http://localhost:${config.port}`);
  console.log(`Mode: ${production ? 'production' : 'development'} | Model: ${config.model} | Voice: ${config.voice}`);
  if (!config.apiKey) console.log('Add OPENAI_API_KEY to .env and restart to enable voice. Visual preview works without a key.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(() => process.exit(0));
  void vite?.close();
  setTimeout(() => process.exit(0), 1500).unref();
});
