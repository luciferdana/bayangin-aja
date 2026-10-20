import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuizEngine, parseAnswer, mulberry32, DEFAULTS } from '../public/engine.js';
import { QUESTIONS } from '../public/questions.js';

const make = (opts = {}) => new QuizEngine(QUESTIONS, { rng: mulberry32(1), ...opts });
const toAnswer = (e, t) => { e.tick(t + DEFAULTS.introMs); return t + DEFAULTS.introMs; };

test('parseAnswer', () => {
  assert.equal(parseAnswer('a', 4), 0);
  assert.equal(parseAnswer(' B! ', 4), 1);
  assert.equal(parseAnswer('jawab c', 4), 2);
  assert.equal(parseAnswer('d d d', 4), 3);
  assert.equal(parseAnswer('C', 2), null);
  assert.equal(parseAnswer('aku pilih a dong ya', 4), null);
  assert.equal(parseAnswer('apa', 4), null);
  assert.equal(parseAnswer('', 4), null);
  assert.equal(parseAnswer(null, 4), null);
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

test('alur fase dan penilaian', () => {
  const e = make();
  e.start(0);
  assert.equal(e.view(0).phase, 'intro');
  e.handle({ type: 'comment', user: 'u0', text: 'a' }, 100); // sebelum fase jawab: diabaikan
  const t = toAnswer(e, 0);
  assert.equal(e.view(t).phase, 'answer');
  const q = e.current.q;
  const right = 'ABCD'[q.answer];
  const wrong = 'ABCD'[(q.answer + 1) % q.options.length];
  e.handle({ type: 'comment', user: 'u1', name: 'Satu', text: right }, t + 1000);
  e.handle({ type: 'comment', user: 'u2', name: 'Dua', text: right }, t + 5000);
  e.handle({ type: 'comment', user: 'u3', name: 'Tiga', text: wrong }, t + 500);
  e.handle({ type: 'comment', user: 'u1', name: 'Satu', text: wrong }, t + 6000); // ganti jawaban: diabaikan
  e.handle({ type: 'comment', user: 'u4', name: 'Empat', text: 'halo semua' }, t + 700);
  const v = e.view(t + 6000);
  assert.equal(v.totalAnswers, 3);
  assert.equal(v.counts[q.answer], 2);
  e.tick(t + DEFAULTS.answerMs);
  const r = e.view(t + DEFAULTS.answerMs);
  assert.equal(r.phase, 'reveal');
  assert.equal(r.fastest, 'Satu');
  assert.equal(r.roundBoard[0].name, 'Satu');
  assert.ok(r.roundBoard[0].score > r.roundBoard[1].score);
  assert.equal(r.roundBoard.length, 2);
  e.handle({ type: 'comment', user: 'u5', text: right }, t + DEFAULTS.answerMs + 10); // terlambat
  assert.equal(e.view(t + DEFAULTS.answerMs + 10).totalAnswers, 3);
});

test('like mencapai target menghapus dua jawaban salah', () => {
  const e = make({ startWith: 'jupiter' });
  e.start(0);
  const t = toAnswer(e, 0);
  e.handle({ type: 'like', user: 'x', count: 60 }, t + 10);
  assert.equal(e.view(t + 10).removed.length, 0);
  e.handle({ type: 'like', user: 'x', count: 60 }, t + 20);
  const v = e.view(t + 20);
  assert.equal(v.removed.length, 2);
  assert.ok(!v.removed.includes(v.question.answer));
  assert.equal(v.toasts.at(-1).kind, 'hint');
  // Jawaban ke opsi yang sudah dihapus tidak dihitung.
  e.handle({ type: 'comment', user: 'y', text: 'ABCD'[v.removed[0]] }, t + 30);
  assert.equal(e.view(t + 30).totalAnswers, 0);
});

test('soal dua pilihan tidak memakai bantuan 50:50', () => {
  const e = make({ startWith: 'petir' });
  e.start(0);
  const t = toAnswer(e, 0);
  e.handle({ type: 'like', count: 500 }, t + 10);
  assert.equal(e.view(t + 10).removed.length, 0);
});

test('papan skor tiap 5 soal dan ronde baru setelah 10 soal', () => {
  const e = make();
  e.start(0);
  let t = 0;
  const phases = [];
  for (let i = 0; i < 400 && e.round === 1; i++) {
    t = Math.max(t, e.phaseEnd);
    e.tick(t);
    phases.push(`${e.phase}${e.qIndex + 1}`);
  }
  assert.ok(phases.includes('board5'));
  assert.ok(phases.includes('board10'));
  assert.ok(!phases.includes('board4'));
  assert.equal(e.round, 2);
  assert.equal(e.view(t).roundBoard.length, 0); // skor ronde direset
});

test('gift dan follow jadi toast, maksimal 3', () => {
  const e = make();
  e.start(0);
  for (let i = 0; i < 5; i++) e.handle({ type: 'gift', name: `g${i}`, gift: 'Mawar', count: 2 }, i);
  e.handle({ type: 'follow', name: 'Budi' }, 10);
  const v = e.view(10);
  assert.equal(v.toasts.length, 3);
  assert.match(v.toasts.at(-1).text, /Budi/);
  e.tick(10 + DEFAULTS.toastMs + 1);
  assert.equal(e.view(10 + DEFAULTS.toastMs + 1).toasts.length, 0);
});

test('tahan live 6 jam dengan banyak penonton', () => {
  const rng = mulberry32(9);
  const e = make();
  e.start(0);
  const end = 6 * 3600 * 1000;
  for (let t = 0; t < end; t += 250) {
    e.tick(t);
    if (rng() < 0.5) e.handle({ type: 'comment', user: `u${Math.floor(rng() * 3000)}`, text: 'ABCD'[Math.floor(rng() * 4)] }, t);
    if (rng() < 0.1) e.handle({ type: 'like', count: 15 }, t);
    if (rng() < 0.002) e.handle({ type: 'gift', name: 'g', gift: 'Mawar' }, t);
  }
  const v = e.view(end);
  assert.ok(e.round > 30, `ronde ${e.round}`);
  assert.ok(e.players.size <= 3000);
  assert.ok(v.toasts.length <= 3);
  assert.ok(v.question);
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
