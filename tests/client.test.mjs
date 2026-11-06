import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeClient } from '../src/realtime/RealtimeClient.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup(options = {}) {
  const tracks = [{ enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; }, addEventListener() {} }];
  const stream = { getTracks: () => tracks, getAudioTracks: () => tracks };
  const channel = { readyState: 'open', send() {}, close() { this.readyState = 'closed'; } };
  const peer = { connectionState: 'new', createDataChannel: () => channel, addTrack() {},
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\nm=audio 9' }; }, async setLocalDescription(d) { this.localDescription = d; },
    async setRemoteDescription() {}, close() { this.connectionState = 'closed'; } };
  const graph = { connectMicrophone() {}, connectOutput: async () => true, resume: async () => true,
    close() {}, read: () => ({ input: { level: 0 }, output: { level: 0 } }) };
  const client = new RealtimeClient({
    isSupported: () => true, makePeer: () => peer, getMicrophone: async () => stream, makeGraph: () => graph,
    fetchImpl: async () => new Response('v=0\r\nanswer', { status: 201 }), ...options
  });
  return { client, peer, channel, stream, tracks };
}
test('cancelling while permission is pending stops a late-granted microphone', async () => {
  const permission = deferred();
  const f = setup({ getMicrophone: () => permission.promise });
  const starting = f.client.start();
  f.client.stop();
  permission.resolve(f.stream);
  await starting;
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.equal(f.client.state.connection, 'idle');
});
test('a failed handshake releases microphone and peer', async () => {
  const f = setup({ fetchImpl: async () => new Response(JSON.stringify({ error: 'API billing required' }), { status: 429 }) });
  await f.client.start();
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.equal(f.peer.connectionState, 'closed');
  assert.equal(f.client.state.connection, 'error');
  assert.equal(f.client.state.error, 'API billing required');
});
test('mute disables the actual outbound audio track and end releases it', async () => {
  const f = setup();
  await f.client.start();
  f.channel.onmessage({ data: JSON.stringify({ type: 'session.created' }) });
  assert.equal(f.client.state.connection, 'connected');
  f.client.toggleMute();
  assert.equal(f.tracks[0].enabled, false);
  assert.equal(f.client.state.muted, true);
  f.client.stop();
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.equal(f.peer.connectionState, 'closed');
});
test('stale data-channel callbacks cannot resurrect a stopped session', async () => {
  const f = setup();
  await f.client.start();
  const callback = f.channel.onmessage;
  f.client.stop();
  callback({ data: JSON.stringify({ type: 'session.created' }) });
  assert.equal(f.client.state.connection, 'idle');
});
test('unexpected data-channel closure releases media', async () => {
  const f = setup();
  await f.client.start();
  f.channel.onclose();
  assert.equal(f.client.state.connection, 'error');
  assert.equal(f.tracks[0].readyState, 'ended');
});
test('duplicate Start during pending permission does not acquire a second microphone', async () => {
  const d = deferred(); let requests = 0;
  const f = setup({ getMicrophone: () => { requests++; return d.promise; } });
  const one = f.client.start(); const two = f.client.start();
  await tick(); assert.equal(requests, 1);
  f.client.stop(); d.resolve(f.stream); await Promise.all([one, two]);
});
