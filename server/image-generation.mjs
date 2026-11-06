/** Image generation is performed only by the local Node server, never by the browser. */
const MAX_PROMPT_LENGTH = 2000;
const SIZE_MAP = { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' };
const BACKGROUNDS = new Set(['auto', 'opaque', 'transparent']);

function reply(res, status, payload) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}

async function readRequest(req) {
  let length = 0;
  const chunks = [];
  for await (const part of req) {
    length += part.length;
    if (length > 8192) throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(part);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Expected a JSON image request.'), { status: 400 }); }
}

function extractImage(response) {
  const item = (response?.output || []).find(output => output?.type === 'image_generation_call' && typeof output?.result === 'string');
  if (!item?.result) return null;
  const format = item.output_format || 'png';
  return {
    imageDataUrl: `data:image/${format};base64,${item.result}`,
    revisedPrompt: String(item.revised_prompt || '').slice(0, 4000),
    format,
    size: item.size || null,
    background: item.background || 'auto'
  };
}

export function createImageGenerationHandler(config, fetchImpl = fetch) {
  let attempts = [];
  let active = 0;
  return async function handleImage(req, res) {
    if (req.method !== 'POST') { reply(res, 405, { error: 'Use POST.' }); return true; }
    if (!config.allowedOrigins.has(req.headers.origin) || req.headers['x-silo-client'] !== '1') {
      reply(res, 403, { error: 'Only this local application may generate images.' }); return true;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      reply(res, 415, { error: 'Expected JSON.' }); return true;
    }
    if (!config.apiKey || config.apiKey.includes('replace-me')) {
      reply(res, 503, { error: 'API key is not configured.' }); return true;
    }
    if (Number(req.headers['content-length']) > 8192) {
      req.resume(); reply(res, 413, { error: 'Request too large.' }); return true;
    }
    let input;
    try { input = await readRequest(req); }
    catch (err) { reply(res, err.status || 400, { error: err.message }); return true; }
    const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
    const requestedSize = typeof input?.size === 'string' ? input.size : 'square';
    const size = SIZE_MAP[requestedSize] || SIZE_MAP.square;
    const background = typeof input?.background === 'string' && BACKGROUNDS.has(input.background) ? input.background : 'auto';
    if (prompt.length < 3 || prompt.length > MAX_PROMPT_LENGTH) {
      reply(res, 400, { error: 'Prompt must be between 3 and 2000 characters.' }); return true;
    }
    const now = Date.now();
    attempts = attempts.filter(time => now - time < 60_000);
    if (attempts.length >= 6 || active >= 1) {
      res.setHeader('Retry-After', '60');
      reply(res, 429, { error: 'Image generation limit reached. Try again shortly.' });
      return true;
    }
    active++;
    attempts.push(now);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}`, 'OpenAI-Safety-Identifier': config.safetyId },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.imageReasoningModel,
          store: false,
          safety_identifier: config.safetyId,
          input: `Generate a single image that matches this request: ${prompt}`,
          tools: [{
            type: 'image_generation',
            model: config.imageModel,
            action: 'generate',
            size,
            background,
            output_format: 'png',
            quality: 'medium'
          }],
          tool_choice: { type: 'image_generation' }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const blocked = payload?.error?.code === 'moderation_blocked';
        const error = blocked ? 'The image request was blocked by safety moderation.'
          : response.status === 429 ? 'OpenAI image generation rate limit or billing quota reached.'
          : response.status === 401 ? 'OpenAI rejected the API key.'
          : response.status === 403 ? 'This API project cannot use image generation.'
          : 'OpenAI image generation was unavailable.';
        reply(res, response.status >= 400 && response.status < 600 ? response.status : 502, { error });
        return true;
      }
      const image = extractImage(payload);
      if (!image) {
        reply(res, 502, { error: 'Image generation completed without returning an image.' });
        return true;
      }
      reply(res, 200, { ...image, prompt: prompt.slice(0, 2000) });
    } catch (error) {
      reply(res, controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? 'Image generation timed out.' : 'Could not reach the image generation service.' });
    } finally {
      active--;
      clearTimeout(timeout);
      res.off('close', close);
    }
    return true;
  };
}
