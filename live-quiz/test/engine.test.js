import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuizEngine, mulberry32, DEFAULTS, THEMES, buildMatcher, matchAnswer, normalize, editDistance } from '../public/engine.js';
import { QUESTIONS } from '../public/questions.js';

const make = (opts = {}) => (engineRef.e = new QuizEngine(QUESTIONS, { rng: mulberry32(1), ...opts }));

// Maju sampai fase tertentu, kembalikan waktu sekarang.
function advanceTo(e, phase, t = 0) {
  for (let i = 0; i < 100 && e.phase !== phase; i++) {
    t = Math.max(t, e.phaseEnd);
    e.tick(t);
  }
  assert.equal(e.phase, phase);
  return t;
}

// Teks jawaban untuk opsi ke-i pada soal yang sedang tampil.
const letter = (i, e = engineRef.e) => e.current.q.options[i];
const engineRef = { e: null };

const Q = (id) => QUESTIONS.find((q) => q.id === id);

test('normalize', () => {
  assert.equal(normalize('  Paru-Paru! '), 'paruparu');
  assert.equal(normalize('42,195'), '42195');
  assert.equal(normalize('3.430'), '3430');
  assert.equal(normalize('Leonardo da Vinci'), 'leonardo da vinci');
});

test('matchAnswer: ejaan, typo, alias, kata pengisi', () => {
  const m = (id, t) => matchAnswer(t, buildMatcher(Q(id)));
  assert.equal(m('biola-1928', 'Biola'), 2);
  assert.equal(m('biola-1928', 'jawabannya biola kak'), 2);
  assert.equal(m('biola-1928', 'bioal'), 2); // typo 1 huruf
  assert.equal(m('biola-1928', 'gitar'), 1);
  assert.equal(m('biola-1928', 'a'), null); // huruf saja tidak dihitung
  assert.equal(m('biola-1928', 'kayaknya sih biola deh soalnya'), null); // kalimat panjang
  assert.equal(m('biola-1928', 'biola atau gitar'), null); // ambigu
  assert.equal(m('komodo', 'NTT'), 1);
  assert.equal(m('komodo', 'nusa tenggara timur'), 1);
  assert.equal(m('komodo', 'Nusa Tenggara Timr'), 1);
  assert.equal(m('komodo', 'nusa tenggara'), null);
  assert.equal(m('logam-cair', 'merkuri'), 2);
  assert.equal(m('kulit', 'paru paru'), 1);
  assert.equal(m('gurita', 'tiga'), 2);
  assert.equal(m('gurita', '3'), 2);
  assert.equal(m('maraton', '42.195'), 2);
  assert.equal(m('maraton', '42'), null);
  assert.equal(m('tulang', '207'), null); // angka harus persis
  assert.equal(m('rendang', 'sumbar'), 1);
  assert.equal(m('petir', 'mitos'), 1);
  assert.equal(m('petir', 'MITOS!!'), 1);
  assert.equal(m('petir', ''), null);
  assert.equal(m('petir', null), null);
});

test('ronde dibuka dengan cara main, lalu soal pertama', () => {
  const e = make();
  e.start(0);
  assert.equal(e.view(0).phase, 'rules');
  assert.equal(e.view(0).question, null);
  const t = advanceTo(e, 'intro');
  assert.equal(e.view(t).qNumber, 1);
});

test('ronde berisi campuran kesulitan tanpa soal ganda', () => {
  const e = make();
  e.start(0);
  const qs = e.questions;
  assert.equal(qs.length, 10);
  assert.equal(new Set(qs.map((q) => q.id)).size, 10);
  const d = (x) => qs.filter((q) => q.diff === x).length;
  assert.deepEqual([d('mudah'), d('sedang'), d('sulit')], [4, 4, 2]);
});

test('soal tidak berulang sampai bank habis', () => {
  const e = make({ theme: 'campuran' });
  e.start(0);
  const seen = new Set(e.questions.map((q) => q.id));
  for (let r = 0; r < 2; r++) {
    e.newRound(0);
    for (const q of e.questions) {
      assert.ok(!seen.has(q.id), `ulang ${q.id} di ronde ${r + 2}`);
      seen.add(q.id);
    }
  }
});

// Rotasi per topik: dalam satu tingkat, soal baru boleh terulang setelah semua soal tingkat itu
// di topik tersebut sudah tampil. Diuji untuk tiap topik bank soal, 8 ronde berturut-turut.
test('soal tiap topik dirotasi: semua keluar dulu sebelum ada yang terulang', () => {
  for (const theme of THEMES.filter((t) => t.cats)) {
    const e = make({ theme: theme.id });
    e.start(0);
    const total = {};
    for (const q of QUESTIONS) if (theme.cats.includes(q.cat)) total[q.diff] = (total[q.diff] ?? 0) + 1;
    const seen = { mudah: new Set(), sedang: new Set(), sulit: new Set() };
    for (let r = 0; r < 8; r++) {
      if (r > 0) {
        e.nextTheme = theme;
        e.newRound(0);
      }
      const ids = e.questions.map((q) => q.id);
      assert.equal(new Set(ids).size, ids.length, `${theme.id} ronde ${r + 1}: soal ganda dalam satu ronde`);
      // Urutan tampil dalam ronde diacak, jadi soal yang belum pernah keluar dihitung lebih dulu.
      const order = [...e.questions].sort((x, y) => seen[x.diff].has(x.id) - seen[y.diff].has(y.id));
      for (const q of order) {
        const s = seen[q.diff];
        if (s.has(q.id)) {
          assert.equal(s.size, total[q.diff], `${theme.id}: ${q.id} terulang padahal soal ${q.diff} lain belum keluar`);
          s.clear();
        }
        s.add(q.id);
        if (s.size === total[q.diff]) s.clear();
      }
    }
  }
});

// Soal bertanda baru: true keluar lebih dulu (sebelum soal lama yang belum tampil) dan di awal ronde.
test('soal baru didahulukan di ronde pertama topiknya', () => {
  for (const theme of THEMES.filter((t) => t.cats)) {
    const e = make({ theme: theme.id });
    e.start(0);
    const inTheme = QUESTIONS.filter((q) => theme.cats.includes(q.cat));
    for (const [diff, n] of Object.entries(DEFAULTS.mix)) {
      const fresh = inTheme.filter((q) => q.diff === diff && q.baru).length;
      const picked = e.questions.filter((q) => q.diff === diff);
      const want = Math.min(n, fresh, picked.length);
      assert.ok(picked.filter((q) => q.baru).length >= want, `${theme.id} ${diff}: soal baru tidak didahulukan`);
    }
    const flags = e.questions.map((q) => !!q.baru);
    assert.ok(flags.indexOf(false) === -1 || !flags.slice(flags.indexOf(false)).includes(true), `${theme.id}: soal baru tidak di awal ronde`);
  }
});

test('rumus skor: dasar per tingkat, bonus cepat, beruntun', () => {
  const e = make();
  const A = DEFAULTS.answerMs;
  assert.deepEqual(e.pointsFor('mudah', 0, 1), { base: 100, bonus: 50, streakPts: 0, mult: 1, total: 150 });
  assert.equal(e.pointsFor('mudah', 0, 1, 2).total, 300);
  assert.equal(e.pointsFor('sedang', A / 2, 1).total, 150 + 38);
  assert.equal(e.pointsFor('sulit', A, 1).total, 200);
  assert.equal(e.pointsFor('sulit', A, 3).total, 250);
});

test('alur jawaban, penilaian, dan pemenang tercepat', () => {
  const e = make();
  e.start(0);
  e.handle({ type: 'comment', user: 'u0', text: 'a' }, 1); // sebelum fase jawab: diabaikan
  const t = advanceTo(e, 'answer');
  const q = e.current.q;
  const right = letter(q.answer);
  const wrong = letter((q.answer + 1) % q.options.length);
  e.handle({ type: 'comment', user: 'u1', name: 'Satu', avatar: 'https://x.test/1.jpg', text: right }, t + 1000);
  e.handle({ type: 'comment', user: 'u2', name: 'Dua', text: right }, t + 5000);
  e.handle({ type: 'comment', user: 'u3', name: 'Tiga', text: wrong }, t + 500);
  e.handle({ type: 'comment', user: 'u1', name: 'Satu', text: wrong }, t + 6000); // sudah benar: terkunci
  e.handle({ type: 'comment', user: 'u4', name: 'Empat', avatar: 'javascript:alert(1)', text: right }, t + 7000);
  const v = e.view(t + 7000);
  assert.equal(v.totalAnswers, 4);
  assert.equal(v.counts[q.answer], 3);
  assert.equal(v.counts.reduce((a, b) => a + b), 4);
  assert.equal(v.recent.at(-1).name, 'Empat');
  assert.equal(v.recent.at(-1).avatar, null); // URL non-http ditolak
  const t2 = advanceTo(e, 'reveal', t);
  const r = e.view(t2);
  assert.equal(r.correctCount, 3);
  assert.deepEqual(r.winners.map((w) => w.name), ['Satu', 'Dua', 'Empat']);
  assert.equal(r.winners[0].avatar, 'https://x.test/1.jpg');
  assert.equal(r.winners[0].points, e.pointsFor(q.diff, 1000, 1).total);
  assert.equal(r.roundBoard[0].name, 'Satu');
  e.handle({ type: 'comment', user: 'u5', text: right }, t2 + 10); // terlambat
  assert.equal(e.view(t2 + 10).totalAnswers, 4);
  advanceTo(e, 'winners', t2);
});

test('tanpa jawaban benar, fase pemenang dilewati', () => {
  const e = make();
  e.start(0);
  let t = advanceTo(e, 'reveal');
  t = Math.max(t, e.phaseEnd);
  e.tick(t);
  assert.equal(e.phase, 'intro');
  assert.equal(e.qIndex, 1);
});

test('beruntun putus kalau tidak menjawab', () => {
  const e = make();
  e.start(0);
  let t = 0;
  const play = (answer) => {
    t = advanceTo(e, 'answer', t);
    if (answer) e.handle({ type: 'comment', user: 'u1', name: 'Satu', text: letter(e.current.q.answer) }, t + 100);
    t = advanceTo(e, 'reveal', t);
  };
  play(true); play(true); play(true);
  assert.equal(e.players.get('u1').streak, 3);
  assert.equal(e.view(t).winners[0].streak, 3);
  play(false);
  assert.equal(e.players.get('u1').streak, 0);
});

test('pilihan terkunci sampai like mencapai target', () => {
  const e = make({ startWith: 'jupiter' });
  e.start(0);
  const t = advanceTo(e, 'answer');
  assert.equal(e.view(t).optionsShown, false);
  // Menebak tetap bisa saat pilihan masih terkunci.
  e.handle({ type: 'comment', user: 'y', text: 'jupiter' }, t + 5);
  assert.equal(e.view(t + 5).totalAnswers, 1);
  e.handle({ type: 'like', user: 'x', count: DEFAULTS.hintLikes - 1 }, t + 10);
  assert.equal(e.view(t + 10).optionsShown, false);
  e.handle({ type: 'like', user: 'x', count: 5 }, t + 20);
  const v = e.view(t + 20);
  assert.equal(v.optionsShown, true);
  assert.equal(v.removed.length, 0);
  assert.equal(v.toasts.at(-1).kind, 'hint');
});

test('soal dua pilihan tidak pernah terkunci', () => {
  const q2 = QUESTIONS.find((q) => q.options.length === 2);
  const e = make({ startWith: q2.id });
  e.start(0);
  const t = advanceTo(e, 'answer');
  assert.equal(e.view(t).optionsShown, true);
});

test('maksimal 3 tebakan, tebakan kedua yang benar tetap dapat poin', () => {
  const e = make({ startWith: 'jupiter' });
  e.start(0);
  const t = advanceTo(e, 'answer');
  const q = e.current.q;
  const wrongs = q.options.map((_, i) => i).filter((i) => i !== q.answer);
  // u1: salah lalu benar
  e.handle({ type: 'comment', user: 'u1', text: letter(wrongs[0]) }, t + 100);
  e.handle({ type: 'comment', user: 'u1', text: letter(wrongs[0]) }, t + 150); // ulang sama: tidak memakan jatah
  e.handle({ type: 'comment', user: 'u1', text: letter(q.answer) }, t + 4000);
  // u2: tiga kali salah, lalu benar (terlambat, sudah habis jatah)
  for (const [k, w] of [wrongs[0], wrongs[1], wrongs[2], wrongs[0]].entries()) {
    e.handle({ type: 'comment', user: 'u2', text: letter(w) }, t + 200 + k);
  }
  e.handle({ type: 'comment', user: 'u2', text: letter(q.answer) }, t + 300);
  const v = e.view(t + 300);
  assert.equal(v.totalAnswers, 2);
  assert.equal(v.counts[q.answer], 1);
  assert.equal(e.current.answers.get('u1').tries, 2);
  assert.equal(e.current.answers.get('u2').tries, 3);
  const t2 = advanceTo(e, 'reveal', t);
  const r = e.view(t2);
  assert.deepEqual(r.winners.map((w) => w.user), ['u1']);
  assert.equal(r.winners[0].ms, 4000); // waktu tebakan yang benar
});

test('soal dua pilihan tidak memakai bantuan 50:50', () => {
  const e = make({ startWith: 'petir' });
  e.start(0);
  const t = advanceTo(e, 'answer');
  e.handle({ type: 'like', count: 500 }, t + 10);
  assert.equal(e.view(t + 10).removed.length, 0);
});

test('papan skor setelah soal 5, podium dan klasemen di akhir ronde', () => {
  const e = make();
  e.start(0);
  let t = 0;
  const seq = [];
  while (e.round === 1) {
    t = Math.max(t, e.phaseEnd);
    e.tick(t);
    if (e.phase === 'answer') e.handle({ type: 'comment', user: 'u1', name: 'Satu', text: letter(e.current.q.answer) }, t + 50);
    seq.push(`${e.phase}${e.qIndex + 1}`);
  }
  assert.ok(seq.includes('board5'));
  assert.ok(!seq.includes('board10'));
  const i = seq.indexOf('podium10');
  assert.ok(i > 0 && seq[i + 1] === 'standings10' && seq[i + 2] === 'vote10' && seq[i + 3] === 'rules0');
  assert.equal(e.view(t).roundBoard.length, 0); // skor ronde direset
  assert.equal(e.view(t).standings[0].name, 'Satu'); // klasemen sesi tetap
  assert.equal(e.view(t).standings[0].correct, 10);
});

test('follow dan share jadi toast, maksimal 3', () => {
  const e = make();
  e.start(0);
  for (let i = 0; i < 5; i++) e.handle({ type: 'share', name: `s${i}` }, i);
  e.handle({ type: 'follow', name: 'Budi' }, 10);
  const v = e.view(10);
  assert.equal(v.toasts.length, 3);
  assert.equal(v.toasts.at(-1).name, 'Budi');
  e.tick(10 + DEFAULTS.toastMs + 1);
  assert.equal(e.view(10 + DEFAULTS.toastMs + 1).toasts.length, 0);
});

test('gift: tingkat dari koin, boost, sorotan berantre, combo digabung', () => {
  const e = make();
  e.start(0);
  e.handle({ type: 'gift', user: 'a', name: 'A', gift: 'Mawar', count: 1, coins: 1 }, 10);
  e.handle({ type: 'gift', user: 'a', name: 'A', gift: 'Mawar', count: 4, coins: 4 }, 20); // combo
  e.handle({ type: 'gift', user: 'b', name: 'B', gift: 'Topi', count: 1, coins: 20 }, 30);
  e.handle({ type: 'gift', user: 'c', name: 'C', gift: 'Paus', count: 1, coins: 500 }, 40);
  e.tick(50);
  let v = e.view(50);
  assert.equal(v.spotlight.name, 'A');
  assert.equal(v.spotlight.count, 5);
  assert.equal(v.spotlight.tier, 'kecil');
  assert.ok(!('coins' in v.spotlight)); // nilai koin tidak pernah dibawa ke tampilan
  assert.deepEqual(e.players.get('a').boost, { mult: 2, left: 2 }); // 1 + 1 soal
  assert.deepEqual(e.players.get('b').boost, { mult: 2, left: 3 });
  assert.deepEqual(e.players.get('c').boost, { mult: 3, left: 3 });
  let t = 50;
  const seen = [];
  for (; t < 30000; t += 100) {
    e.tick(t);
    const s = e.view(t).spotlight;
    if (s && seen.at(-1) !== s.name) seen.push(s.name);
  }
  assert.deepEqual(seen, ['A', 'B', 'C']);
  assert.deepEqual(e.view(t).supporters.map((x) => x.name), ['C', 'B', 'A']);
});

test('boost mengalikan poin jawaban benar dan habis setelah dipakai', () => {
  const e = make();
  e.start(0);
  e.handle({ type: 'gift', user: 'u1', name: 'Satu', gift: 'Mawar', coins: 1 }, 1);
  let t = advanceTo(e, 'answer');
  e.handle({ type: 'comment', user: 'u1', name: 'Satu', text: letter(e.current.q.answer) }, t + 1000);
  e.handle({ type: 'comment', user: 'u2', name: 'Dua', text: letter(e.current.q.answer) }, t + 1000);
  t = advanceTo(e, 'reveal', t);
  const [w1, w2] = e.view(t).winners;
  assert.equal(w1.mult, 2);
  assert.equal(w1.points, w2.points * 2);
  assert.equal(e.players.get('u1').boost, null);
});

test('gift besar menghentikan timer, jawaban saat berhenti tidak kehilangan bonus', () => {
  const e = make({ startWith: 'jupiter' });
  e.start(0);
  const t = advanceTo(e, 'answer');
  e.handle({ type: 'gift', user: 'c', name: 'C', gift: 'Paus', coins: 500 }, t + 5000);
  e.tick(t + 5000);
  const big = DEFAULTS.giftTiers[2].ms;
  const v = e.view(t + 6000);
  assert.ok(v.frozen);
  assert.equal(v.remaining, DEFAULTS.answerMs - 5000); // timer diam
  e.handle({ type: 'comment', user: 'u1', text: letter(e.current.q.answer) }, t + 7000);
  assert.equal(e.current.answers.get('u1').ms, 5000);
  e.tick(t + 5000 + big + 1000);
  assert.equal(e.view(t + 5000 + big + 1000).remaining, DEFAULTS.answerMs - 6000);
  assert.equal(e.phaseEnd, t + DEFAULTS.answerMs + big);
});

test('gift sedang menambah jatah tebakan, tidak membuka pilihan untuk semua', () => {
  const e = make({ startWith: 'jupiter' });
  e.start(0);
  const t = advanceTo(e, 'answer');
  e.handle({ type: 'gift', user: 'b', name: 'Bima', gift: 'Topi', coins: 20 }, t + 100);
  e.tick(t + 100);
  const v = e.view(t + 100);
  assert.equal(v.optionsShown, false);
  assert.equal(v.spotlight.tries, DEFAULTS.giftTiers[1].tries);
  const q = e.current.q;
  const wrongs = q.options.map((_, i) => i).filter((i) => i !== q.answer);
  // Empat tebakan salah (lebih dari jatah biasa 3), lalu benar: tetap dihitung untuk pengirim gift.
  const guesses = [wrongs[0], wrongs[1], wrongs[2], wrongs[0]];
  guesses.forEach((g, k) => e.handle({ type: 'comment', user: 'b', name: 'Bima', text: letter(g) }, t + 200 + k));
  assert.equal(e.current.answers.get('b').done, false);
  e.handle({ type: 'comment', user: 'b', name: 'Bima', text: letter(q.answer) }, t + 300);
  assert.equal(e.current.answers.get('b').choice, q.answer);
  // Penonton tanpa gift berhenti di jatah biasa.
  guesses.forEach((g, k) => e.handle({ type: 'comment', user: 'n', name: 'N', text: letter(g) }, t + 400 + k));
  assert.equal(e.current.answers.get('n').done, true);
  assert.equal(e.current.answers.get('n').tries, DEFAULTS.maxTries);
});

test('gift sultan di tengah ronde jadi suara topik saat vote', () => {
  const e = make({ generators: { negara: () => null, provinsi: () => null } });
  e.start(0);
  const sultan = DEFAULTS.giftTiers[2];
  e.handle({ type: 'gift', user: 's', name: 'Sultan', gift: 'Paus', coins: 500 }, 10);
  let t = 0;
  while (e.phase !== 'vote') { t = Math.max(t, e.phaseEnd); e.tick(t); }
  const [a, b] = e.view(t).vote.options;
  for (let i = 0; i < 5; i++) e.handle({ type: 'comment', user: `x${i}`, text: a.keyword }, t + 10);
  e.handle({ type: 'comment', user: 's', text: b.keyword }, t + 10);
  e.handle({ type: 'comment', user: 's', text: b.keyword }, t + 20); // bonus tidak dihitung dua kali
  assert.deepEqual(e.view(t + 20).vote.options.slice(0, 2).map((o) => o.votes), [5, 1 + sultan.vote]);
});

test('voting tema: suara terbanyak menang, gift menambah bobot', () => {
  const e = make({ generators: { negara: () => null, provinsi: () => null } });
  e.start(0);
  let t = 0;
  while (e.phase !== 'vote') { t = Math.max(t, e.phaseEnd); e.tick(t); }
  const v = e.view(t).vote;
  assert.equal(v.options.length, 4);
  assert.ok(!v.options.some((o) => o.id === 'campuran')); // tema ronde ini tidak ditawarkan lagi
  assert.ok(v.options.some((o) => o.id === 'negara' || o.id === 'provinsi'));
  const [a, b] = v.options;
  e.handle({ type: 'comment', user: 'x1', text: a.keyword }, t + 10);
  e.handle({ type: 'comment', user: 'x2', text: a.keyword }, t + 10);
  e.handle({ type: 'comment', user: 'x3', text: b.label.toUpperCase() }, t + 10);
  e.handle({ type: 'gift', user: 'x3', name: 'X3', gift: 'Mawar', coins: 1 }, t + 20);
  assert.deepEqual(e.view(t + 20).vote.options.slice(0, 2).map((o) => o.votes), [2, 1 + DEFAULTS.giftTiers[0].vote]);
  t = Math.max(t, e.phaseEnd);
  e.tick(t);
  assert.equal(e.phase, 'rules');
  assert.equal(e.view(t).theme.id, b.id);
});

test('ronde bertema mengambil soal dari kategorinya', () => {
  const e = make({ theme: 'olahraga' });
  e.start(0);
  const olahraga = QUESTIONS.filter((q) => q.cat === 'Olahraga').length;
  const n = e.questions.filter((q) => q.cat === 'Olahraga').length;
  assert.ok(n >= Math.min(10, olahraga) - 1, `${n} soal olahraga`);
  assert.equal(e.view(0).theme.label, 'Olahraga');
});

test('matchAnswer: potongan terpanjang menang', () => {
  const m = buildMatcher({ options: ['Papua', 'Papua Barat', 'Papua Tengah', 'Maluku'] });
  assert.equal(matchAnswer('papua', m), 0);
  assert.equal(matchAnswer('papua barat', m), 1);
  assert.equal(matchAnswer('Papua Tengah', m), 2);
  assert.equal(matchAnswer('papua tengh', m), 2);
});

test('opsi diacak tapi jawaban tetap benar', () => {
  const e = make();
  const letters = [0, 0, 0, 0];
  for (const src of QUESTIONS) {
    const q = e.present(src);
    assert.equal(q.options[q.answer], src.options[src.answer], src.id);
    assert.deepEqual([...q.options].sort(), [...src.options].sort());
    if (src.ordered || src.options.length < 3) assert.deepEqual(q.options, src.options);
    else letters[q.answer] += 1;
  }
  assert.ok(Math.max(...letters) < 0.6 * letters.reduce((a, b) => a + b), `${letters}`);
});

test('tahan live 6 jam dengan banyak penonton', () => {
  const rng = mulberry32(9);
  const e = make();
  e.start(0);
  const end = 6 * 3600 * 1000;
  for (let t = 0; t < end; t += 250) {
    e.tick(t);
    const opts = e.current?.q.options ?? ['halo'];
    if (rng() < 0.5) e.handle({ type: 'comment', user: `u${Math.floor(rng() * 3000)}`, text: opts[Math.floor(rng() * opts.length)] }, t);
    if (rng() < 0.1) e.handle({ type: 'like', count: 15 }, t);
    if (rng() < 0.002) e.handle({ type: 'gift', name: 'g', gift: 'Mawar' }, t);
  }
  const v = e.view(end);
  assert.ok(e.round > 20, `ronde ${e.round}`);
  assert.ok(e.players.size <= 3000);
  assert.ok(v.toasts.length <= 3 && v.standings.length <= 10 && v.wall.length <= DEFAULTS.wallSize);
});

test('editDistance', () => {
  assert.equal(editDistance('biola', 'biola'), 0);
  assert.equal(editDistance('bioal', 'biola'), 1);
  assert.equal(editDistance('gitar', 'gitarr'), 1);
  assert.equal(editDistance('abc', 'xyz'), 3);
  assert.ok(editDistance('jupiter', 'saturnus', 2) > 2);
});

test('setiap ronde satu topik: ronde pertama acak tanpa campuran, vote tanpa campuran', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const e = new QuizEngine(QUESTIONS, { rng: mulberry32(seed), generators: { negara: () => null, provinsi: () => null } });
    e.start(0);
    assert.notEqual(e.view(0).theme.id, 'campuran');
    e.openVote(0);
    assert.ok(!e.vote.options.some((t) => t.id === 'campuran'));
  }
});

test('topik yang sudah dimainkan tidak ditawarkan lagi sampai semua topik kebagian', () => {
  const gens = { negara: () => null, provinsi: () => null, bendera: () => null, ibukota: () => null, dunia: () => null };
  for (let seed = 1; seed <= 20; seed++) {
    const e = new QuizEngine(QUESTIONS, { rng: mulberry32(seed), generators: gens });
    const total = e.themes.filter((t) => !t.noVote).length;
    e.start(0);
    for (let r = 1; r < total; r++) {
      e.openVote(0);
      const played = new Set(e.themeHistory);
      assert.equal(e.vote.options.length, Math.min(4, total - played.size));
      for (const o of e.vote.options) assert.ok(!played.has(o.id), `seed ${seed} ronde ${e.round}: ${o.id} sudah dimainkan`);
      e.closeVote();
      e.newRound(0);
    }
    assert.equal(new Set(e.themeHistory).size, total); // satu siklus penuh: semua topik tepat sekali
    // Siklus berikutnya: topik dari 2 ronde terakhir tetap tidak langsung muncul lagi.
    e.openVote(0);
    for (const o of e.vote.options) assert.ok(!e.themeHistory.slice(-2).includes(o.id));
  }
});

test('rotasi soal dan siklus topik berlanjut di sesi berikutnya', () => {
  const gens = { negara: () => null, provinsi: () => null, bendera: () => null, ibukota: () => null, dunia: () => null };
  const a = new QuizEngine(QUESTIONS, { rng: mulberry32(3), generators: gens });
  a.start(0);
  for (let r = 0; r < 3; r++) {
    a.openVote(0);
    a.closeVote();
    a.newRound(0);
  }
  const saved = JSON.parse(JSON.stringify(a.rotation()));
  const b = new QuizEngine(QUESTIONS, { rng: mulberry32(99), generators: gens });
  b.restoreRotation(saved);
  b.start(0);
  assert.ok(!saved.cycle.includes(b.theme.id), 'ronde pertama sesi baru memakai topik yang belum dimainkan');
  // Soal ronde pertama sesi baru tidak mengulang soal dari sesi lama selama masih ada yang belum tampil.
  const oldIds = new Set(saved.used.map(([id]) => id));
  const fresh = QUESTIONS.filter((q) => (!b.theme.cats || b.theme.cats.includes(q.cat)) && !oldIds.has(q.id));
  if (fresh.length >= b.questions.length) for (const q of b.questions) assert.ok(!oldIds.has(q.id), `${q.id} terulang`);
  b.restoreRotation({ used: 'rusak', cycle: [42, 'tidakada'] }); // data rusak tidak membuat error
});

test('vote topik bisa pakai huruf kartu (A K Q J) atau nama topik', () => {
  const e = make({ generators: { negara: () => null, provinsi: () => null } });
  e.start(0);
  e.openVote(0);
  const [a, , q] = e.vote.options;
  e.handle({ type: 'comment', user: 'u1', text: 'A' }, 10);
  e.handle({ type: 'comment', user: 'u2', text: ' q ' }, 10);
  e.handle({ type: 'comment', user: 'u3', text: 'kartu Q' }, 10);
  e.handle({ type: 'comment', user: 'u4', text: a.keyword }, 10);
  e.handle({ type: 'comment', user: 'u5', text: 'z' }, 10); // bukan huruf kartu: tidak dihitung
  const votes = e.view(10).vote.options.map((o) => o.votes);
  assert.equal(votes[0], 2);
  assert.equal(votes[2], 2);
  assert.equal(e.view(10).vote.voters, 4);
  assert.ok(q);
});

test('topik dari 2 ronde terakhir tidak muncul di vote', () => {
  const gens = { negara: () => null, provinsi: () => null, bendera: () => null };
  for (let seed = 1; seed <= 30; seed++) {
    const e = new QuizEngine(QUESTIONS, { rng: mulberry32(seed), generators: gens });
    e.start(0);
    for (let r = 0; r < 6; r++) {
      e.openVote(0);
      const recent = e.themeHistory.slice(-2);
      assert.equal(e.vote.options.length, 4);
      for (const o of e.vote.options) assert.ok(!recent.includes(o.id), `ronde ${e.round}: ${o.id} baru dimainkan`);
      e.closeVote();
      e.newRound(0);
    }
  }
});
