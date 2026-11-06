export const EMPTY_SIGNAL = Object.freeze({ level: 0, low: 0, mid: 0, high: 0 });
export function damp(current, target, speed, seconds) {
  return current + (target - current) * (1 - Math.exp(-speed * Math.max(0, seconds)));
}
export function measureSignal(waveform, spectrum, sampleRate) {
  if (!waveform.length || !spectrum.length) return { ...EMPTY_SIGNAL };
  let sum = 0;
  for (const value of waveform) sum += value * value;
  const rms = Math.sqrt(sum / waveform.length);
  const band = (lo, hi) => {
    const binHz = sampleRate / (spectrum.length * 2);
    const start = Math.max(0, Math.floor(lo / binHz));
    const end = Math.min(spectrum.length, Math.max(start + 1, Math.ceil(hi / binHz)));
    let total = 0;
    for (let i = start; i < end; i++) total += spectrum[i] / 255;
    return end > start ? total / (end - start) : 0;
  };
  return { level: Math.min(1, Math.max(0, rms - 0.003) * 7), low: band(70, 300), mid: band(300, 2500), high: band(2500, 8000) };
}
