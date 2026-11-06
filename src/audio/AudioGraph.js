import { EMPTY_SIGNAL, measureSignal } from './signal.js';

/** Owns audio analysis only. The audio element is the sole audible output route. */
export class AudioGraph {
  constructor() {
    this.context = new AudioContext();
    this.audio = new Audio();
    this.audio.autoplay = true;
    this.audio.setAttribute('playsinline', '');
    this.audio.style.display = 'none';
    document.body.appendChild(this.audio);
    this.silent = this.context.createGain();
    this.silent.gain.value = 0;
    this.silent.connect(this.context.destination);
    this.input = this.makeMeter();
    this.output = this.makeMeter();
    this.closed = false;
  }
  makeMeter() {
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -15;
    analyser.connect(this.silent);
    return { analyser, waveform: new Float32Array(analyser.fftSize), spectrum: new Uint8Array(analyser.frequencyBinCount), source: null };
  }
  connectMicrophone(stream) {
    this.input.source = this.context.createMediaStreamSource(stream);
    this.input.source.connect(this.input.analyser);
  }
  async connectOutput(stream) {
    if (this.closed) return false;
    this.output.source?.disconnect();
    this.output.source = this.context.createMediaStreamSource(stream);
    this.output.source.connect(this.output.analyser);
    this.audio.srcObject = stream;
    return this.resume();
  }
  async resume() {
    try {
      if (this.closed) return false;
      await this.context.resume();
      if (this.closed) return false;
      if (this.audio.srcObject) await this.audio.play();
      return true;
    } catch { return false; }
  }
  sample(meter) {
    if (this.closed || !meter.source || this.context.state !== 'running') return EMPTY_SIGNAL;
    meter.analyser.getFloatTimeDomainData(meter.waveform);
    meter.analyser.getByteFrequencyData(meter.spectrum);
    return measureSignal(meter.waveform, meter.spectrum, this.context.sampleRate);
  }
  read() { return { input: this.sample(this.input), output: this.sample(this.output) }; }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.audio.pause();
    this.audio.srcObject = null;
    this.audio.remove();
    for (const meter of [this.input, this.output]) { meter.source?.disconnect(); meter.analyser.disconnect(); }
    this.silent.disconnect();
    void this.context.close().catch(() => {});
  }
}
