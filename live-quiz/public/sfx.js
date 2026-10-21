// SFX Kenney Interface Sounds (CC0), SFX gift dan musik latar prosedural, lewat WebAudio.
// Setiap bunyi juga dicatat di `log` supaya skrip render bisa menyusun audio yang sama.

const NAMES = ['intro', 'tick', 'tickUrgent', 'timeUp', 'reveal', 'card', 'row', 'podium', 'title', 'gift', 'follow', 'hint', 'whoosh', 'impact', 'powerup', 'sparkle'];
const GAIN = { tick: 0.5, tickUrgent: 0.7, row: 0.6, card: 0.8, gift: 0.6, follow: 0.6, whoosh: 0.7, impact: 0.9, powerup: 0.5, sparkle: 0.4,
  sultan: 0.9, sultan2: 0.9, sultan3: 0.85 };
// Klip musik sultan (bergiliran): diputar sepotong (detik `offset`, selama `dur`, fade `fade`),
// musik latar dikecilkan. Ketukan tiap klip ada di SULTAN_TRACKS (ui.js).
const CLIPS = {
  sultan: { file: 'sultan.mp3', offset: 10, dur: 10.5, fade: 0.5 },
  sultan2: { file: 'sultan2.mp3', offset: 11, dur: 10.5, fade: 0.5 },
  sultan3: { file: 'sultan3.mp3', offset: 0, dur: 10.5, fade: 0.5 },
};

export class Sound {
  // bed=false: tanpa musik latar (misalnya kalau musik diputar dari aplikasi lain), SFX tetap.
  constructor({ muted = false, bed = true } = {}) {
    this.muted = muted;
    this.bed = bed;
    this.log = [];
    this.buffers = {};
    this.ctx = null;
  }

  async init() {
    if (this.muted) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.bedGain = this.ctx.createGain();
    this.bedGain.connect(this.master);
    const load = async (name) => {
      try {
        const buf = await fetch(`sfx/${CLIPS[name]?.file ?? `${name}.ogg`}`).then((r) => r.arrayBuffer());
        this.buffers[name] = await this.ctx.decodeAudioData(buf);
      } catch {
        // file hilang: bunyi itu dilewati
      }
    };
    await Promise.all([...NAMES, ...Object.keys(CLIPS), ...(this.bed ? ['bed'] : [])].map(load));
    // Browser biasa butuh interaksi dulu; di OBS audio langsung jalan.
    const resume = () => this.ctx.state === 'suspended' && this.ctx.resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    this.startBed();
  }

  // Jeda sampai bunyi benar-benar keluar speaker (ms); animasi yang mengikuti musik digeser sebesar ini.
  get latencyMs() {
    if (!this.ctx) return 0;
    return Math.round(((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000);
  }

  startBed() {
    const buf = this.buffers.bed;
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.bedGain);
    src.start();
  }

  play(name, at) {
    const clip = CLIPS[name];
    this.log.push({ name, at, gain: GAIN[name] ?? 1, ...(clip && { offset: clip.offset, dur: clip.dur }) });
    if (this.log.length > 5000) this.log.shift();
    const buf = this.buffers[name];
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    const vol = GAIN[name] ?? 1;
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g).connect(this.master);
    if (!clip) {
      src.start();
      return;
    }
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, now + clip.dur - clip.fade);
    g.gain.linearRampToValueAtTime(0, now + clip.dur);
    src.start(now, clip.offset, clip.dur);
    // Musik latar turun selama klip, lalu naik lagi.
    const bed = this.bedGain.gain;
    bed.cancelScheduledValues(now);
    bed.setValueAtTime(bed.value, now);
    bed.linearRampToValueAtTime(0.12, now + 0.15);
    bed.setValueAtTime(0.12, now + clip.dur);
    bed.linearRampToValueAtTime(1, now + clip.dur + 0.8);
  }
}
