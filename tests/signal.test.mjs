import test from 'node:test';
import assert from 'node:assert/strict';
import { measureSignal, damp } from '../src/audio/signal.js';

test('digital silence produces zero energy and zero bands', () => {
  assert.deepEqual(measureSignal(new Float32Array(64), new Uint8Array(32), 48000), { level: 0, low: 0, mid: 0, high: 0 });
});
test('full scale waveform clamps to one without NaN', () => {
  const s = measureSignal(new Float32Array(64).fill(1), new Uint8Array(32).fill(255), 48000);
  assert.equal(s.level, 1);
  for (const value of Object.values(s)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
});
test('zero length buffers are safe', () => {
  assert.equal(measureSignal(new Float32Array(), new Uint8Array(), 48000).level, 0);
});
test('damping is time-based rather than frame-count-based', () => {
  const one = damp(0, 1, 8, 1 / 30);
  const two = damp(damp(0, 1, 8, 1 / 60), 1, 8, 1 / 60);
  assert.ok(Math.abs(one - two) < 1e-10);
});
