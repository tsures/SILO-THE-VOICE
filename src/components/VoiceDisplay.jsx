import React, { useEffect, useRef, useState } from 'react';
import { VoiceScene } from '../visuals/VoiceScene.js';

export function VoiceDisplay({ client, preview, inputMeter, outputMeter }) {
  const canvas = useRef(null);
  const previewRef = useRef(preview);
  const [error, setError] = useState(null);
  previewRef.current = preview;
  useEffect(() => {
    let scene;
    try {
      scene = new VoiceScene(canvas.current, () => ({
        ...client.readLevels(), preview: previewRef.current,
        onMeter: (input, output) => {
          if (inputMeter.current) inputMeter.current.style.transform = `scaleX(${Math.min(1, input)})`;
          if (outputMeter.current) outputMeter.current.style.transform = `scaleX(${Math.min(1, output)})`;
        }
      }));
    } catch (e) { setError(e.message); }
    return () => scene?.dispose();
  }, [client, inputMeter, outputMeter]);
  return <>
    <canvas ref={canvas} className="voice-canvas" aria-label="Silo-inspired audio sculpture reacting to the AI assistant's voice" role="img" />
    {error && <p className="renderer-error" role="status">The visualization is unavailable. Voice controls still work. {error}</p>}
  </>;
}
