// Efek suara prosedural lewat WebAudio, tanpa file audio.

let ctx = null;
let master = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Browser biasa butuh interaksi dulu; di OBS audio langsung jalan.
window.addEventListener('pointerdown', audio, { once: true });
window.addEventListener('keydown', audio, { once: true });

function tone(freq, start, dur, { type = 'sine', gain = 0.3, slide = 0 } = {}) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  start() {
    tone(392, 0, 0.18, { type: 'triangle', gain: 0.25 });
    tone(587, 0.12, 0.3, { type: 'triangle', gain: 0.25 });
  },
  tick(urgent) {
    tone(urgent ? 1320 : 880, 0, 0.06, { type: 'square', gain: urgent ? 0.08 : 0.04 });
  },
  lock() {
    tone(220, 0, 0.35, { type: 'sawtooth', gain: 0.08, slide: 0.6 });
  },
  reveal() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.5, { type: 'triangle', gain: 0.2 }));
  },
  gift() {
    tone(1568, 0, 0.25, { gain: 0.12 });
    tone(2093, 0.07, 0.3, { gain: 0.1 });
  },
  board() {
    [392, 494, 587].forEach((f, i) => tone(f, i * 0.1, 0.6, { type: 'triangle', gain: 0.18 }));
  },
};
