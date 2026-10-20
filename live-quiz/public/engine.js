// Mesin kuis: murni logika, tanpa DOM, supaya bisa dites di Node.
// Waktu selalu disuntikkan lewat argumen `now` (milidetik).
//
// Alur satu ronde:
//   rules -> [intro -> answer -> reveal -> winners] x10, dengan board setelah soal 5
//   -> podium -> standings -> vote (tema ronde berikutnya) -> ronde baru

export const DEFAULTS = {
  rulesMs: 9000,
  introMs: 3500,
  answerMs: 20000,
  revealMs: 7500,
  winnersMs: 7000,
  boardMs: 8000,
  podiumMs: 9000,
  standingsMs: 9000,
  voteMs: 15000,
  roundSize: 10,
  boardEvery: 5,
  hintLikes: 100,
  maxTries: 3,
  mix: { mudah: 4, sedang: 4, sulit: 2 },
  // Skor: poin dasar per tingkat, bonus cepat sampai speedBonus x dasar,
  // bonus beruntun mulai jawaban benar ke-streakFrom berturut-turut.
  points: { mudah: 100, sedang: 150, sulit: 200 },
  speedBonus: 0.5,
  streakFrom: 3,
  streakBonus: 50,
  toastMs: 4500,
  maxToasts: 3,
  wallSize: 40,
  // Gift: tingkat dihitung dari nilai koin (tidak pernah ditampilkan).
  // Boost mengalikan poin jawaban benar selama `questions` soal yang dijawab.
  giftTiers: [
    { tier: 'kecil', min: 1, mult: 2, questions: 1, ms: 3500, vote: 5 },
    { tier: 'sedang', min: 10, mult: 2, questions: 3, ms: 5000, vote: 20, hint: true },
    { tier: 'besar', min: 100, mult: 3, questions: 3, ms: 6500, vote: 50, freeze: true },
  ],
  boostMaxQuestions: 10,
  spotlightQueue: 8,
  supporters: 12,
};

// Tema ronde. `keyword` diketik penonton saat voting. `cats` memilih kategori bank soal,
// `gen` memakai generator soal peta.
export const THEMES = [
  { id: 'campuran', label: 'Campuran', keyword: 'campuran', alias: ['campur', 'acak', 'random', 'semua'] },
  { id: 'sains', label: 'Sains dan Alam', keyword: 'sains', cats: ['Sains', 'Tubuh Manusia', 'Hewan dan Alam', 'Luar Angkasa'], alias: ['ipa', 'alam'] },
  { id: 'sejarah', label: 'Sejarah', keyword: 'sejarah', cats: ['Sejarah Indonesia', 'Sejarah Dunia'] },
  { id: 'olahraga', label: 'Olahraga', keyword: 'olahraga', cats: ['Olahraga'], alias: ['sport', 'bola'] },
  { id: 'umum', label: 'Pengetahuan Umum', keyword: 'umum', cats: ['Geografi', 'Bahasa dan Budaya', 'Teknologi', 'Makanan', 'Seni dan Musik', 'Angka dan Skala', 'Benar atau Mitos'], alias: ['budaya'] },
  { id: 'negara', label: 'Tebak Negara', keyword: 'negara', gen: 'negara' },
  { id: 'provinsi', label: 'Tebak Provinsi', keyword: 'provinsi', gen: 'provinsi' },
];

// ---- Pencocokan jawaban ketik ----
// Penonton mengetik teks opsi di komentar. Huruf besar-kecil, tanda baca, spasi,
// dan typo kecil dimaafkan; angka harus persis.

const FILLER = new Set(['jawab', 'jawaban', 'jawabannya', 'jawabanya', 'jawabnya', 'jwb', 'kak', 'min',
  'bang', 'dong', 'deh', 'ya', 'yg', 'yang', 'adalah', 'itu', 'dah', 'kan', 'pilih', 'vote']);
const NUM_WORDS = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh'];

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)[.,](?=\d)/g, '$1') // 1.143 dan 42,195 jadi angka utuh
    .replace(/[-_'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const squash = (s) => normalize(s).replace(/ /g, '');

// Jarak edit dengan pertukaran dua huruf bersebelahan dihitung 1 ("bioal" -> "biola").
export function editDistance(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur[j] = d;
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

export function tolerance(key) {
  if (/\d/.test(key)) return 0;
  return key.length <= 4 ? 0 : key.length <= 8 ? 1 : 2;
}

// Daftar kunci per opsi: teks opsi, alias, dan kata bilangan untuk angka 0-10.
export function buildMatcher(q) {
  const entries = [];
  q.options.forEach((opt, index) => {
    const keys = new Set([squash(opt), ...(q.alias?.[opt] || []).map(squash)]);
    const n = Number(squash(opt));
    if (Number.isInteger(n) && n >= 0 && n < NUM_WORDS.length && /^\d+$/.test(squash(opt))) keys.add(NUM_WORDS[n]);
    for (const key of keys) if (key) entries.push({ index, key });
  });
  return entries;
}

// Komentar -> indeks opsi, atau null kalau bukan tebakan / ambigu.
// Potongan kata terpanjang yang cocok menang, jadi "papua barat" tidak ikut cocok ke "Papua".
// Di antara yang cocok, opsi dengan typo paling sedikit menang ("austria" bukan "Australia");
// seri berarti ambigu. Komentar boleh berisi kata pengisi ("jawabannya biola kak"), tapi
// kalimat panjang yang kebetulan memuat nama opsi tidak dihitung.
export function matchAnswer(text, matcher) {
  if (typeof text !== 'string' || text.length > 80) return null;
  const words = normalize(text).split(' ').filter((w) => w && !FILLER.has(w));
  if (!words.length || words.length > 5) return null;
  for (let len = Math.min(3, words.length); len >= 1; len--) {
    if (words.length > len + 1) continue;
    const best = new Map(); // indeks opsi -> jarak terkecil
    for (let i = 0; i + len <= words.length; i++) {
      const cand = words.slice(i, i + len).join('');
      for (const e of matcher) {
        const tol = tolerance(e.key);
        const d = editDistance(cand, e.key, tol);
        if (d <= tol && d < (best.get(e.index) ?? Infinity)) best.set(e.index, d);
      }
    }
    if (!best.size) continue;
    const min = Math.min(...best.values());
    const winners = [...best].filter(([, d]) => d === min);
    return winners.length === 1 ? winners[0][0] : null;
  }
  return null;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Hanya dipakai sebagai <img src>: URL http(s) dari TikTok, atau data:image dari simulasi.
const cleanAvatar = (url) => (typeof url === 'string' && /^(https?:\/\/|data:image\/)/.test(url) && url.length < 8000 ? url : null);

export class QuizEngine {
  // generators: { negara: (diff, rng, avoid) => soal, provinsi: ... } untuk tema peta.
  constructor(bank, { config = {}, rng = Math.random, startWith = null, theme = 'campuran', generators = {} } = {}) {
    this.bank = bank;
    this.cfg = {
      ...DEFAULTS,
      ...config,
      mix: { ...DEFAULTS.mix, ...(config.mix || {}) },
      points: { ...DEFAULTS.points, ...(config.points || {}) },
    };
    this.rng = rng;
    this.generators = generators;
    this.themes = THEMES.filter((t) => !t.gen || generators[t.gen]);
    this.nextTheme = this.themes.find((t) => t.id === theme) ?? this.themes[0];
    this.theme = null;
    this.recent = []; // id soal yang baru tampil, supaya tidak cepat berulang
    this.startWith = startWith;
    this.round = 0;
    this.players = new Map(); // uniqueId -> { name, avatar, score, correct, streak, boost }
    this.supporters = new Map(); // uniqueId -> { name, avatar, at }
    this.spotQueue = [];
    this.spot = null;
    this.toasts = [];
    this.totalLikes = 0;
    this.phase = 'idle';
    this.qIndex = -1;
    this.questions = [];
    this.current = null;
    this.vote = null;
    this.freezes = [];
    this.roundScores = new Map();
  }

  start(now) {
    this.newRound(now);
  }

  // ---------------------------------------------------------------- menyusun ronde

  // Satu ronde: campuran kesulitan sesuai cfg.mix, kategori tidak berurutan sama.
  buildRound(theme) {
    const picks = [];
    for (const [diff, n] of Object.entries(this.cfg.mix)) {
      for (let k = 0; k < n; k++) {
        const q = this.draw(theme, diff, picks);
        if (q) picks.push(q);
      }
    }
    // Tema campuran: satu soal tebak negara dan satu tebak provinsi ikut masuk.
    if (theme.id === 'campuran') {
      for (const [gen, diff] of [['negara', 'mudah'], ['provinsi', 'sedang']]) {
        const g = this.generators[gen];
        const i = picks.findIndex((q) => q.diff === diff && !q.gen);
        const q = g && i >= 0 ? g(diff, this.rng, new Set(this.recent)) : null;
        if (q) picks[i] = q;
      }
    }
    // Mudah dan sedang berselang-seling, soal sulit jadi penutup tiap paruh ronde
    // (tepat sebelum papan skor).
    const easy = shuffle(picks.filter((q) => q.diff === 'mudah'), this.rng);
    const mid = shuffle(picks.filter((q) => q.diff === 'sedang'), this.rng);
    const hard = shuffle(picks.filter((q) => q.diff === 'sulit'), this.rng);
    const base = [];
    while (easy.length || mid.length) {
      if (easy.length) base.push(easy.shift());
      if (mid.length) base.push(mid.shift());
    }
    const n = base.length + hard.length;
    let order = base;
    hard.forEach((q, k) => {
      const at = Math.round(((k + 1) * n) / hard.length) - 1;
      order.splice(Math.min(at, order.length), 0, q);
    });
    if (!theme.gen) order = this.spreadCategories(order);
    if (this.startWith) {
      const q = this.bank.find((x) => x.id === this.startWith);
      if (q) order = [q, ...order.filter((x) => x.id !== q.id)].slice(0, this.cfg.roundSize);
      this.startWith = null;
    }
    order = order.slice(0, this.cfg.roundSize);
    for (const q of order) this.remember(q.id);
    return order;
  }

  remember(id) {
    this.recent.push(id);
    const keep = Math.max(10, Math.floor(this.bank.length * 0.6));
    if (this.recent.length > keep) this.recent.splice(0, this.recent.length - keep);
  }

  // Ambil satu soal tema+tingkat yang belum tampil baru-baru ini. Kalau tema kehabisan,
  // longgarkan bertahap: abaikan riwayat, lalu tingkat lain, lalu seluruh bank.
  draw(theme, diff, taken) {
    const avoid = new Set([...this.recent, ...taken.map((q) => q.id)]);
    if (theme.gen) return this.generators[theme.gen](diff, this.rng, avoid);
    const inTheme = (q) => !theme.cats || theme.cats.includes(q.cat);
    const takenIds = new Set(taken.map((q) => q.id));
    const tiers = [
      (q) => inTheme(q) && q.diff === diff && !avoid.has(q.id),
      (q) => inTheme(q) && q.diff === diff && !takenIds.has(q.id),
      (q) => inTheme(q) && !takenIds.has(q.id),
      (q) => q.diff === diff && !avoid.has(q.id),
      (q) => !takenIds.has(q.id),
    ];
    for (const ok of tiers) {
      const list = this.bank.filter(ok);
      if (list.length) return list[Math.floor(this.rng() * list.length)];
    }
    return null;
  }

  spreadCategories(list) {
    const out = [];
    const rest = list.slice();
    while (rest.length) {
      const prev = out[out.length - 1];
      let i = rest.findIndex((q) => !prev || q.cat !== prev.cat);
      if (i < 0) i = 0;
      out.push(rest.splice(i, 1)[0]);
    }
    return out;
  }

  newRound(now) {
    this.round += 1;
    this.theme = this.nextTheme;
    this.questions = this.buildRound(this.theme);
    this.qIndex = -1;
    this.roundScores = new Map();
    this.current = null;
    this.setPhase('rules', now, this.cfg.rulesMs);
  }

  nextQuestion(now) {
    this.qIndex += 1;
    const q = this.present(this.questions[this.qIndex]);
    this.current = {
      q,
      answers: new Map(), // uniqueId -> { choice, ms, tries, done }
      matcher: buildMatcher(q),
      counts: new Array(q.options.length).fill(0),
      recent: [], // penjawab terakhir, untuk tumpukan avatar
      likes: 0,
      removed: new Set(),
      hintBy: null,
      results: [], // penjawab benar, urut tercepat
    };
    this.setPhase('intro', now, this.cfg.introMs);
  }

  // Salinan soal dengan opsi diacak, kecuali soal berurutan dan soal dua pilihan.
  present(q) {
    if (q.ordered || q.options.length < 3) return q;
    const idx = shuffle(q.options.map((_, i) => i), this.rng);
    return { ...q, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) };
  }

  setPhase(phase, now, duration) {
    this.phase = phase;
    this.phaseStart = now;
    this.phaseEnd = now + duration;
    this.freezes = [];
  }

  // ---------------------------------------------------------------- waktu berhenti

  // Hentikan timer menjawab selama ms (sorotan gift besar). Fase diperpanjang sebanyak itu.
  freeze(now, ms) {
    if (this.phase !== 'answer') return false;
    this.freezes.push({ start: now, end: now + ms });
    this.phaseEnd += ms;
    return true;
  }

  frozenBefore(now) {
    let total = 0;
    for (const f of this.freezes) total += Math.max(0, Math.min(now, f.end) - f.start);
    return total;
  }

  // Waktu menjawab yang sudah berjalan, tanpa masa berhenti.
  activeMs(now) {
    return now - this.phaseStart - this.frozenBefore(now);
  }

  isFrozen(now) {
    return this.freezes.some((f) => now >= f.start && now < f.end);
  }

  // ---------------------------------------------------------------- alur fase

  tick(now) {
    this.toasts = this.toasts.filter((t) => now - t.at < this.cfg.toastMs);
    this.tickSpotlight(now);
    if (this.phase === 'idle' || now < this.phaseEnd) return;
    const roundDone = this.qIndex >= this.questions.length - 1;
    const c = this.cfg;
    switch (this.phase) {
      case 'rules':
        this.nextQuestion(now);
        break;
      case 'intro':
        this.setPhase('answer', now, c.answerMs);
        break;
      case 'answer':
        this.score();
        this.setPhase('reveal', now, c.revealMs);
        break;
      case 'reveal':
        if (this.current.results.length) this.setPhase('winners', now, c.winnersMs);
        else this.afterQuestion(now, roundDone);
        break;
      case 'winners':
        this.afterQuestion(now, roundDone);
        break;
      case 'board':
        this.nextQuestion(now);
        break;
      case 'podium':
        this.setPhase('standings', now, c.standingsMs);
        break;
      case 'standings':
        this.openVote(now);
        break;
      case 'vote':
        this.closeVote();
        this.newRound(now);
        break;
    }
  }

  afterQuestion(now, roundDone) {
    if (roundDone) {
      if (this.roundScores.size) this.setPhase('podium', now, this.cfg.podiumMs);
      else this.setPhase('standings', now, this.cfg.standingsMs);
    } else if ((this.qIndex + 1) % this.cfg.boardEvery === 0) {
      this.setPhase('board', now, this.cfg.boardMs);
    } else {
      this.nextQuestion(now);
    }
  }

  // ---------------------------------------------------------------- voting tema

  // Empat tema pilihan, tanpa tema ronde ini, minimal satu tema tebak lokasi.
  openVote(now) {
    const others = shuffle(this.themes.filter((t) => t.id !== this.theme?.id), this.rng);
    let options = others.slice(0, 4);
    const geo = others.find((t) => t.gen);
    if (geo && !options.some((t) => t.gen)) options[3] = geo;
    options = options.filter(Boolean);
    const q = { options: options.map((t) => t.keyword), alias: Object.fromEntries(options.map((t) => [t.keyword, [t.label, ...(t.alias || [])]])) };
    this.vote = { options, matcher: buildMatcher(q), ballots: new Map(), winner: null };
    this.setPhase('vote', now, this.cfg.voteMs);
  }

  castVote(user, text) {
    const i = matchAnswer(text, this.vote.matcher);
    if (i === null) return;
    const prev = this.vote.ballots.get(user);
    this.vote.ballots.set(user, { choice: i, weight: prev?.weight ?? 1 });
  }

  voteTotals() {
    const totals = this.vote.options.map(() => 0);
    for (const b of this.vote.ballots.values()) totals[b.choice] += b.weight;
    return totals;
  }

  closeVote() {
    const totals = this.voteTotals();
    const best = Math.max(...totals);
    const top = this.vote.options.filter((_, i) => totals[i] === best);
    this.vote.winner = top[Math.floor(this.rng() * top.length)];
    this.nextTheme = this.vote.winner;
  }

  // ---------------------------------------------------------------- skor

  // Poin untuk satu jawaban benar. `streak` = jumlah benar beruntun termasuk soal ini.
  pointsFor(diff, msTaken, streak, mult = 1) {
    const c = this.cfg;
    const base = c.points[diff] ?? c.points.sedang;
    const left = Math.max(0, Math.min(1, 1 - msTaken / c.answerMs));
    const bonus = Math.round(base * c.speedBonus * left);
    const streakPts = streak >= c.streakFrom ? c.streakBonus : 0;
    return { base, bonus, streakPts, mult, total: (base + bonus + streakPts) * mult };
  }

  score() {
    const c = this.current;
    const results = [];
    for (const [id, p] of this.players) {
      const a = c.answers.get(id);
      // Boost terpakai satu per soal yang dijawab, benar atau salah.
      const mult = a && p.boost?.left > 0 ? p.boost.mult : 1;
      if (a && p.boost?.left > 0 && --p.boost.left === 0) p.boost = null;
      if (!a || a.choice !== c.q.answer) {
        p.streak = 0; // salah atau tidak menjawab: beruntun putus
        continue;
      }
      p.streak += 1;
      const pts = this.pointsFor(c.q.diff, a.ms, p.streak, mult);
      p.score += pts.total;
      p.correct += 1;
      const r = this.roundScores.get(id) || { user: id, name: p.name, avatar: p.avatar, score: 0, correct: 0 };
      r.name = p.name;
      r.avatar = p.avatar;
      r.score += pts.total;
      r.correct += 1;
      this.roundScores.set(id, r);
      results.push({ user: id, name: p.name, avatar: p.avatar, ms: a.ms, points: pts.total, streak: p.streak, mult });
    }
    results.sort((x, y) => x.ms - y.ms);
    c.results = results;
  }

  // ---------------------------------------------------------------- event

  player(user, name, avatar) {
    let p = this.players.get(user);
    if (p) {
      p.name = name;
      if (avatar) p.avatar = avatar;
    } else {
      p = { user, name, avatar, score: 0, correct: 0, streak: 0, boost: null };
      this.players.set(user, p);
    }
    return p;
  }

  // Event dari TikTok atau simulasi:
  // { type: 'comment'|'like'|'gift'|'follow'|'share', user, name, avatar, text, count, gift, coins }
  handle(evt, now) {
    if (!evt || typeof evt !== 'object') return;
    const user = String(evt.user || '').slice(0, 64);
    const name = String(evt.name || evt.user || 'seseorang').slice(0, 32);
    const avatar = cleanAvatar(evt.avatar);
    switch (evt.type) {
      case 'comment':
        if (!user) break;
        if (this.phase === 'vote') this.castVote(user, evt.text);
        else this.answer(user, name, avatar, evt.text, now);
        break;
      case 'like': {
        const n = Math.max(1, Math.min(1000, Number(evt.count) || 1));
        this.totalLikes += n;
        if (this.phase === 'answer') {
          const c = this.current;
          const before = c.likes;
          c.likes += n;
          if (before < this.cfg.hintLikes && c.likes >= this.cfg.hintLikes && this.applyHint()) {
            this.toast('hint', '', 'Like tembus target. Dua jawaban salah dicoret', now);
          }
        }
        break;
      }
      case 'gift':
        if (user) this.gift(user, name, avatar, evt, now);
        break;
      case 'follow':
        this.toast('follow', name, 'baru follow. Makasih!', now);
        break;
      case 'share':
        this.toast('share', name, 'membagikan live ini', now);
        break;
    }
  }

  // Gift: boost poin, sorotan foto profil dan nama, bobot suara saat voting.
  gift(user, name, avatar, evt, now) {
    const count = Math.max(1, Math.min(9999, Number(evt.count) || 1));
    const coins = Math.max(1, Number(evt.coins) || count);
    const tier = [...this.cfg.giftTiers].reverse().find((t) => coins >= t.min) ?? this.cfg.giftTiers[0];
    const giftName = String(evt.gift || 'hadiah').slice(0, 24);
    const p = this.player(user, name, avatar);

    const b = p.boost;
    p.boost = {
      mult: Math.max(b?.mult ?? 1, tier.mult),
      left: Math.min(this.cfg.boostMaxQuestions, (b?.left ?? 0) + tier.questions),
    };

    this.supporters.delete(user);
    this.supporters.set(user, { name, avatar: p.avatar, at: now });
    while (this.supporters.size > this.cfg.supporters) this.supporters.delete(this.supporters.keys().next().value);

    if (this.phase === 'vote') {
      const ballot = this.vote.ballots.get(user);
      if (ballot) ballot.weight += tier.vote;
    }

    // Gift beruntun dari orang dan jenis yang sama digabung jadi satu sorotan (combo).
    const same = (s) => s && s.user === user && s.gift === giftName && s.tier === tier.tier;
    const target = same(this.spot) ? this.spot : this.spotQueue.find(same);
    if (target) {
      target.count += count;
      target.mult = p.boost.mult;
      target.questions = p.boost.left;
      if (target === this.spot) this.spot.end = Math.max(this.spot.end, now + 1500);
      return;
    }
    const spot = { id: `${user}:${now}`, user, name, avatar: p.avatar, gift: giftName, giftImg: cleanAvatar(evt.giftImage), count, tier: tier.tier,
      mult: p.boost.mult, questions: p.boost.left, ms: tier.ms, hint: !!tier.hint, freeze: !!tier.freeze };
    // Antrean penuh: buang sorotan kecil paling lama, sorotan besar tidak pernah dibuang.
    if (this.spotQueue.length >= this.cfg.spotlightQueue) {
      const i = this.spotQueue.findIndex((s) => s.tier === 'kecil');
      if (i < 0 && spot.tier === 'kecil') return;
      this.spotQueue.splice(i < 0 ? 0 : i, 1);
    }
    this.spotQueue.push(spot);
  }

  tickSpotlight(now) {
    if (this.spot && now >= this.spot.end) this.spot = null;
    if (this.spot || !this.spotQueue.length) return;
    const s = this.spotQueue.shift();
    s.start = now;
    s.end = now + s.ms;
    s.frozen = s.freeze && this.freeze(now, s.ms);
    if (s.hint && this.phase === 'answer' && this.applyHint()) s.hintGiven = true;
    if (s.hintGiven) this.current.hintBy = s.name;
    this.spot = s;
  }

  // Maksimal cfg.maxTries tebakan; berhenti begitu benar. Mengulang tebakan yang sama
  // atau menebak opsi yang sudah dihapus 50:50 tidak memakan jatah.
  answer(user, name, avatar, text, now) {
    if (this.phase !== 'answer') return;
    const c = this.current;
    const prev = c.answers.get(user);
    if (prev?.done) return;
    const choice = matchAnswer(text, c.matcher);
    if (choice === null || c.removed.has(choice) || prev?.choice === choice) return;
    const tries = (prev?.tries ?? 0) + 1;
    const done = choice === c.q.answer || tries >= this.cfg.maxTries;
    if (prev) c.counts[prev.choice] -= 1;
    c.counts[choice] += 1;
    c.answers.set(user, { choice, ms: this.activeMs(now), tries, done });
    const p = this.player(user, name, avatar);
    c.recent.push({ name, avatar: p.avatar });
    if (c.recent.length > 6) c.recent.shift();
  }

  // Bantuan 50:50, hanya untuk soal 4 pilihan.
  applyHint() {
    const c = this.current;
    if (!c || c.q.options.length < 4 || c.removed.size) return false;
    const wrong = shuffle(c.q.options.map((_, i) => i).filter((i) => i !== c.q.answer), this.rng);
    c.removed.add(wrong[0]);
    c.removed.add(wrong[1]);
    return true;
  }

  toast(kind, name, text, now) {
    this.toasts.push({ kind, name, text, at: now });
    if (this.toasts.length > this.cfg.maxToasts) this.toasts.shift();
  }

  // Entri papan skor; boost aktif ikut ditampilkan.
  top(entries, n) {
    return [...entries].filter((e) => e.score > 0).sort((a, b) => b.score - a.score).slice(0, n)
      .map(({ user, name, avatar, score, correct }) => {
        const boost = this.players.get(user)?.boost;
        return { user, name, avatar, score, correct, boost: boost?.left > 0 ? boost.mult : 1, supporter: this.supporters.has(user) };
      });
  }

  view(now) {
    const c = this.current;
    const cfg = this.cfg;
    const frozenLeft = this.freezes.reduce((s, f) => s + Math.max(0, f.end - Math.max(now, f.start)), 0);
    const spot = this.spot && { ...this.spot, age: now - this.spot.start, dur: this.spot.end - this.spot.start };
    const votes = this.phase === 'vote' ? this.voteTotals() : null;
    return {
      phase: this.phase,
      elapsed: now - this.phaseStart,
      remaining: Math.max(0, this.phaseEnd - now - frozenLeft),
      duration: this.phaseEnd - this.phaseStart,
      frozen: this.isFrozen(now),
      round: this.round,
      theme: this.theme && { id: this.theme.id, label: this.theme.label },
      qNumber: this.qIndex + 1,
      qTotal: this.questions.length,
      question: c?.q ?? null,
      counts: c ? c.counts.slice() : [],
      totalAnswers: c ? c.answers.size : 0,
      recent: c ? c.recent.slice() : [],
      correctCount: c ? c.results.length : 0,
      winners: c ? c.results.slice(0, 3) : [],
      wall: c ? c.results.slice(3, 3 + cfg.wallSize) : [],
      removed: c ? [...c.removed] : [],
      hintBy: c?.hintBy ?? null,
      likes: c ? c.likes : 0,
      hintLikes: cfg.hintLikes,
      roundBoard: this.top(this.roundScores.values(), 5),
      standings: this.top(this.players.values(), 10),
      playerCount: this.players.size,
      supporters: [...this.supporters.values()].reverse(),
      spotlight: spot,
      vote: votes && {
        options: this.vote.options.map((t, i) => ({ id: t.id, label: t.label, keyword: t.keyword, votes: votes[i] })),
        voters: this.vote.ballots.size,
      },
      nextTheme: this.nextTheme && { id: this.nextTheme.id, label: this.nextTheme.label },
      rules: {
        points: { ...cfg.points },
        speedBonus: cfg.speedBonus,
        streakFrom: cfg.streakFrom,
        streakBonus: cfg.streakBonus,
        answerSec: Math.round(cfg.answerMs / 1000),
        hintLikes: cfg.hintLikes,
        maxTries: cfg.maxTries,
      },
      toasts: this.toasts.map((t) => ({ kind: t.kind, name: t.name, text: t.text, age: now - t.at })),
    };
  }
}
