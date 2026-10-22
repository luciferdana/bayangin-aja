// Mesin kuis: murni logika, tanpa DOM, supaya bisa dites di Node.
// Waktu selalu disuntikkan lewat argumen `now` (milidetik).
//
// Alur satu ronde:
//   rules -> [intro -> answer -> reveal -> winners] x10, dengan board setelah soal 5
//   -> podium -> standings -> vote (tema ronde berikutnya) -> ronde baru
// Kalau ada pengirim gift sultan yang sudah memilih topik, vote dilewati:
//   standings -> picked (pengumuman topik pilihannya) -> ronde baru
import { mathQuestion } from './mtk.js';

export const DEFAULTS = {
  rulesMs: 9000,
  introMs: 3500,
  answerMs: 20000,
  revealMs: 7500,
  winnersMs: 7000,
  boardMs: 15000,
  podiumMs: 9000,
  standingsMs: 15000,
  voteMs: 30000,
  pickedMs: 6000, // pengumuman topik pilihan sultan (vote dilewati)
  voteCooldown: 2, // topik dari sekian ronde terakhir tidak ditawarkan lagi saat vote
  roundSize: 10,
  boardEvery: 5,
  // Pilihan jawaban terkunci di awal soal; terbuka setelah sekian like (atau gift sedang).
  hintLikes: 70,
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
  // Gift: tingkat dihitung dari nilai koin satu kiriman/combo (tidak pernah ditampilkan di sorotan).
  // Boost mengalikan poin jawaban benar selama `questions` soal yang dijawab.
  // `tier`: gaya sorotan (kecil/sedang = kartu, besar = takeover sultan bermusik).
  // `tries`: tambahan jatah tebakan selama soal boost yang sama. `freeze`: timer kuis berhenti
  // selama sorotan. `pick`: pengirim memilih topik ronde berikutnya lewat komentar.
  giftTiers: [
    { key: 'x1.5', tier: 'kecil', min: 1, mult: 1.5, questions: 1, ms: 3500 },
    { key: 'x2', tier: 'kecil', min: 5, mult: 2, questions: 2, ms: 3500 },
    { key: 'x2.5', tier: 'sedang', min: 10, mult: 2.5, questions: 3, ms: 5000, tries: 2 },
    { key: 'x3', tier: 'besar', min: 30, mult: 3, questions: 3, ms: 12500, tries: 2, freeze: true },
    { key: 'x5', tier: 'besar', min: 100, mult: 5, questions: 5, ms: 12500, tries: 2, freeze: true, pick: true },
  ],
  boostMaxQuestions: 10,
  spotlightQueue: 8,
  supporters: 12,
  pickQueue: 3, // antrean hak pilih topik (pengirim pertama dipakai dulu)
  // Setiap kelipatan sekian like (tap tap), tampilan berganti gelap <-> terang.
  themeLikes: 10000,
};

// Huruf pojok kartu topik di layar vote, urut kartu pertama sampai keempat.
export const VOTE_KEYS = ['a', 'k', 'q', 'j'];

// Tema ronde. `keyword` diketik penonton saat voting. `cats` memilih kategori bank soal,
// `gen` memakai generator soal peta.
export const THEMES = [
  // Campuran tidak ikut vote: tiap ronde satu topik penuh. Hanya lewat ?tema=campuran.
  { id: 'campuran', label: 'Campuran', keyword: 'campuran', alias: ['campur', 'acak', 'random', 'semua'], noVote: true },
  { id: 'sains', label: 'Sains dan Alam', keyword: 'sains', cats: ['Sains', 'Tubuh Manusia', 'Hewan dan Alam', 'Luar Angkasa'], alias: ['ipa', 'alam'] },
  { id: 'sejarah', label: 'Sejarah', keyword: 'sejarah', cats: ['Sejarah Indonesia', 'Sejarah Dunia'] },
  { id: 'olahraga', label: 'Olahraga', keyword: 'olahraga', cats: ['Olahraga'], alias: ['sport'] },
  { id: 'bola', label: 'Sepak Bola', keyword: 'bola', cats: ['Sepak Bola'], alias: ['sepak bola', 'sepakbola', 'football'] },
  { id: 'anime', label: 'Anime & Manga', keyword: 'anime', cats: ['Anime dan Manga'], alias: ['manga', 'wibu'] },
  { id: 'musik', label: 'Musik Indonesia', keyword: 'musik', cats: ['Musik Indonesia'], alias: ['lagu', 'music', 'lagu indo', 'musik indo', 'indo'] },
  { id: 'barat', label: 'Musik Barat', keyword: 'barat', cats: ['Musik Barat'],
    alias: ['lagu barat', 'musik barat', 'western', 'lagu inggris', 'musik inggris', 'english song', 'lagu luar'] },
  { id: 'inggris', label: 'Bahasa Inggris', keyword: 'inggris', cats: ['Bahasa Inggris'], alias: ['english', 'b inggris', 'bahasa inggris'] },
  // MTK: soal hitungan dibuat acak tiap tampil (tidak bisa dihafal), ditambah soal jebakan tetap.
  { id: 'mtk', label: 'Matematika', keyword: 'mtk', gen: 'mtk', cats: ['Matematika'], alias: ['matematika', 'math', 'hitung', 'itung'] },
  { id: 'kampus', label: 'Kampus', keyword: 'kampus', cats: ['Kampus'], alias: ['kuliah', 'universitas'] },
  { id: 'umum', label: 'Pengetahuan Umum', keyword: 'umum', cats: ['Geografi', 'Bahasa dan Budaya', 'Teknologi', 'Makanan', 'Seni dan Musik', 'Angka dan Skala', 'Benar atau Mitos'], alias: ['budaya'] },
  { id: 'negara', label: 'Tebak Negara', keyword: 'negara', gen: 'negara' },
  { id: 'provinsi', label: 'Tebak Provinsi', keyword: 'provinsi', gen: 'provinsi' },
  { id: 'bendera', label: 'Tebak Bendera', keyword: 'bendera', gen: 'bendera', alias: ['flag'] },
  { id: 'ibukota', label: 'Ibu Kota Provinsi', keyword: 'ibukota', gen: 'ibukota', alias: ['ibu kota provinsi', 'kota'] },
  { id: 'dunia', label: 'Ibu Kota Dunia', keyword: 'dunia', gen: 'dunia', alias: ['ibu kota negara', 'ibukota negara', 'ibu kota dunia'] },
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

// Komentar -> indeks topik. Seperti matchAnswer, tapi komentar yang menyebut dua topik
// ("musik inggris", "sains bola") tidak dibuang: topik yang disebut paling awal yang dihitung.
export function matchTopic(text, matcher) {
  const whole = matchAnswer(text, matcher);
  if (whole !== null || typeof text !== 'string' || text.length > 80) return whole;
  const words = normalize(text).split(' ').filter((w) => w && !FILLER.has(w));
  if (words.length > 8) return null;
  for (let i = 0; i < words.length; i++) {
    for (let len = Math.min(3, words.length - i); len >= 1; len--) {
      const cand = words.slice(i, i + len).join('');
      let best = null;
      let bestD = Infinity;
      let tie = false;
      for (const e of matcher) {
        const tol = tolerance(e.key);
        const d = editDistance(cand, e.key, tol);
        if (d > tol || (d === bestD && e.index === best)) continue;
        if (d < bestD) [best, bestD, tie] = [e.index, d, false];
        else if (d === bestD) tie = true;
      }
      if (best !== null && !tie) return best;
    }
  }
  return null;
}

// Pencocok topik dari daftar tema: kata kunci, label, dan alias.
export function topicMatcher(themes) {
  return buildMatcher({ options: themes.map((t) => t.keyword), alias: Object.fromEntries(themes.map((t) => [t.keyword, [t.label, ...(t.alias || [])]])) });
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
  // theme: topik ronde pertama; tanpa itu dipilih acak dari topik yang bisa di-vote.
  constructor(bank, { config = {}, rng = Math.random, startWith = null, theme = null, generators = {} } = {}) {
    this.bank = bank;
    this.cfg = {
      ...DEFAULTS,
      ...config,
      mix: { ...DEFAULTS.mix, ...(config.mix || {}) },
      points: { ...DEFAULTS.points, ...(config.points || {}) },
    };
    this.rng = rng;
    this.generators = { mtk: mathQuestion, ...generators };
    this.themes = THEMES.filter((t) => !t.gen || this.generators[t.gen]);
    const topics = this.themes.filter((t) => !t.noVote);
    this.fixedTheme = this.themes.find((t) => t.id === theme) ?? null; // ?tema= di URL
    this.nextTheme = this.fixedTheme ?? topics[Math.floor(rng() * topics.length)];
    this.theme = null;
    this.themeHistory = []; // id topik tiap ronde, terbaru di akhir
    this.cycle = new Set(); // topik yang sudah dimainkan di siklus vote ini
    this.used = new Map(); // id soal -> nomor urut terakhir tampil, untuk rotasi bank soal
    this.useSeq = 0;
    this.startWith = startWith;
    this.round = 0;
    this.players = new Map(); // uniqueId -> { name, avatar, score, correct, streak, boost }
    this.supporters = new Map(); // uniqueId -> { name, avatar, at }
    this.spotQueue = [];
    this.spot = null;
    this.toasts = [];
    this.totalLikes = 0;
    this.look = { n: 0, at: -Infinity }; // pergantian tema ke-n (tiap cfg.themeLikes like)
    this.picks = []; // hak pilih topik dari gift sultan: { user, name, avatar, theme, votes }
    this.picked = null; // pilihan yang sedang diumumkan (fase 'picked')
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
        const q = g && i >= 0 ? g(diff, this.rng, new Set(picks.map((x) => x.id)), (id) => this.used.get(id) ?? -1) : null;
        if (q) picks[i] = q;
      }
    }
    // Urutan acak penuh: soal mana pun (mudah, sedang, sulit) bisa jadi nomor 1. Hanya dijaga
    // supaya kategori yang sama tidak berurutan.
    let order = shuffle(picks, this.rng);
    // Soal jebakan lalu soal baru yang belum pernah tampil ditaruh di awal ronde.
    const unseen = (flag) => (q) => q[flag] && !this.used.has(q.id);
    const trap = unseen('jebakan');
    const fresh = unseen('baru');
    order = [...order.filter(trap), ...order.filter((q) => !trap(q) && fresh(q)), ...order.filter((q) => !trap(q) && !fresh(q))];
    if (!theme.gen) order = this.spreadCategories(order);
    if (this.startWith) {
      const q = this.bank.find((x) => x.id === this.startWith);
      if (q) order = [q, ...order.filter((x) => x.id !== q.id)].slice(0, this.cfg.roundSize);
      this.startWith = null;
    }
    order = order.slice(0, this.cfg.roundSize);
    // Dicatat sesuai urutan pengambilan (bukan urutan tampil) supaya giliran rotasinya tetap.
    // Soal hitungan acak tidak dicatat: angkanya selalu baru, catatannya cuma memenuhi penyimpanan.
    for (const q of [...picks.filter((x) => order.includes(x)), ...order.filter((x) => !picks.includes(x))]) {
      if (q.gen !== 'mtk') this.remember(q.id);
    }
    return order;
  }

  remember(id) {
    this.used.set(id, ++this.useSeq);
  }

  // Catatan rotasi (giliran soal + siklus topik) untuk disimpan antar sesi, supaya live baru atau
  // halaman yang dimuat ulang melanjutkan giliran, bukan mulai dari soal yang sama lagi.
  rotation() {
    return { used: [...this.used], useSeq: this.useSeq, cycle: [...this.cycle], history: this.themeHistory.slice(-this.cfg.voteCooldown) };
  }

  restoreRotation(r) {
    if (!r || typeof r !== 'object') return;
    if (Array.isArray(r.used)) this.used = new Map(r.used.filter((x) => Array.isArray(x) && typeof x[0] === 'string' && Number.isFinite(x[1])));
    if (Number.isFinite(r.useSeq)) this.useSeq = Math.max(r.useSeq, ...this.used.values(), 0);
    const ids = new Set(this.themes.map((t) => t.id));
    if (Array.isArray(r.cycle)) this.cycle = new Set(r.cycle.filter((id) => ids.has(id)));
    if (Array.isArray(r.history)) this.themeHistory = r.history.filter((id) => ids.has(id));
    // Topik ronde pertama diambil dari sisa siklus, bukan yang baru saja dimainkan.
    const left = this.themes.filter((t) => !t.noVote && !this.cycle.has(t.id) && !this.themeHistory.includes(t.id));
    if (left.length && !this.fixedTheme) this.nextTheme = left[Math.floor(this.rng() * left.length)];
  }

  // Ambil satu soal tema+tingkat secara bergiliran: soal yang belum pernah tampil dulu,
  // lalu yang paling lama tidak tampil. Jadi semua soal satu topik keluar sebelum ada yang
  // terulang. Kalau tema kehabisan tingkat itu, ambil tingkat lain, lalu seluruh bank.
  draw(theme, diff, taken) {
    const last = (id) => this.used.get(id) ?? -1;
    const takenIds = new Set(taken.map((q) => q.id));
    // Soal bertanda `jebakan: true` lalu `baru: true` yang belum pernah tampil didahulukan dari soal
    // lama yang belum tampil.
    const rank = (q) => this.used.get(q.id) ?? (q.jebakan ? -3 : q.baru ? -2 : -1);
    if (theme.gen) {
      // Tema generator yang juga punya soal tetap (MTK): soal tetap yang belum tampil dulu, sesekali
      // soal tetap lama, selebihnya soal buatan generator.
      if (theme.cats) {
        const list = this.bank.filter((q) => theme.cats.includes(q.cat) && q.diff === diff && !takenIds.has(q.id));
        const oldest = list.length ? Math.min(...list.map(rank)) : 0;
        if (list.length && (oldest < 0 || this.rng() < 0.2)) {
          const pool = list.filter((q) => rank(q) === oldest);
          return pool[Math.floor(this.rng() * pool.length)];
        }
      }
      return this.generators[theme.gen](diff, this.rng, takenIds, last);
    }
    const inTheme = (q) => !theme.cats || theme.cats.includes(q.cat);
    const tiers = [
      (q) => inTheme(q) && q.diff === diff,
      (q) => inTheme(q),
      (q) => q.diff === diff,
      () => true,
    ];
    for (const ok of tiers) {
      const list = this.bank.filter((q) => ok(q) && !takenIds.has(q.id));
      if (!list.length) continue;
      const oldest = Math.min(...list.map(rank));
      const pool = list.filter((q) => rank(q) === oldest);
      return pool[Math.floor(this.rng() * pool.length)];
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
    this.themeHistory.push(this.theme.id);
    if (!this.theme.noVote) this.cycle.add(this.theme.id);
    if (this.themeHistory.length > 20) this.themeHistory.shift();
    this.questions = this.buildRound(this.theme);
    this.picked = null;
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
      shown: q.options.length < 3, // soal Benar/Mitos selalu tampil pilihannya
      openedBy: null,
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
        if (this.picks[0]?.theme) this.showPick(now);
        else this.openVote(now);
        break;
      case 'vote':
        this.closeVote();
        this.newRound(now);
        break;
      case 'picked':
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

  // Topik yang sudah dimainkan tidak ditawarkan lagi sampai semua topik kebagian (satu siklus).
  // Pilihan diambil dari sisa siklus: empat topik, atau kurang kalau sisanya tinggal segitu
  // (sisa satu = vote satu kartu). Setelah semua kebagian, siklus baru dimulai tanpa topik dari
  // cfg.voteCooldown ronde terakhir. Minimal satu topik tebak lokasi/bendera kalau ada.
  openVote(now) {
    // Hak pilih topik yang tidak dipakai (pengirimnya tidak mengetik topik) gugur setelah dua vote,
    // supaya antrean pengirim sultan berikutnya tidak tertahan.
    const head = this.picks[0];
    if (head && !head.theme && ++head.votes > 2) this.picks.shift();
    const votable = this.themes.filter((t) => !t.noVote);
    let pool = shuffle(votable.filter((t) => !this.cycle.has(t.id)), this.rng);
    if (!pool.length) {
      this.cycle = new Set();
      const recent = this.themeHistory.slice(-this.cfg.voteCooldown);
      pool = shuffle(votable.filter((t) => !recent.includes(t.id)), this.rng);
    }
    let options = pool.slice(0, 4);
    const geo = pool.find((t) => t.gen && t.id !== 'mtk' && !options.includes(t));
    if (geo && options.length === 4 && !options.some((t) => t.gen && t.id !== 'mtk')) options[3] = geo;
    this.vote = { options, matcher: topicMatcher(options), ballots: new Map(), winner: null };
    this.setPhase('vote', now, this.cfg.voteMs);
  }

  // Satu orang satu suara; memilih lagi memindahkan suaranya.
  castVote(user, text) {
    // Huruf di pojok kartu (A K Q J) juga dihitung: banyak penonton cuma mengetik hurufnya.
    const key = String(text ?? '').trim().toLowerCase().replace(/^kartu\s+/, '').replace(/[^a-z]/g, '');
    const byKey = VOTE_KEYS.indexOf(key);
    const i = byKey >= 0 && byKey < this.vote.options.length ? byKey : matchTopic(text, this.vote.matcher);
    if (i === null) return;
    this.vote.ballots.set(user, { choice: i, weight: 1 });
  }

  // Topik yang boleh dipilih pengirim gift sultan: semua topik vote kecuali yang sedang/baru dimainkan.
  pickable() {
    return this.themes.filter((t) => !t.noVote && t.id !== this.theme?.id);
  }

  // Komentar pengirim gift sultan (giliran pertama di antrean) yang menyebut topik mengunci topik
  // ronde berikutnya. Saat vote berjalan, vote langsung dihentikan dan pilihannya diumumkan.
  // Mengembalikan true kalau komentarnya dipakai sebagai pilihan topik.
  pickTopic(user, text, now) {
    const p = this.picks[0];
    if (!p || p.user !== user || p.theme) return false;
    // Saat menjawab, jawaban soal didahulukan.
    if (this.phase === 'answer' && matchAnswer(text, this.current.matcher) !== null) return false;
    const themes = this.pickable();
    const i = matchTopic(text, topicMatcher(themes));
    if (i === null) return false;
    p.theme = themes[i];
    this.toast('pick', p.name, `memilih topik ${p.theme.label} buat ronde depan`, now);
    if (this.phase === 'vote') this.showPick(now);
    return true;
  }

  showPick(now) {
    this.picked = this.picks.shift();
    this.nextTheme = this.picked.theme;
    this.vote = null;
    this.setPhase('picked', now, this.cfg.pickedMs);
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
    return { base, bonus, streakPts, mult, total: Math.round((base + bonus + streakPts) * mult) };
  }

  score() {
    const c = this.current;
    const results = [];
    for (const [id, p] of this.players) {
      const a = c.answers.get(id);
      // Boost terpakai satu per soal yang dijawab, benar atau salah.
      const mult = a && p.boost?.left > 0 ? p.boost.mult : 1;
      if (a && p.boost?.left > 0 && --p.boost.left === 0) p.boost = null;
      if (a && p.extra?.left > 0 && --p.extra.left === 0) p.extra = null;
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
      p = { user, name, avatar, score: 0, correct: 0, streak: 0, boost: null, extra: null };
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
        if (!user || this.pickTopic(user, evt.text, now)) break;
        if (this.phase === 'vote') this.castVote(user, evt.text);
        else this.answer(user, name, avatar, evt.text, now);
        break;
      case 'like': {
        const n = Math.max(1, Math.min(1000, Number(evt.count) || 1));
        this.totalLikes += n;
        const flips = Math.floor(this.totalLikes / this.cfg.themeLikes);
        if (flips > this.look.n) this.look = { n: flips, at: now };
        if (this.spot) this.spot.likes = (this.spot.likes ?? 0) + n; // sambutan penonton selama sorotan
        if (this.phase === 'answer') {
          const c = this.current;
          const before = c.likes;
          c.likes += n;
          if (!c.shown && before < this.cfg.hintLikes && c.likes >= this.cfg.hintLikes) {
            c.shown = true;
            this.toast('hint', '', `Like tembus ${this.cfg.hintLikes}. Pilihan jawaban dibuka`, now);
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

  // Gift: boost poin, sorotan foto profil dan nama, hak pilih topik untuk gift terbesar.
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

    if (tier.tries) {
      const x = p.extra;
      p.extra = {
        tries: Math.max(x?.tries ?? 0, tier.tries),
        left: Math.min(this.cfg.boostMaxQuestions, (x?.left ?? 0) + tier.questions),
      };
    }

    this.supporters.delete(user);
    this.supporters.set(user, { name, avatar: p.avatar, at: now });
    while (this.supporters.size > this.cfg.supporters) this.supporters.delete(this.supporters.keys().next().value);

    // Hak pilih topik: pengirim pertama dipakai lebih dulu, berikutnya mengantre ke ronde-ronde
    // setelahnya. Satu orang satu hak yang belum terpakai.
    if (tier.pick && this.picks.length < this.cfg.pickQueue && !this.picks.some((x) => x.user === user && !x.theme)) {
      this.picks.push({ user, name, avatar: p.avatar, theme: null, votes: 0 });
    }

    // Gift beruntun dari orang dan jenis yang sama digabung jadi satu sorotan (combo).
    const same = (s) => s && s.user === user && s.gift === giftName && s.key === tier.key;
    const target = same(this.spot) ? this.spot : this.spotQueue.find(same);
    if (target) {
      target.count += count;
      target.mult = p.boost.mult;
      target.questions = p.boost.left;
      if (target === this.spot) this.spot.end = Math.max(this.spot.end, now + 1500);
      return;
    }
    const spot = { id: `${user}:${now}`, user, name, avatar: p.avatar, gift: giftName, giftImg: cleanAvatar(evt.giftImage), count,
      tier: tier.tier, key: tier.key, mult: p.boost.mult, questions: p.boost.left, ms: tier.ms, hint: !!tier.hint, freeze: !!tier.freeze,
      tries: tier.tries ?? 0, pick: !!tier.pick && this.picks.some((x) => x.user === user && !x.theme) };
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
    // Gift sedang: buka pilihan jawaban kalau masih terkunci, kalau sudah terbuka coret dua yang salah.
    if (s.hint && this.phase === 'answer') {
      const c = this.current;
      if (!c.shown) {
        c.shown = true;
        c.openedBy = s.name;
        s.hintGiven = 'pilihan';
      } else if (this.applyHint()) {
        c.hintBy = s.name;
        s.hintGiven = '5050';
      }
    }
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
    const extra = this.players.get(user)?.extra;
    const max = this.cfg.maxTries + (extra?.left > 0 ? extra.tries : 0);
    const done = choice === c.q.answer || tries >= max;
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
      optionsShown: c ? c.shown : true,
      openedBy: c?.openedBy ?? null,
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
      // Hak pilih topik yang sedang berlaku (pengirim pertama di antrean) dan pengumumannya.
      pick: this.picks[0] && { name: this.picks[0].name, avatar: this.picks[0].avatar,
        theme: this.picks[0].theme && { id: this.picks[0].theme.id, label: this.picks[0].theme.label } },
      picked: this.phase === 'picked' && this.picked ? { name: this.picked.name, avatar: this.picked.avatar,
        theme: { id: this.picked.theme.id, label: this.picked.theme.label, keyword: this.picked.theme.keyword } } : null,
      // Tema tampilan: terang setiap kelipatan ganjil cfg.themeLikes like. age = ms sejak berganti.
      look: { light: this.look.n % 2 === 1, n: this.look.n, likes: this.look.n * cfg.themeLikes, age: now - this.look.at, every: cfg.themeLikes },
      totalLikes: this.totalLikes,
      rules: {
        points: { ...cfg.points },
        speedBonus: cfg.speedBonus,
        streakFrom: cfg.streakFrom,
        streakBonus: cfg.streakBonus,
        answerSec: Math.round(cfg.answerMs / 1000),
        hintLikes: cfg.hintLikes,
        maxTries: cfg.maxTries,
        giftTiers: cfg.giftTiers.map((t) => ({ key: t.key, tier: t.tier, min: t.min, mult: t.mult, questions: t.questions, hint: !!t.hint,
          freeze: !!t.freeze, tries: t.tries ?? 0, pick: !!t.pick })),
      },
      toasts: this.toasts.map((t) => ({ kind: t.kind, name: t.name, text: t.text, age: now - t.at })),
    };
  }
}
