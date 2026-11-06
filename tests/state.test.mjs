import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduceEvent, activity } from '../src/realtime/state.js';

test('response generation finishing does not end buffered audio playback', () => {
  let s = { ...initialState(), connection: 'connected' };
  s = reduceEvent(s, { type: 'response.created' });
  s = reduceEvent(s, { type: 'output_audio_buffer.started' });
  s = reduceEvent(s, { type: 'response.done', response: { status: 'completed' } });
  assert.equal(activity(s), 'speaking');
  s = reduceEvent(s, { type: 'output_audio_buffer.stopped' });
  assert.equal(activity(s), 'listening');
});
test('late user transcription fills its original place before the assistant', () => {
  let s = initialState();
  s = reduceEvent(s, { type: 'input_audio_buffer.committed', item_id: 'u1' });
  s = reduceEvent(s, { type: 'response.output_audio_transcript.delta', item_id: 'a1', delta: 'Hello' });
  s = reduceEvent(s, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Hi' });
  assert.deepEqual(s.messages.map(m => [m.role, m.text]), [['user', 'Hi'], ['assistant', 'Hello']]);
});
test('final transcripts replace deltas instead of repeating them', () => {
  let s = reduceEvent(initialState(), { type: 'response.output_audio_transcript.delta', item_id: 'a', delta: 'Hel' });
  s = reduceEvent(s, { type: 'response.output_audio_transcript.delta', item_id: 'a', delta: 'lo' });
  s = reduceEvent(s, { type: 'response.output_audio_transcript.done', item_id: 'a', transcript: 'Hello!' });
  assert.equal(s.messages[0].text, 'Hello!');
  assert.equal(s.messages[0].complete, true);
});
test('an interrupted transcript is not represented as fully heard speech', () => {
  let s = reduceEvent(initialState(), { type: 'response.output_audio_transcript.done', item_id: 'a', transcript: 'A long answer' });
  s = reduceEvent(s, { type: 'conversation.item.truncated', item_id: 'a' });
  assert.equal(s.messages[0].interrupted, true);
  assert.equal(s.messages[0].text, '');
});
test('unknown and malformed events do not alter the session', () => {
  const s = initialState();
  assert.equal(reduceEvent(s, { type: 'future.event' }), s);
  assert.equal(reduceEvent(s, null), s);
});
test('transcripts are bounded in memory', () => {
  let s = initialState();
  for (let i = 0; i < 140; i++) s = reduceEvent(s, { type: 'input_audio_buffer.committed', item_id: String(i) });
  assert.equal(s.messages.length, 100);
});
