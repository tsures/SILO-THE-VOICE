import { sessionConfig } from './config.mjs';
import { createWebSearchHandler } from './web-search.mjs';
import { createImageGenerationHandler } from './image-generation.mjs';

function json(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw Object.assign(new Error('Session request is too large.'), { status: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts).toString('utf8');
}

export function createApiHandler(config, fetchImpl = fetch) {
  // Only loopback clients can reach this local application. No public-user authentication is implemented.
  let attempts = [];
  const webSearch = createWebSearchHandler(config, fetchImpl);
  const imageGeneration = createImageGenerationHandler(config, fetchImpl);
  return async function handle(req, res) {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (!path.startsWith('/api/')) return false;
    if (path === '/api/health' && req.method === 'GET') {
      json(res, 200, { configured: Boolean(config.apiKey && !config.apiKey.includes('replace-me')), model: config.model, voice: config.voice });
      return true;
    }
    if (path === '/api/search') return webSearch(req, res);
    if (path === '/api/image') return imageGeneration(req, res);
    if (path !== '/api/session') { json(res, 404, { error: 'Unknown API endpoint.' }); return true; }
    if (req.method !== 'POST') { json(res, 405, { error: 'Use POST.' }); return true; }
    if (!config.allowedOrigins.has(req.headers.origin) || req.headers['x-silo-client'] !== '1') {
      json(res, 403, { error: 'Session requests must originate from this local application.' }); return true;
    }
    if (!req.headers['content-type']?.startsWith('application/sdp')) {
      json(res, 415, { error: 'Expected application/sdp.' }); return true;
    }
    if (!config.apiKey || config.apiKey.includes('replace-me')) {
      json(res, 503, { error: 'Set OPENAI_API_KEY in the local .env file, then restart the server.' }); return true;
    }
    if (Number(req.headers['content-length']) > 65536) {
      req.resume(); json(res, 413, { error: 'Session request is too large.' }); return true;
    }
    const now = Date.now();
    attempts = attempts.filter(time => now - time < 60000);
    if (attempts.length >= 6) {
      res.setHeader('Retry-After', '60'); json(res, 429, { error: 'Too many connection attempts. Retry in one minute.' }); return true;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const sdp = await readBody(req, 65536);
      if (!sdp.startsWith('v=0') || !sdp.includes('m=audio')) {
        json(res, 400, { error: 'Invalid audio SDP offer.' }); return true;
      }
      attempts.push(now);
      const body = new FormData();
      body.set('sdp', sdp);
      body.set('session', JSON.stringify(sessionConfig(config)));
      const upstream = await fetchImpl('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'OpenAI-Safety-Identifier': config.safetyId },
        body,
        signal: controller.signal
      });
      const answer = await upstream.text();
      if (!upstream.ok) {
        const messages = {
          400: 'OpenAI rejected the session configuration. Check the model, voice and transcription settings in .env.',
          401: 'OpenAI rejected the API key. Check OPENAI_API_KEY and restart the server.',
          403: 'This API project does not have permission to use the requested model.',
          404: 'The requested Realtime model or API endpoint is unavailable to this project.',
          429: 'OpenAI rejected the request because of quota or rate limits. Check API billing and project limits.'
        };
        json(res, upstream.status, { error: messages[upstream.status] || 'The OpenAI service could not create a voice session.', requestId: upstream.headers.get('x-request-id') });
        return true;
      }
      if (!answer.startsWith('v=0')) {
        json(res, 502, { error: 'OpenAI returned an unexpected session response.' }); return true;
      }
      if (!res.destroyed) {
        res.writeHead(201, { 'Content-Type': 'application/sdp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(answer);
      }
    } catch (error) {
      json(res, error.status || (controller.signal.aborted ? 504 : 502), {
        error: error.status ? error.message : controller.signal.aborted ? 'The voice connection timed out. Try connecting again.' : 'Cannot reach OpenAI. Check the server network connection.'
      });
    } finally { clearTimeout(timer); res.off('close', close); }
    return true;
  };
}
