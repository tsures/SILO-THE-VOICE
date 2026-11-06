import { AudioGraph } from '../audio/AudioGraph.js';
import { EMPTY_SIGNAL } from '../audio/signal.js';
import { initialState, reduceEvent } from './state.js';

const permissionMessage = error => ({
  NotAllowedError: 'Microphone permission was denied. Allow the microphone for localhost in your browser, then reconnect.',
  NotFoundError: 'No microphone was found. Connect an input device and try again.',
  NotReadableError: 'The microphone could not be opened. Check the selected device and whether another application is using it.',
  SecurityError: 'Microphone access requires localhost or HTTPS.'
}[error?.name] || error?.message || 'Could not start the voice conversation.');

/** Native Realtime transport. Dependencies can be supplied by tests or future hosts. */
export class RealtimeClient {
  constructor(dependencies = {}) {
    this.dependencies = {
      isSupported: () => Boolean(globalThis.isSecureContext && navigator.mediaDevices?.getUserMedia && globalThis.RTCPeerConnection && globalThis.AudioContext),
      makePeer: () => new RTCPeerConnection(),
      getMicrophone: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
      makeGraph: () => new AudioGraph(), fetchImpl: (...args) => fetch(...args), ...dependencies
    };
    this.state = initialState();
    this.listeners = new Set();
    this.resources = null;
  }
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  publish(update) {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }
  current(resources) { return this.resources === resources && !resources.closed; }
  send(resources, event) {
    if (this.current(resources) && resources.channel?.readyState === 'open') resources.channel.send(JSON.stringify(event));
  }
  async start() {
    if (this.resources) return;
    this.publish({ ...initialState(), images: this.state.images, connection: 'connecting' });
    const r = { closed: false, controller: new AbortController(), stream: null, peer: null, channel: null, graph: null, timeout: null, reconnectTimeout: null };
    this.resources = r;
    try {
      if (!this.dependencies.isSupported()) throw new Error('Use a browser with microphone and WebRTC support on localhost or HTTPS.');
      r.graph = this.dependencies.makeGraph();
      void r.graph.resume().then(ok => { if (this.current(r) && !ok) this.publish({ playbackBlocked: true }); });
      r.timeout = setTimeout(() => this.fail(r, 'Connection timed out. Check microphone permission and network access.'), 45000);
      const stream = await this.dependencies.getMicrophone();
      if (!this.current(r)) { stream.getTracks().forEach(track => track.stop()); return; }
      r.stream = stream;
      r.graph.connectMicrophone(stream);
      const peer = this.dependencies.makePeer();
      r.peer = peer;
      for (const track of stream.getAudioTracks()) {
        peer.addTrack(track, stream);
        track.addEventListener('ended', () => this.fail(r, 'The microphone was disconnected. Reconnect it and start a new conversation.'), { once: true });
      }
      peer.ontrack = async event => {
        if (!this.current(r)) return;
        const stream = event.streams[0] || new MediaStream([event.track]);
        const ok = await r.graph.connectOutput(stream);
        if (this.current(r)) this.publish({ playbackBlocked: !ok });
      };
      peer.onconnectionstatechange = () => {
        if (!this.current(r)) return;
        clearTimeout(r.reconnectTimeout);
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') this.fail(r, 'The voice connection ended. Start a new conversation to reconnect.');
        if (peer.connectionState === 'disconnected') r.reconnectTimeout = setTimeout(() => this.fail(r, 'The voice connection was lost.'), 8000);
      };
      const channel = peer.createDataChannel('oai-events');
      r.channel = channel;
      channel.onmessage = ({ data }) => {
        if (!this.current(r)) return;
        let event;
        try { event = JSON.parse(data); } catch { return; }
        const next = reduceEvent(this.state, event);
        if (next !== this.state) this.publish(next);
        if (event.type === 'response.done') void this.handleToolCalls(r, event);
        if (event.type === 'session.created') {
          clearTimeout(r.timeout);
          this.send(r, { type: 'response.create', response: { instructions: 'Greet the user briefly with: I am here. What would you like to talk about?' } });
        }
      };
      channel.onclose = () => this.fail(r, 'The voice event channel closed. Start a new conversation to reconnect.');
      channel.onerror = () => this.fail(r, 'The voice event channel failed. Check your network and reconnect.');
      const offer = await peer.createOffer();
      if (!this.current(r)) return;
      await peer.setLocalDescription(offer);
      if (!this.current(r)) return;
      const response = await this.dependencies.fetchImpl('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/sdp', 'X-Silo-Client': '1' },
        body: peer.localDescription.sdp, signal: r.controller.signal
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Voice session request failed (HTTP ${response.status}).`);
      }
      const answer = await response.text();
      if (!this.current(r)) return;
      await peer.setRemoteDescription({ type: 'answer', sdp: answer });
    } catch (error) {
      if (this.current(r)) this.fail(r, permissionMessage(error));
    }
  }
  async handleToolCalls(r, event) {
    const outputs = Array.isArray(event.response?.output) ? event.response.output : [];
    const calls = outputs.filter(item => item?.type === 'function_call' && typeof item.call_id === 'string');
    if (!calls.length || !this.current(r)) return;
    r.seenCalls ||= new Set();
    const unseen = calls.filter(item => {
      if (r.seenCalls.has(item.call_id)) return false;
      r.seenCalls.add(item.call_id);
      return true;
    });
    if (!unseen.length) return;
    const webCalls = unseen.filter(item => item.name === 'search_web').slice(0, 3);
    const imageCalls = unseen.filter(item => item.name === 'create_image').slice(0, 1);
    if (!webCalls.length && !imageCalls.length) return;
    if (webCalls.length) this.publish({ searching: true });
    if (imageCalls.length) this.publish({ imaging: true, imageError: null });
    try {
      const results = [];
      for (const call of webCalls) results.push(await this.resolveWebCall(r, call));
      for (const call of imageCalls) results.push(await this.resolveImageCall(r, call));
      if (!this.current(r)) return;
      for (const output of results) {
        if (!this.current(r)) return;
        this.send(r, { type: 'conversation.item.create', item: {
          type: 'function_call_output', call_id: output.call_id, output: JSON.stringify(output.result)
        } });
      }
      this.send(r, { type: 'response.create' });
    } finally {
      if (this.current(r)) this.publish({ searching: false, imaging: false });
    }
  }
  async resolveWebCall(r, call) {
    let query;
    try {
      query = JSON.parse(call.arguments || '{}').query;
      if (typeof query !== 'string' || query.trim().length < 3 || query.length > 400) throw Error('Invalid query');
    } catch {
      return { call_id: call.call_id, result: { error: 'Invalid web search query.' } };
    }
    try {
      const res = await this.dependencies.fetchImpl('/api/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Silo-Client': '1' },
        body: JSON.stringify({ query }), signal: r.controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Search request failed (HTTP ${res.status}).`);
      const sources = Array.isArray(data.sources) ? data.sources.filter(source =>
        source && typeof source.title === 'string' && typeof source.url === 'string' && /^https?:\/\//i.test(source.url)
      ).slice(0, 6) : [];
      if (this.current(r)) this.publish({ webSources: sources, searchError: null });
      return { call_id: call.call_id, result: { answer: String(data.answer || '').slice(0, 5500), sources } };
    } catch (error) {
      const message = r.controller.signal.aborted ? 'The session ended.' : error.message || 'Search failed.';
      if (this.current(r)) this.publish({ searchError: message, webSources: [] });
      return { call_id: call.call_id, result: { error: message } };
    }
  }
  async resolveImageCall(r, call) {
    let request;
    try {
      const parsed = JSON.parse(call.arguments || '{}');
      request = {
        prompt: typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '',
        size: typeof parsed.size === 'string' ? parsed.size : 'square',
        background: typeof parsed.background === 'string' ? parsed.background : 'auto'
      };
      if (request.prompt.length < 3 || request.prompt.length > 2000) throw Error('Invalid prompt');
    } catch {
      return { call_id: call.call_id, result: { error: 'Invalid image generation request.' } };
    }
    try {
      const res = await this.dependencies.fetchImpl('/api/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Silo-Client': '1' },
        body: JSON.stringify(request), signal: r.controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Image request failed (HTTP ${res.status}).`);
      const image = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        dataUrl: String(data.imageDataUrl || ''),
        prompt: String(data.prompt || request.prompt).slice(0, 2000),
        revisedPrompt: String(data.revisedPrompt || '').slice(0, 4000),
        createdAt: Date.now(),
        background: data.background || request.background,
        size: data.size || request.size,
        format: data.format || 'png'
      };
      if (!/^data:image\//.test(image.dataUrl)) throw Error('Image data missing from response.');
      if (this.current(r)) this.publish({ images: [image, ...this.state.images].slice(0, 6), imageError: null });
      return { call_id: call.call_id, result: {
        ok: true,
        message: 'The image was created successfully and displayed in the app.',
        prompt: image.prompt,
        revised_prompt: image.revisedPrompt,
        size: image.size,
        background: image.background,
        format: image.format
      } };
    } catch (error) {
      const message = r.controller.signal.aborted ? 'The session ended.' : error.message || 'Image generation failed.';
      if (this.current(r)) this.publish({ imageError: message });
      return { call_id: call.call_id, result: { error: message } };
    }
  }
  release(r) {
    if (!r || r.closed) return;
    r.closed = true;
    clearTimeout(r.timeout); clearTimeout(r.reconnectTimeout);
    r.controller.abort();
    if (r.channel) { r.channel.onmessage = null; r.channel.onerror = null; r.channel.onclose = null; r.channel.close(); }
    if (r.peer) { r.peer.ontrack = null; r.peer.onconnectionstatechange = null; r.peer.close(); }
    r.stream?.getTracks().forEach(track => track.stop());
    r.graph?.close();
    if (this.resources === r) this.resources = null;
  }
  fail(r, message) {
    if (!this.current(r)) return;
    this.release(r);
    this.publish({ connection: 'error', error: message, generating: false, outputPlaying: false, userSpeaking: false, muted: false, playbackBlocked: false, startedAt: null, searching: false, imaging: false });
  }
  stop = () => {
    this.release(this.resources);
    this.publish({ connection: 'idle', error: null, generating: false, outputPlaying: false, userSpeaking: false, muted: false, playbackBlocked: false, startedAt: null, searching: false, imaging: false });
  };
  toggleMute = () => {
    if (this.state.connection !== 'connected') return;
    const muted = !this.state.muted;
    this.resources?.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; });
    this.publish({ muted, userSpeaking: muted ? false : this.state.userSpeaking });
  };
  resumeAudio = async () => {
    const r = this.resources;
    if (!r) return;
    const ok = await r.graph.resume();
    if (this.current(r)) this.publish({ playbackBlocked: !ok });
  };
  readLevels = () => {
    const levels = this.resources?.graph?.read() || { input: EMPTY_SIGNAL, output: EMPTY_SIGNAL };
    return { input: this.state.muted ? EMPTY_SIGNAL : levels.input, output: this.state.playbackBlocked ? EMPTY_SIGNAL : levels.output };
  };
}
