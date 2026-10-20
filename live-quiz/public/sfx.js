// SFX Kenney Interface Sounds (CC0), SFX gift dan musik latar prosedural, lewat WebAudio.
// Setiap bunyi juga dicatat di `log` supaya skrip render bisa menyusun audio yang sama.

const NAMES = ['intro', 'tick', 'tickUrgent', 'timeUp', 'reveal', 'card', 'row', 'podium', 'title', 'gift', 'follow', 'hint', 'whoosh', 'impact', 'powerup', 'sparkle'];
const GAIN = { tick: 0.5, tickUrgent: 0.7, row: 0.6, card: 0.8, gift: 0.6, follow: 0.6, whoosh: 0.7, impact: 0.9, powerup: 0.5, sparkle: 0.4 };

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
    const load = async (name) => {
      try {
        const buf = await fetch(`sfx/${name}.ogg`).then((r) => r.arrayBuffer());
        this.buffers[name] = await this.ctx.decodeAudioData(buf);
      } catch {
        // file hilang: bunyi itu dilewati
      }
    };
    await Promise.all([...NAMES, ...(this.bed ? ['bed'] : [])].map(load));
    // Browser biasa butuh interaksi dulu; di OBS audio langsung jalan.
    const resume = () => this.ctx.state === 'suspended' && this.ctx.resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    this.startBed();
  }

  startBed() {
    const buf = this.buffers.bed;
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.master);
    src.start();
  }

  play(name, at) {
    this.log.push({ name, at, gain: GAIN[name] ?? 1 });
    if (this.log.length > 5000) this.log.shift();
    const buf = this.buffers[name];
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = GAIN[name] ?? 1;
    src.buffer = buf;
    src.connect(g).connect(this.master);
    src.start();
  }
}
