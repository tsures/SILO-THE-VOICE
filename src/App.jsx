import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RealtimeClient } from './realtime/RealtimeClient.js';
import { activity } from './realtime/state.js';
import { VoiceDisplay } from './components/VoiceDisplay.jsx';
import { Icon } from './components/Icon.jsx';

const labels = {
  idle: ['Awaiting connection', 'A conversation, beyond the screen.'],
  connecting: ['Establishing connection', 'Allow microphone access when your browser asks.'],
  listening: ['Listening', 'Speak naturally. The conversation is open.'],
  hearing: ['Receiving your voice', 'Take your time.'],
  thinking: ['Forming a response', 'The assistant is preparing its reply.'],
  searching: ['Searching the internet', 'Looking up current information and sources.'],
  imaging: ['Generating an image', 'Creating a visual based on your request.'],
  speaking: ['The Voice is speaking', 'You can interrupt by speaking.'],
  error: ['Connection unavailable', 'Check the message below, then reconnect.']
};

function downloadName(image) {
  const stamp = new Date(image.createdAt || Date.now()).toISOString().replace(/[:.]/g, '-');
  return `the-voice-${stamp}.png`;
}

export default function App() {
  const [client] = useState(() => new RealtimeClient());
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [preview, setPreview] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [configuration, setConfiguration] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');
  const inputMeter = useRef(null), outputMeter = useRef(null), transcriptEnd = useRef(null);
  const phase = activity(state);
  const connected = state.connection === 'connected';
  const connecting = state.connection === 'connecting';
  const label = preview ? ['Visual preview', 'Simulated movement. No microphone, no API connection.']
    : state.playbackBlocked ? ['Audio needs permission', 'Select Enable audio below to hear the assistant.']
    : connected && state.muted && !state.outputPlaying && !state.generating ? ['Microphone muted', 'Unmute to continue speaking.'] : labels[phase];

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(setConfiguration).catch(() => {});
    const leave = () => client.stop();
    window.addEventListener('pagehide', leave);
    return () => { controller.abort(); window.removeEventListener('pagehide', leave); client.stop(); };
  }, [client]);
  useEffect(() => {
    const update = () => setElapsed(state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0);
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [state.startedAt]);
  useEffect(() => { if (showTranscript) transcriptEnd.current?.scrollIntoView({ block: 'nearest' }); }, [state.messages, showTranscript]);
  const start = () => { setPreview(false); void client.start(); };
  const fullScreen = async () => {
    try {
      setFullscreenError('');
      if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
    } catch { setFullscreenError('Fullscreen is not available in this browser.'); }
  };
  const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div><span className="brand-title">THE VOICE</span><span className="brand-subtitle">CONVERSATIONAL INTERFACE</span></div>
      </div>
      <div className="stage-tag">STAGE <strong>04</strong><span>VOICE + IMAGE GENERATION</span></div>
      <div className={`connection-badge ${connected ? 'is-live' : ''}`}><span className="dot" />{connected ? 'CONNECTED' : connecting ? 'CONNECTING' : 'STANDBY'}</div>
    </header>
    <main>
      <section className="voice-stage" aria-label="Voice conversation">
        <div className="stage-top"><span><span className="tiny-cross">+</span> AUDIO FIELD / OUTPUT</span>
          <button className="text-button" onClick={fullScreen}><Icon name="expand" size={14} /><span>Fullscreen</span></button>
        </div>
        <div className="field">
          <div className="field-cross left" aria-hidden="true">+</div><div className="field-cross right" aria-hidden="true">+</div>
          <div className="field-axis" aria-hidden="true" />
          <VoiceDisplay client={client} preview={preview} inputMeter={inputMeter} outputMeter={outputMeter} />
          <div className="field-caption"><span>{preview ? 'SIMULATED SIGNAL' : connected ? 'LIVE AUDIO ANALYSIS' : 'NO ACTIVE SESSION'}</span><span>04 / VOICE + IMAGE</span></div>
        </div>
        <div className="voice-copy" aria-live="polite" aria-atomic="true"><div className={`status-kicker ${connected ? 'active' : ''}`}><span className="dot" />{label[0]}</div>
          <h1>{connected || connecting ? 'I am here.' : 'Is anyone there?'}</h1><p>{label[1]}</p>
        </div>
        <div className="control-row">
          {!connected && !connecting && <button id="btnConnect" className="primary-button" onClick={start}><Icon name="mic" />Start conversation<Icon name="arrow" /></button>}
          {connecting && <button id="btnCancel" className="secondary-button" onClick={client.stop}><span className="spinner" />Cancel connection</button>}
          {connected && <><button id="btnMute" className={`secondary-button ${state.muted ? 'muted' : ''}`} onClick={client.toggleMute} aria-pressed={state.muted}><Icon name={state.muted ? 'mute' : 'mic'} />{state.muted ? 'Unmute microphone' : 'Mute microphone'}</button>
            <button id="btnEnd" className="secondary-button end-button" onClick={client.stop}><Icon name="stop" />End conversation</button></>}
          {state.playbackBlocked && <button className="primary-button" onClick={client.resumeAudio}><Icon name="speaker" />Enable audio</button>}
        </div>
        {!connected && !connecting && <button id="btnPreview" className="preview-button" onClick={() => setPreview(value => !value)} aria-pressed={preview}>{preview ? 'Stop visual preview' : 'Preview the visual'}<span aria-hidden="true"> / </span><span>no connection required</span></button>}
        {configuration && !configuration.configured && !state.error && <p className="setup-notice">API key not configured. Add it to the server's <code>.env</code> file and restart. Visual preview is available.</p>}
        {state.error && <div className="error-notice" role="alert"><strong>Connection message</strong><span>{state.error}</span></div>}
        {state.searchError && <div className="error-notice" role="status"><strong>Web search</strong><span>{state.searchError}</span></div>}
        {state.imageError && <div className="error-notice" role="status"><strong>Image generation</strong><span>{state.imageError}</span></div>}
        {state.webSources.length > 0 && <section className="web-sources" aria-label="Web sources"><h2>Sources from the web</h2><ul>{state.webSources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></section>}
        {state.images.length > 0 && <section className="image-gallery" aria-label="Generated images">
          <div className="image-gallery-head"><h2>Generated visuals</h2><p>Images created from your voice conversation appear here.</p></div>
          <div className="image-grid">{state.images.map(image => <article className="image-card" key={image.id}>
            <img src={image.dataUrl} alt={image.prompt} loading="lazy" />
            <div className="image-meta">
              <p>{image.prompt}</p>
              <div className="image-actions">
                <span>{image.size}</span>
                <a href={image.dataUrl} download={downloadName(image)}>Download PNG</a>
              </div>
            </div>
          </article>)}</div>
        </section>}
        {fullscreenError && <p className="setup-notice" role="status">{fullscreenError}</p>}
        <div className="telemetry">
          <div className="signal"><span>{connected ? (state.muted ? 'MIC MUTED' : 'MIC INPUT') : 'MIC INACTIVE'}</span><div className="meter"><i ref={inputMeter} /></div></div>
          <div className="session-time"><span className="dot" />{connected ? time : '--:--'}<span>SESSION</span></div>
          <div className="signal"><span>VOICE OUTPUT</span><div className="meter"><i ref={outputMeter} /></div></div>
        </div>
      </section>
      <section className={`transcript-section ${showTranscript ? 'expanded' : ''}`}>
        <button id="btnTranscript" className="transcript-toggle" onClick={() => setShowTranscript(value => !value)} aria-expanded={showTranscript} aria-controls="transcript"><span><Icon name="text" />Conversation transcript<span className="count">{state.messages.length}</span></span><span className="toggle-sign">{showTranscript ? '-' : '+'}</span></button>
        {showTranscript && <div id="transcript" className="transcript-body">
          <p className="transcript-note">On-screen only. Starting a new conversation clears this transcript. Text may arrive before speech finishes.</p>
          {!state.messages.length && <p className="empty-transcript">Your conversation will appear here.</p>}
          <div role="log" aria-label="Conversation transcript" aria-live="off">{state.messages.map(message => <article className={`message ${message.role}`} key={message.id}>
            <span className="message-role">{message.role === 'user' ? 'YOU' : 'THE VOICE'}</span>
            <p dir="auto">{message.interrupted ? '[Interrupted. Transcript omitted because generated text may include unplayed speech.]' : message.text || (message.role === 'user' ? 'Transcribing...' : 'Responding...')}</p>
          </article>)}</div><div ref={transcriptEnd} />
        </div>}
      </section>
    </main>
    <footer className="footer"><span>AI-GENERATED VOICE<span className="footer-dot">/</span>POWERED BY OPENAI</span><span>Audio and image requests are sent to OpenAI while connected. API usage is billed separately.</span></footer>
  </div>;
}
