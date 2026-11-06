# Verification record - 2026-11-05

## Executed successfully

- `npm test`: **25 tests, 25 passed, 0 failed** using Node's built-in test runner.
- Server tests use real HTTP requests to a local Node server; only the outbound OpenAI HTTP exchange is replaced with controlled responses. Tests cover absent keys, bad origins, invalid/oversized SDP, rate limits, current session configuration, upstream authentication and secret-safe error responses.
- State tests cover late transcription ordering, delta/final transcript handling, interrupted transcripts, bounded history and the distinction between generation completion and audio playback completion.
- Client lifecycle tests use controlled browser-API substitutes to cover late microphone permission after cancellation, failed handshakes, track mute/stop, duplicate starts, stale events and unexpected channel closure.
- Four JSX files parsed/transpiled with an installed TypeScript compiler. This is a syntax check, not TypeScript typing or Vite bundling.
- All ordinary `.js`/`.mjs` implementation modules passed Node syntax checking.
- An isolated real Chromium test drew the actual Canvas renderer at desktop and 390px mobile width and verified the reduced-motion behavior.
- The actual AudioGraph analysed a real browser-generated 440 Hz MediaStream, measured nonzero output energy and cleaned up its playback/audio context.

## Not executed successfully / not verified

- npm dependency download: external DNS/network unavailable in the authoring environment.
- Full build: `npm run build` could not execute because Vite could not be installed (`vite: not found`). This is not a successful build result.
- Full React browser UI and real peer-to-peer WebRTC: local-page navigation was blocked by the browser environment policy. The isolated Canvas/audio test does not substitute for those tests.
- Real OpenAI authentication, account/model access, billing, transcript quality, assistant speech quality, network latency and end-to-end live conversation: no real API key was available or used.
- No package lock was generated because dependencies were not resolved. `npm install` will generate one locally.

The code received a self-review, not an independent reviewer pass.

## Local acceptance check

After installing dependencies and setting a real local key:

1. Run `npm test` and `npm run build`.
2. Start the app, connect and allow the microphone. Confirm that the assistant's greeting is audible.
3. Speak and wait for a reply. Confirm that the central sculpture follows output audio, while the separate microphone meter follows your input.
4. Interrupt a reply. Confirm playback stops and the next user turn is accepted.
5. Mute and unmute. Confirm the assistant no longer receives microphone audio while muted.
6. End. Confirm the browser microphone indicator is released. Reconnect and confirm a new transcript begins.
7. Test permission denial, invalid key/quota errors, resize and transcript expansion on the actual browser.
