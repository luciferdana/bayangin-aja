// Penonton palsu untuk menguji kuis tanpa live: tebakan ketik (dengan typo), obrolan,
// like, gift, follow. Sebagian punya foto profil buatan, sisanya tampil sebagai inisial.

const FIRST = ['budi', 'rina', 'dodi', 'sari', 'agus', 'wulan', 'yoga', 'putri', 'bayu', 'nisa',
  'rizky', 'dewi', 'fajar', 'intan', 'galih', 'ayu', 'eko', 'lala', 'hendra', 'mega', 'tono', 'citra'];
const CHAT = ['halo kak', 'wkwk', 'susah bgt', 'gampang ini', 'ikut ya', 'mantap', 'lanjut', 'hadir'];
// [nama gift, koin] kira-kira seperti gift TikTok; sebagian besar gift kecil.
const GIFTS = [['Mawar', 1], ['Mawar', 1], ['Mawar', 1], ['Jari Hati', 5], ['Donat', 30], ['Topi Koboi', 99], ['Paus', 500]];
const SKILL = { mudah: 0.85, sedang: 0.6, sulit: 0.35 };

// Foto profil buatan: gradasi kalem + siluet, sebagai data URI SVG.
function fakeAvatar(rng) {
  const h1 = Math.floor(rng() * 360);
  const h2 = (h1 + 40 + Math.floor(rng() * 80)) % 360;
  const skin = ['#e0b48f', '#c99470', '#a8734f', '#8a5a3b', '#f0c9a6'][Math.floor(rng() * 5)];
  const hair = ['#1b1512', '#2e211a', '#4a3527', '#120f0e'][Math.floor(rng() * 4)];
  const shirt = `hsl(${Math.floor(rng() * 360)},35%,${35 + Math.floor(rng() * 25)}%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},30%,42%)"/><stop offset="1" stop-color="hsl(${h2},35%,22%)"/></linearGradient></defs>
<rect width="100" height="100" fill="url(#g)"/>
<ellipse cx="50" cy="104" rx="38" ry="30" fill="${shirt}"/>
<rect x="43" y="58" width="14" height="16" fill="${skin}"/>
<ellipse cx="50" cy="44" rx="18" ry="21" fill="${skin}"/>
<path d="M31 42 Q32 20 50 20 Q69 20 69 42 Q66 30 50 29 Q35 30 31 42Z" fill="${hair}"/>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Variasi ketikan: huruf kecil, kata pengisi, typo satu huruf.
function typed(text, rng) {
  let s = rng() < 0.6 ? text.toLowerCase() : text;
  if (rng() < 0.15 && s.length > 5 && !/\d/.test(s)) {
    const i = 1 + Math.floor(rng() * (s.length - 2));
    s = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
  }
  if (rng() < 0.15) s = `jawabannya ${s}`;
  return s;
}

export class Sim {
  // gifts=false: tanpa gift acak (render preview menyuntik gift sendiri di waktu tertentu).
  constructor(engine, rng, { viewers = 60, gifts = true } = {}) {
    this.engine = engine;
    this.gifts = gifts;
    this.rng = rng;
    this.viewers = Array.from({ length: viewers }, (_, i) => {
      const name = FIRST[i % FIRST.length] + (i >= FIRST.length ? `_${i}` : '');
      return { user: `${name}_${100 + i}`, name, skill: 0.5 + rng() * 0.5, avatar: rng() < 0.75 ? fakeAvatar(rng) : null };
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
      if (e.phase === 'vote') this.planVotes(now);
    }
    // Pengirim gift sultan (penonton palsu) mengetik topik pilihannya beberapa detik kemudian.
    const pick = e.picks?.[0];
    if (pick && !pick.theme && pick !== this.pickPlanned && this.viewers.some((v) => v.user === pick.user)) {
      this.pickPlanned = pick;
      const themes = e.pickable();
      const t = themes[Math.floor(this.rng() * themes.length)];
      this.queue.push({ at: now + 2500 + this.rng() * 3000, evt: { type: 'comment', user: pick.user, name: pick.name, text: this.rng() < 0.5 ? t.keyword : `${t.label.toLowerCase()} dong` } });
      this.queue.sort((a, b) => a.at - b.at);
    }
    while (this.queue.length && this.queue[0].at <= now) e.handle(this.queue.shift().evt, now);

    const dt = this.last === null ? 0 : Math.min(1000, now - this.last);
    this.last = now;
    const r = this.rng;
    const per = (ratePerSec) => r() < (ratePerSec * dt) / 1000;
    if (per(0.6)) e.handle({ type: 'comment', ...this.pick(), text: CHAT[Math.floor(r() * CHAT.length)] }, now);
    if (per(1.5)) e.handle({ type: 'like', ...this.pick(), count: 3 + Math.floor(r() * 15) }, now);
    if (this.gifts && per(0.05)) {
      const [gift, coins] = GIFTS[Math.floor(r() * GIFTS.length)];
      const count = coins < 10 ? 1 + Math.floor(r() * 3) : 1;
      e.handle({ type: 'gift', ...this.pick(), gift, count, coins: coins * count }, now);
    }
    if (per(0.04)) e.handle({ type: 'follow', ...this.pick() }, now);
  }

  pick() {
    const v = this.viewers[Math.floor(this.rng() * this.viewers.length)];
    return { user: v.user, name: v.name, avatar: v.avatar };
  }

  planVotes(now) {
    const opts = this.engine.vote.options;
    const r = this.rng;
    // Selera penonton tidak rata: satu tema cenderung lebih populer.
    const fav = Math.floor(r() * opts.length);
    for (const v of this.viewers) {
      if (r() < 0.35) continue;
      const pick = r() < 0.45 ? fav : Math.floor(r() * opts.length);
      const text = r() < 0.7 ? opts[pick].keyword : opts[pick].label.toLowerCase();
      this.queue.push({ at: now + 800 + r() * 10000, evt: { type: 'comment', user: v.user, name: v.name, avatar: v.avatar, text } });
    }
    this.queue.sort((a, b) => a.at - b.at);
  }

  planAnswers(now) {
    const e = this.engine;
    const q = e.current.q;
    const span = e.cfg.answerMs;
    const r = this.rng;
    for (const v of this.viewers) {
      if (r() < 0.2) continue; // sebagian penonton tidak ikut menjawab
      const knows = r() < v.skill * SKILL[q.diff];
      let at = now + 2500 + r() ** 1.5 * (span - 4000);
      const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer);
      // Yang tidak tahu menebak acak, kadang mencoba lagi.
      const guesses = knows ? [q.answer] : [wrong[Math.floor(r() * wrong.length)], ...(r() < 0.5 ? [q.answer] : [])];
      for (const g of guesses) {
        this.queue.push({ at, evt: { type: 'comment', user: v.user, name: v.name, avatar: v.avatar, text: typed(q.options[g], r) } });
        at += 1500 + r() * 3000;
      }
    }
    this.queue.sort((a, b) => a.at - b.at);
  }
}
