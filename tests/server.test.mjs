import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApiHandler } from '../server/api.mjs';
import { createConfig, sessionConfig } from '../server/config.mjs';

async function fixture(t, env = {}, upstream = async () => new Response('v=0\r\nanswer', { status: 201 })) {
  const config = createConfig({ OPENAI_API_KEY: 'sk-unit-test-not-a-real-key', PORT: '3000', ...env });
  const handle = createApiHandler(config, upstream);
  const server = createServer(async (req, res) => { if (!await handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', headers = {}) => fetch(`${url}/api/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Origin: 'http://localhost:3000', 'X-Silo-Client': '1', ...headers }, body
  });
  return { config, url, post };
}
test('server configuration uses current GA audio and VAD shape', () => {
  const config = sessionConfig(createConfig({}));
  assert.equal(config.type, 'realtime');
  assert.equal(config.audio.input.turn_detection.interrupt_response, true);
  assert.equal(config.audio.input.turn_detection.create_response, true);
  assert.deepEqual(config.output_modalities, ['audio']);
  assert.ok(!('apiKey' in config));
});
test('missing API key fails locally without contacting OpenAI', async t => {
  let calls = 0;
  const { post } = await fixture(t, { OPENAI_API_KEY: '' }, async () => { calls++; throw Error(); });
  const r = await post();
  assert.equal(r.status, 503); assert.equal(calls, 0);
  assert.match((await r.json()).error, /OPENAI_API_KEY/);
});
test('foreign origins are rejected before upstream requests', async t => {
  let calls = 0;
  const { post } = await fixture(t, {}, async () => { calls++; throw Error(); });
  assert.equal((await post(undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal(calls, 0);
});
test('malformed SDP does not create a session', async t => {
  const { post } = await fixture(t);
  assert.equal((await post('not sdp')).status, 400);
});
test('oversized session requests are rejected', async t => {
  const { post } = await fixture(t);
  assert.equal((await post('v=0\r\nm=audio ' + 'x'.repeat(70000))).status, 413);
});
test('upstream exchange uses server key and only returns SDP', async t => {
  let captured;
  const { post } = await fixture(t, {}, async (url, options) => {
    captured = { url, options, session: JSON.parse(options.body.get('session')) };
    return new Response('v=0\r\nanswer', { status: 201 });
  });
  const r = await post();
  assert.equal(r.status, 201);
  assert.equal(await r.text(), 'v=0\r\nanswer');
  assert.equal(captured.url, 'https://api.openai.com/v1/realtime/calls');
  assert.match(captured.options.headers.Authorization, /^Bearer sk-unit-test/);
  assert.equal(captured.session.type, 'realtime');
  assert.match(captured.options.body.get('sdp'), /^v=0/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('upstream authentication errors never disclose keys', async t => {
  const { post } = await fixture(t, {}, async () => new Response(JSON.stringify({ error: { message: 'Bad sk-secret', code: 'invalid_api_key' } }), { status: 401 }));
  const r = await post();
  assert.equal(r.status, 401);
  assert.ok(!(await r.text()).includes('sk-secret'));
});
test('session creation is rate limited', async t => {
  const { post } = await fixture(t);
  for (let i = 0; i < 6; i++) assert.equal((await post()).status, 201);
  assert.equal((await post()).status, 429);
});
test('invalid port is rejected rather than binding unpredictably', () => {
  assert.throws(() => createConfig({ PORT: 'abc' }), /PORT/);
});
