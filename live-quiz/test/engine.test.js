import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuizEngine, mulberry32, DEFAULTS, buildMatcher, matchAnswer, normalize, editDistance } from '../public/engine.js';
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
  const e = make();
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

test('rumus skor: dasar per tingkat, bonus cepat, beruntun', () => {
  const e = make();
  const A = DEFAULTS.answerMs;
  assert.deepEqual(e.pointsFor('mudah', 0, 1), { base: 100, bonus: 50, streakPts: 0, total: 150 });
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

test('like mencapai target menghapus dua jawaban salah', () => {
  const e = make({ startWith: 'jupiter' });
  e.start(0);
  const t = advanceTo(e, 'answer');
  e.handle({ type: 'like', user: 'x', count: 60 }, t + 10);
  assert.equal(e.view(t + 10).removed.length, 0);
  e.handle({ type: 'like', user: 'x', count: 60 }, t + 20);
  const v = e.view(t + 20);
  assert.equal(v.removed.length, 2);
  assert.ok(!v.removed.includes(v.question.answer));
  assert.equal(v.toasts.at(-1).kind, 'hint');
  // Jawaban ke opsi yang sudah dihapus tidak dihitung.
  e.handle({ type: 'comment', user: 'y', text: letter(v.removed[0]) }, t + 30);
  assert.equal(e.view(t + 30).totalAnswers, 0);
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
  assert.ok(i > 0 && seq[i + 1] === 'standings10' && seq[i + 2] === 'rules0');
  assert.equal(e.view(t).roundBoard.length, 0); // skor ronde direset
  assert.equal(e.view(t).standings[0].name, 'Satu'); // klasemen sesi tetap
  assert.equal(e.view(t).standings[0].correct, 10);
});

test('gift dan follow jadi toast, maksimal 3', () => {
  const e = make();
  e.start(0);
  for (let i = 0; i < 5; i++) e.handle({ type: 'gift', name: `g${i}`, gift: 'Mawar', count: 2 }, i);
  e.handle({ type: 'follow', name: 'Budi' }, 10);
  const v = e.view(10);
  assert.equal(v.toasts.length, 3);
  assert.equal(v.toasts.at(-1).name, 'Budi');
  assert.match(v.toasts[1].text, /Mawar x2/);
  e.tick(10 + DEFAULTS.toastMs + 1);
  assert.equal(e.view(10 + DEFAULTS.toastMs + 1).toasts.length, 0);
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
