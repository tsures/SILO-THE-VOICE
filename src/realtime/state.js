export function initialState() {
  return { connection: 'idle', userSpeaking: false, outputPlaying: false, generating: false, muted: false,
    playbackBlocked: false, error: null, messages: [], startedAt: null, searching: false, searchError: null, webSources: [],
    imaging: false, imageError: null, images: [] };
}

export function activity(state) {
  if (state.connection !== 'connected') return state.connection;
  if (state.imaging) return 'imaging';
  if (state.searching) return 'searching';
  if (state.userSpeaking && !state.muted) return 'hearing';
  if (state.outputPlaying) return 'speaking';
  if (state.generating) return 'thinking';
  return 'listening';
}

function message(state, id, role, update) {
  if (typeof id !== 'string') return state;
  const index = state.messages.findIndex(item => item.id === id);
  const old = index < 0 ? { id, role, text: '', complete: false, interrupted: false } : state.messages[index];
  const value = { ...old, ...update(old) };
  value.text = value.text.slice(0, 20000);
  const messages = [...state.messages];
  if (index < 0) messages.push(value); else messages[index] = value;
  return { ...state, messages: messages.slice(-100) };
}

export function reduceEvent(state, event) {
  if (!event || typeof event.type !== 'string') return state;
  const id = event.item_id;
  switch (event.type) {
    case 'session.created': return { ...state, connection: 'connected', startedAt: Date.now(), error: null };
    case 'input_audio_buffer.speech_started': return { ...state, userSpeaking: true, outputPlaying: false };
    case 'input_audio_buffer.speech_stopped': return { ...state, userSpeaking: false };
    case 'input_audio_buffer.committed': return message(state, id, 'user', () => ({}));
    case 'conversation.item.added':
      if (!['user', 'assistant'].includes(event.item?.role)) return state;
      return message(state, event.item.id, event.item.role, () => ({}));
    case 'response.created': return { ...state, generating: true };
    case 'response.done': return { ...state, generating: false, error: event.response?.status === 'failed'
      ? 'The assistant response failed. You can try speaking again or reconnect.' : state.error };
    case 'output_audio_buffer.started': return { ...state, outputPlaying: true };
    case 'output_audio_buffer.stopped':
    case 'output_audio_buffer.cleared': return { ...state, outputPlaying: false };
    case 'response.output_audio_transcript.delta':
      return message(state, id, 'assistant', old => old.interrupted ? {} : { text: old.text + (event.delta || '') });
    case 'response.output_audio_transcript.done':
      return message(state, id, 'assistant', old => old.interrupted ? {} : { text: event.transcript || old.text, complete: true });
    case 'conversation.item.input_audio_transcription.delta':
      return message(state, id, 'user', old => ({ text: old.text + (event.delta || '') }));
    case 'conversation.item.input_audio_transcription.completed':
      return message(state, id, 'user', old => ({ text: event.transcript || old.text, complete: true }));
    case 'conversation.item.input_audio_transcription.failed':
      return message(state, id, 'user', () => ({ text: '[Transcription unavailable]', complete: true }));
    case 'conversation.item.truncated':
      return message(state, id, 'assistant', () => ({ text: '', interrupted: true, complete: true }));
    case 'error': return { ...state, generating: false, error: event.error?.message || 'A voice session error occurred.' };
    default: return state;
  }
}
