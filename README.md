# The Voice - Stage 1

A local React application with a Silo-inspired animated voice display and an in-app OpenAI Realtime voice conversation.

**Scope:** voice conversation + visual display only. This is a standalone API application, not the ChatGPT website or an import of your ChatGPT conversations. API billing is separate. The visual is an interpretation, not a frame-matched recreation of the series, and the built-in API voice is not a clone of its character.

## Included

- React UI with start, cancel, mute, end, fullscreen and transcript controls.
- Native WebRTC speech-to-speech session with automatic turn detection and interruption.
- Cyan projected-3D filament sculpture, driven by the actual assistant output audio using Web Audio.
- Quiet idle motion and a clearly labelled, silent visual-only preview with no microphone or API access.
- Separate microphone and output meters.
- Transcripts kept only in browser memory, with automatic direction for Hebrew/English text.
- Server-only API key, local-only HTTP binding, origin checks, request size limits and connection-attempt limits.
- Microphone/peer/audio cleanup on cancellation, failed connection, end and page exit.

## Requirements

Node.js **22.12 or later** (Node 24 is suitable), npm, a browser with microphone/WebRTC/Web Audio support, a microphone, and an OpenAI API project with billing/credits and access to the configured Realtime model.

The checked defaults as of 2026-11-05 are `gpt-realtime-2.1`, `cedar`, and `gpt-transcribe`. Model availability is account-dependent. No API key is included.

## Windows / PowerShell setup

### 1. Extract the project

Extract the ZIP so that `package.json` is located at:

```text
C:\Projects\silo-voice-stage1\package.json
```

Open PowerShell:

```powershell
cd C:\Projects\silo-voice-stage1
node --version
npm.cmd --version
```

### 2. Install packages

```powershell
npm.cmd install
```

This installs React, React DOM and Vite. The API server and automated tests use native Node APIs. Installation creates `package-lock.json`; the delivered archive contains no fabricated lockfile because dependency resolution could not run in the build environment.

### 3. Configure the server

Create a key in your OpenAI API project at https://platform.openai.com/api-keys and configure API billing separately when required.

```powershell
Copy-Item .env.example .env
notepad .env
```

Replace only the placeholder value:

```dotenv
OPENAI_API_KEY=your-real-project-api-key
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=cedar
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
PORT=3000
```

Save and close Notepad. **Keep the key in this local file. Do not paste it into chat, put it in `src`, rename it to a `VITE_` variable, or commit it.** `.env` is git-ignored.

### 4. Run

```powershell
npm.cmd run dev
```

Keep that terminal open and visit:

```text
http://localhost:3000
```

The UI, API routes and development connection use the same local server. Use `localhost`, not a LAN IP. The service binds only to `127.0.0.1`.

### 5. Start the conversation

Select **Start conversation**, allow microphone access and speak after connection. The assistant is instructed to greet you briefly. Its outgoing audio drives the central sculpture; the microphone has a separate input meter. Speak during a reply to interrupt it. Use **Mute microphone** to suspend outgoing microphone audio and **End conversation** to release the microphone and close the connection.

Select **Enable audio** if the browser blocks playback. **Preview the visual** is silent, simulated motion; it does not connect to OpenAI or request a microphone.

The transcript remains on screen after ending, until a new conversation or page reload. Reconnecting starts a new API conversation. There is no persistent memory.

## Verification commands

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

`npm start` serves the built application from the same loopback server. Stop the development process before starting it, or use another `PORT`.

**Verification performed during authoring:** 25 Node tests passed; four JSX files passed syntax transpilation; isolated Canvas rendering and real browser Web Audio analysis passed. **Not verified here:** npm installation, the complete Vite/React build, the full React UI in a browser, and a live OpenAI voice conversation. The build environment blocked external package downloads and local browser navigation; no real API key was supplied. See `docs/VERIFICATION.md` for exact boundaries.

## Files

```text
server/
  index.mjs                  Local server, Vite integration, production static serving
  api.mjs                    Validated server-side SDP exchange with OpenAI
  config.mjs                 Model, voice, turn detection and assistant instructions
src/
  App.jsx                    Screen, controls and live transcript
  components/VoiceDisplay.jsx Renderer lifecycle and meters
  components/Icon.jsx        Local SVG control icons
  realtime/RealtimeClient.js  WebRTC lifecycle, cancellation and resource ownership
  realtime/state.js          Event reducer and transcript state
  audio/AudioGraph.js         Microphone/output analysers and audio playback
  audio/signal.js             Amplitude and frequency-band measurements
  visuals/VoiceScene.js       Projected 3D filament renderer on Canvas 2D
  styles.css                 Responsive visual theme
```

The renderer and audio transport are separate so later stages can extend the application without rewriting the effect.

## Stage 1 boundaries

This is a **local single-user application**, not an authenticated public service. No tools, file access, web search, database, login, saved conversations, or access to this ChatGPT conversation are implemented. Audio is streamed to OpenAI during the session. The application does not record audio or persist transcripts itself; that is separate from OpenAI's provider-side data handling.

The renderer projects a 3D mathematical surface onto Canvas 2D. It is not a WebGL/Three.js scene. Motion respects reduced-motion preferences. The maximum visible transcript history is 100 items, with a 20,000-character limit per item; this does not change the API conversation context.

## Troubleshooting this build

| Symptom | Meaning / action |
|---|---|
| API key not configured | Edit `.env`, save it and restart the Node process. |
| OpenAI rejected the key | Verify that it is an API project key, not a ChatGPT subscription credential. |
| Quota / rate limit error | Check API billing, project limits and model access. Local connection attempts are also limited to six per minute. |
| Microphone denied | Allow microphone permission for `localhost` in the browser and retry. |
| No audio | Use **Enable audio** when shown; check the browser output device and system volume. |
| Cannot reach OpenAI | Check the server's internet/proxy access; the browser must also be able to establish WebRTC media. |
| Port already in use | Stop the earlier process or change `PORT` in `.env` and restart. |
| `vite` is not recognized | Run `npm.cmd install` from the folder containing `package.json`. |
| Build missing | Run `npm.cmd run build` before `npm.cmd start`. |

Restart the server after changing `.env`; the file is not live-reloaded.
