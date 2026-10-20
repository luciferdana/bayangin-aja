// Penonton palsu untuk menguji kuis tanpa live: komentar jawaban, obrolan, like, gift, follow.

const FIRST = ['budi', 'rina', 'dodi', 'sari', 'agus', 'wulan', 'yoga', 'putri', 'bayu', 'nisa',
  'rizky', 'dewi', 'fajar', 'intan', 'galih', 'ayu', 'eko', 'lala', 'hendra', 'mega', 'tono', 'citra'];
const CHAT = ['halo kak', 'wkwk', 'susah bgt', 'gampang ini', 'ikut ya', 'mantap', 'lanjut', 'hadir'];
const GIFTS = ['Mawar', 'Donat', 'Jari Hati', 'Topi Koboi'];
const SKILL = { mudah: 0.85, sedang: 0.6, sulit: 0.35 };

export class Sim {
  constructor(engine, rng, { viewers = 40 } = {}) {
    this.engine = engine;
    this.rng = rng;
    this.viewers = Array.from({ length: viewers }, (_, i) => {
      const name = FIRST[i % FIRST.length] + (i >= FIRST.length ? i : '');
      return { user: `${name}_${100 + i}`, name, skill: 0.5 + rng() * 0.5 };
    });
    this.queue = [];
    this.lastKey = '';
    this.last = null;
  }

  step(now) {
    const e = this.engine;
    const key = `${e.round}:${e.qIndex}:${e.phase}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      if (e.phase === 'answer') this.planAnswers(now);
    }
    while (this.queue.length && this.queue[0].at <= now) e.handle(this.queue.shift().evt, now);

    const dt = this.last === null ? 0 : Math.min(1000, now - this.last);
    this.last = now;
    const r = this.rng;
    const per = (ratePerSec) => r() < (ratePerSec * dt) / 1000;
    if (per(0.6)) this.say(CHAT[Math.floor(r() * CHAT.length)], now);
    if (per(1.5)) e.handle({ type: 'like', ...this.pick(), count: 3 + Math.floor(r() * 15) }, now);
    if (per(0.05)) e.handle({ type: 'gift', ...this.pick(), gift: GIFTS[Math.floor(r() * GIFTS.length)], count: 1 + Math.floor(r() * 3) }, now);
    if (per(0.04)) e.handle({ type: 'follow', ...this.pick() }, now);
  }

  pick() {
    const v = this.viewers[Math.floor(this.rng() * this.viewers.length)];
    return { user: v.user, name: v.name };
  }

  say(text, now) {
    this.engine.handle({ type: 'comment', ...this.pick(), text }, now);
  }

  planAnswers(now) {
    const e = this.engine;
    const q = e.current.q;
    const span = e.cfg.answerMs;
    const r = this.rng;
    for (const v of this.viewers) {
      if (r() < 0.25) continue; // sebagian penonton tidak ikut menjawab
      const right = r() < v.skill * SKILL[q.diff];
      let choice = q.answer;
      if (!right) {
        const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer);
        choice = wrong[Math.floor(r() * wrong.length)];
      }
      const letter = 'ABCD'[choice];
      const text = r() < 0.7 ? letter : r() < 0.5 ? letter.toLowerCase() : `jawab ${letter}`;
      const at = now + 1200 + r() ** 1.6 * (span - 2000);
      this.queue.push({ at, evt: { type: 'comment', user: v.user, name: v.name, text } });
    }
    this.queue.sort((a, b) => a.at - b.at);
  }
}
