// Mesin kuis: murni logika, tanpa DOM, supaya bisa dites di Node.
// Waktu selalu disuntikkan lewat argumen `now` (milidetik).
//
// Alur satu ronde:
//   rules -> [intro -> answer -> reveal -> winners] x10, dengan board setelah soal 5
//   -> podium -> standings -> ronde baru

export const DEFAULTS = {
  rulesMs: 9000,
  introMs: 3500,
  answerMs: 20000,
  revealMs: 7500,
  winnersMs: 7000,
  boardMs: 8000,
  podiumMs: 9000,
  standingsMs: 9000,
  roundSize: 10,
  boardEvery: 5,
  hintLikes: 100,
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
};

export const LETTERS = ['A', 'B', 'C', 'D'];

// "a", "B!", "jawab c", "C c c" -> indeks; selain itu null.
export function parseAnswer(text, optionCount) {
  if (typeof text !== 'string') return null;
  const words = text.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  const pick = words[0] === 'JAWAB' || words[0] === 'JAWABAN' ? words[1] : words[0];
  if (!pick || pick.length !== 1) return null;
  const i = LETTERS.indexOf(pick);
  return i >= 0 && i < optionCount ? i : null;
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

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const cleanAvatar = (url) => (typeof url === 'string' && /^https?:\/\//.test(url) ? url.slice(0, 600) : null);

export class QuizEngine {
  constructor(bank, { config = {}, rng = Math.random, startWith = null } = {}) {
    this.bank = bank;
    this.cfg = {
      ...DEFAULTS,
      ...config,
      mix: { ...DEFAULTS.mix, ...(config.mix || {}) },
      points: { ...DEFAULTS.points, ...(config.points || {}) },
    };
    this.rng = rng;
    this.pools = {};
    this.startWith = startWith;
    this.round = 0;
    this.players = new Map(); // uniqueId -> { name, avatar, score, correct, streak }
    this.toasts = [];
    this.totalLikes = 0;
    this.phase = 'idle';
    this.qIndex = -1;
    this.questions = [];
    this.current = null;
    this.roundScores = new Map();
  }

  start(now) {
    this.newRound(now);
  }

  // Satu ronde: campuran kesulitan sesuai cfg.mix, kategori tidak berurutan sama.
  buildRound() {
    const picks = [];
    for (const [diff, n] of Object.entries(this.cfg.mix)) {
      for (let k = 0; k < n; k++) {
        const q = this.draw(diff, picks);
        if (q) picks.push(q);
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
    order = this.spreadCategories(order);
    if (this.startWith) {
      const q = this.bank.find((x) => x.id === this.startWith);
      if (q) order = [q, ...order.filter((x) => x.id !== q.id)].slice(0, this.cfg.roundSize);
      this.startWith = null;
    }
    return order.slice(0, this.cfg.roundSize);
  }

  draw(diff, taken) {
    const takenIds = new Set(taken.map((q) => q.id));
    let pool = this.pools[diff];
    if (!pool || pool.length === 0) {
      pool = shuffle(this.bank.filter((q) => q.diff === diff && !takenIds.has(q.id)), this.rng);
      this.pools[diff] = pool;
    }
    while (pool.length) {
      const q = pool.pop();
      if (!takenIds.has(q.id)) return q;
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
    this.questions = this.buildRound();
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
      answers: new Map(), // uniqueId -> { choice, at }
      counts: new Array(q.options.length).fill(0),
      recent: [], // penjawab terakhir, untuk tumpukan avatar
      likes: 0,
      removed: new Set(),
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
  }

  tick(now) {
    this.toasts = this.toasts.filter((t) => now - t.at < this.cfg.toastMs);
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

  // Poin untuk satu jawaban benar. `streak` = jumlah benar beruntun termasuk soal ini.
  pointsFor(diff, msTaken, streak) {
    const c = this.cfg;
    const base = c.points[diff] ?? c.points.sedang;
    const left = Math.max(0, Math.min(1, 1 - msTaken / c.answerMs));
    const bonus = Math.round(base * c.speedBonus * left);
    const streakPts = streak >= c.streakFrom ? c.streakBonus : 0;
    return { base, bonus, streakPts, total: base + bonus + streakPts };
  }

  score() {
    const c = this.current;
    const results = [];
    for (const [id, p] of this.players) {
      const a = c.answers.get(id);
      if (!a || a.choice !== c.q.answer) {
        p.streak = 0; // salah atau tidak menjawab: beruntun putus
        continue;
      }
      p.streak += 1;
      const ms = a.at - this.phaseStart;
      const pts = this.pointsFor(c.q.diff, ms, p.streak);
      p.score += pts.total;
      p.correct += 1;
      const r = this.roundScores.get(id) || { name: p.name, avatar: p.avatar, score: 0, correct: 0 };
      r.name = p.name;
      r.avatar = p.avatar;
      r.score += pts.total;
      r.correct += 1;
      this.roundScores.set(id, r);
      results.push({ user: id, name: p.name, avatar: p.avatar, ms, points: pts.total, streak: p.streak });
    }
    results.sort((x, y) => x.ms - y.ms);
    c.results = results;
  }

  // Event dari TikTok atau simulasi:
  // { type: 'comment'|'like'|'gift'|'follow'|'share', user, name, avatar, text, count, gift }
  handle(evt, now) {
    if (!evt || typeof evt !== 'object') return;
    const user = String(evt.user || '').slice(0, 64);
    const name = String(evt.name || evt.user || 'seseorang').slice(0, 32);
    const avatar = cleanAvatar(evt.avatar);
    switch (evt.type) {
      case 'comment':
        if (user) this.answer(user, name, avatar, evt.text, now);
        break;
      case 'like': {
        const n = Math.max(1, Math.min(1000, Number(evt.count) || 1));
        this.totalLikes += n;
        if (this.phase === 'answer') {
          const c = this.current;
          const before = c.likes;
          c.likes += n;
          if (before < this.cfg.hintLikes && c.likes >= this.cfg.hintLikes && this.applyHint()) {
            this.toast('hint', '', 'Like tembus target. Dua jawaban salah dihapus', now);
          }
        }
        break;
      }
      case 'gift': {
        const count = Math.max(1, Number(evt.count) || 1);
        this.toast('gift', name, `kirim ${String(evt.gift || 'hadiah').slice(0, 24)}${count > 1 ? ` x${count}` : ''}`, now);
        break;
      }
      case 'follow':
        this.toast('follow', name, 'baru follow. Makasih!', now);
        break;
      case 'share':
        this.toast('share', name, 'membagikan live ini', now);
        break;
    }
  }

  answer(user, name, avatar, text, now) {
    if (this.phase !== 'answer') return;
    const c = this.current;
    if (c.answers.has(user)) return; // jawaban pertama yang dihitung
    const choice = parseAnswer(text, c.q.options.length);
    if (choice === null || c.removed.has(choice)) return;
    c.answers.set(user, { choice, at: now });
    c.counts[choice] += 1;
    const p = this.players.get(user);
    if (p) {
      p.name = name;
      if (avatar) p.avatar = avatar;
    } else {
      this.players.set(user, { name, avatar, score: 0, correct: 0, streak: 0 });
    }
    c.recent.push({ name, avatar: avatar || p?.avatar || null });
    if (c.recent.length > 6) c.recent.shift();
  }

  // Bantuan 50:50, hanya untuk soal 4 pilihan.
  applyHint() {
    const c = this.current;
    if (c.q.options.length < 4 || c.removed.size) return false;
    const wrong = shuffle(c.q.options.map((_, i) => i).filter((i) => i !== c.q.answer), this.rng);
    c.removed.add(wrong[0]);
    c.removed.add(wrong[1]);
    return true;
  }

  toast(kind, name, text, now) {
    this.toasts.push({ kind, name, text, at: now });
    if (this.toasts.length > this.cfg.maxToasts) this.toasts.shift();
  }

  top(entries, n) {
    return [...entries].filter((e) => e.score > 0).sort((a, b) => b.score - a.score).slice(0, n)
      .map(({ name, avatar, score, correct }) => ({ name, avatar, score, correct }));
  }

  view(now) {
    const c = this.current;
    const cfg = this.cfg;
    return {
      phase: this.phase,
      elapsed: now - this.phaseStart,
      remaining: Math.max(0, this.phaseEnd - now),
      duration: this.phaseEnd - this.phaseStart,
      round: this.round,
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
      likes: c ? c.likes : 0,
      hintLikes: cfg.hintLikes,
      roundBoard: this.top(this.roundScores.values(), 5),
      standings: this.top(this.players.values(), 10),
      playerCount: this.players.size,
      rules: {
        points: { ...cfg.points },
        speedBonus: cfg.speedBonus,
        streakFrom: cfg.streakFrom,
        streakBonus: cfg.streakBonus,
        answerSec: Math.round(cfg.answerMs / 1000),
        hintLikes: cfg.hintLikes,
      },
      toasts: this.toasts.map((t) => ({ kind: t.kind, name: t.name, text: t.text, age: now - t.at })),
    };
  }
}
