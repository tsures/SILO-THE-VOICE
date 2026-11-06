import React from 'react';
const paths = {
  mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
  mute: <><path d="m3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 0v5M5 10v2a7 7 0 0 0 12 5M19 10v2a7 7 0 0 1-.4 2M12 19v3M8 22h8" /></>,
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  text: <><path d="M4 5h16M4 10h16M4 15h10M4 20h7" /></>,
  expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></>,
  speaker: <><path d="M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>
};
export function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
