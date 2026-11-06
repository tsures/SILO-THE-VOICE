# Stage 1 architecture

The browser creates one `RTCPeerConnection`, an `oai-events` data channel and a microphone stream. It sends its SDP offer to the local `/api/session` endpoint. The server adds its own model/voice/instructions configuration and authenticates a multipart `POST /v1/realtime/calls` request with the server-only project key. It returns only the SDP answer. Audio then travels between the browser and OpenAI over WebRTC, not through the local HTTP server.

`RealtimeClient` owns all live resources. A per-attempt ownership object suppresses late callbacks after cancellation. A microphone granted after the user cancels is immediately stopped. All stop/error/unmount paths close the data channel, peer, audio graph and microphone tracks.

The remote media stream feeds an `Audio` element for playback and a separate Web Audio analysis graph. A zero-gain destination keeps analysis active without doubling audible playback. The microphone analyser never outputs audible microphone audio. The renderer reads RMS and frequency bands outside React's state update loop.

`response.done` ends generation, not playback. Speaking state remains active until output-buffer events indicate playback ended. Server-side VAD handles automatic turn taking and interruption. Truncated assistant transcripts are omitted because generated text can extend beyond what was actually heard.

`VoiceScene` is a pure browser rendering class. It projects a time-deformed mathematical surface into Canvas 2D and draws glowing longitudinal/cross filaments and particles. React owns mounting, disposal, controls and text, not individual animation frames.

No persistence or ChatGPT-product integration is present. Configuration is in `.env`, while defaults and assistant instructions are in `server/config.mjs`. Only the provider-side session creation requires the API key. Origin checks and loopback binding do not amount to public-user authentication; this version is deliberately local-only.
