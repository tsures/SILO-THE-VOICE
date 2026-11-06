import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageGenerationHandler } from '../server/image-generation.mjs';
import { createConfig } from '../server/config.mjs';
import { createServer } from 'node:http';

async function fixture(t, upstream = async () => new Response(JSON.stringify({ output: [{ type: 'image_generation_call', result: 'aGVsbG8=', output_format: 'png' }] }), { status: 200 })) {
  const config = createConfig({ OPENAI_API_KEY: 'sk-unit-test-not-a-real-key', PORT: '3000' });
  const handle = createImageGenerationHandler(config, upstream);
  const server = createServer(async (req, res) => { if (!await handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body = { prompt: 'Draw a blue logo' }, headers = {}) => fetch(`${url}/api/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', 'X-Silo-Client': '1', ...headers },
    body: JSON.stringify(body)
  });
  return { post };
}

test('image generation endpoint returns a data URL', async t => {
  const { post } = await fixture(t);
  const r = await post();
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.match(body.imageDataUrl, /^data:image\/png;base64,/);
});

test('image generation validates prompt length', async t => {
  const { post } = await fixture(t);
  const r = await post({ prompt: 'x' });
  assert.equal(r.status, 400);
});
