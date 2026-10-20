// Mesin kuis: murni logika, tanpa DOM, supaya bisa dites di Node.
// Waktu selalu disuntikkan lewat argumen `now` (milidetik).

export const DEFAULTS = {
  introMs: 3500,
  answerMs: 20000,
  revealMs: 9000,
  boardMs: 8000,
  roundSize: 10,
  boardEvery: 5,
  hintLikes: 100,
  mix: { mudah: 4, sedang: 4, sulit: 2 },
  toastMs: 4500,
  maxToasts: 3,
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

export class QuizEngine {
  constructor(bank, { config = {}, rng = Math.random, startWith = null } = {}) {
    this.bank = bank;
    this.cfg = { ...DEFAULTS, ...config, mix: { ...DEFAULTS.mix, ...(config.mix || {}) } };
    this.rng = rng;
    this.pools = {};
    this.used = new Set();
    this.startWith = startWith;
    this.round = 0;
    this.players = new Map(); // uniqueId -> { name, score, correct }
    this.toasts = [];
    this.totalLikes = 0;
    this.phase = 'idle';
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
    this.nextQuestion(now);
  }

  nextQuestion(now) {
    this.qIndex += 1;
    const q = this.present(this.questions[this.qIndex]);
    this.current = {
      q,
      answers: new Map(), // uniqueId -> { choice, at }
      counts: new Array(q.options.length).fill(0),
      likes: 0,
      removed: new Set(),
      fastest: null,
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
    switch (this.phase) {
      case 'intro':
        this.setPhase('answer', now, this.cfg.answerMs);
        break;
      case 'answer':
        this.score(now);
        this.setPhase('reveal', now, this.cfg.revealMs);
        break;
      case 'reveal':
        if (roundDone || (this.qIndex + 1) % this.cfg.boardEvery === 0) {
          this.setPhase('board', now, this.cfg.boardMs);
        } else {
          this.nextQuestion(now);
        }
        break;
      case 'board':
        if (roundDone) this.newRound(now);
        else this.nextQuestion(now);
        break;
    }
  }

  score() {
    const c = this.current;
    const ans = c.q.answer;
    for (const [id, a] of c.answers) {
      if (a.choice !== ans) continue;
      const left = Math.max(0, 1 - (a.at - this.phaseStart) / this.cfg.answerMs);
      const pts = 100 + Math.round(50 * left);
      const p = this.players.get(id);
      p.score += pts;
      p.correct += 1;
      const r = this.roundScores.get(id) || { name: p.name, score: 0 };
      r.name = p.name;
      r.score += pts;
      this.roundScores.set(id, r);
      if (!c.fastest || a.at < c.fastest.at) c.fastest = { name: p.name, at: a.at };
    }
  }

  // Event dari TikTok atau simulasi:
  // { type: 'comment'|'like'|'gift'|'follow'|'share', user, name, text, count, gift }
  handle(evt, now) {
    if (!evt || typeof evt !== 'object') return;
    const user = String(evt.user || '').slice(0, 64);
    const name = String(evt.name || evt.user || 'seseorang').slice(0, 32);
    switch (evt.type) {
      case 'comment':
        if (user) this.answer(user, name, evt.text, now);
        break;
      case 'like': {
        const n = Math.max(1, Math.min(1000, Number(evt.count) || 1));
        this.totalLikes += n;
        if (this.phase === 'answer') {
          const c = this.current;
          const before = c.likes;
          c.likes += n;
          if (before < this.cfg.hintLikes && c.likes >= this.cfg.hintLikes && this.applyHint()) {
            this.toast('hint', 'Like tembus target! Dua jawaban salah dihapus', now);
          }
        }
        break;
      }
      case 'gift':
        this.toast('gift', `${name} kirim ${evt.gift || 'hadiah'}${evt.count > 1 ? ` x${evt.count}` : ''}. Makasih!`, now);
        break;
      case 'follow':
        this.toast('follow', `Makasih udah follow, ${name}!`, now);
        break;
      case 'share':
        this.toast('share', `${name} membagikan live ini`, now);
        break;
    }
  }

  answer(user, name, text, now) {
    if (this.phase !== 'answer') return;
    const c = this.current;
    if (c.answers.has(user)) return; // jawaban pertama yang dihitung
    const choice = parseAnswer(text, c.q.options.length);
    if (choice === null || c.removed.has(choice)) return;
    c.answers.set(user, { choice, at: now });
    c.counts[choice] += 1;
    const p = this.players.get(user);
    if (p) p.name = name;
    else this.players.set(user, { name, score: 0, correct: 0 });
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

  toast(kind, text, now) {
    this.toasts.push({ kind, text, at: now });
    if (this.toasts.length > this.cfg.maxToasts) this.toasts.shift();
  }

  top(map, n = 5) {
    return [...map.values()].sort((a, b) => b.score - a.score).slice(0, n)
      .map(({ name, score }) => ({ name, score }));
  }

  view(now) {
    const c = this.current;
    const total = c ? c.answers.size : 0;
    const roundDone = this.qIndex >= (this.questions?.length ?? 0) - 1;
    return {
      phase: this.phase,
      elapsed: now - this.phaseStart,
      remaining: Math.max(0, this.phaseEnd - now),
      duration: this.phaseEnd - this.phaseStart,
      round: this.round,
      qNumber: this.qIndex + 1,
      qTotal: this.questions?.length ?? 0,
      question: c?.q ?? null,
      counts: c ? c.counts.slice() : [],
      totalAnswers: total,
      correctCount: c ? c.counts[c.q.answer] : 0,
      removed: c ? [...c.removed] : [],
      likes: c ? c.likes : 0,
      hintLikes: this.cfg.hintLikes,
      fastest: c?.fastest?.name ?? null,
      roundBoard: this.top(this.roundScores || new Map()),
      finalBoard: this.phase === 'board' && roundDone,
      toasts: this.toasts.map((t) => ({ kind: t.kind, text: t.text, age: now - t.at })),
    };
  }
}
