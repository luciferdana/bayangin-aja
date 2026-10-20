import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { geoQuestion, makeGenerators } from '../public/geoquiz.js';
import { buildMatcher, matchAnswer, mulberry32, QuizEngine } from '../public/engine.js';
import { QUESTIONS } from '../public/questions.js';

const geo = JSON.parse(fs.readFileSync(new URL('../public/data/geo.json', import.meta.url)));

test('data peta lengkap: 38 provinsi, negara bertingkat', () => {
  assert.equal(Object.keys(geo.provinces).length, 38);
  for (const d of ['mudah', 'sedang', 'sulit']) {
    assert.ok(Object.values(geo.countries).filter((c) => c.diff === d).length >= 10, `negara ${d}`);
    assert.ok(Object.values(geo.provinces).filter((c) => c.diff === d).length >= 4, `provinsi ${d}`);
  }
});

// Setiap wilayah sebagai jawaban: semua opsi dan alias, diketik persis, harus cocok
// ke dirinya sendiri dan bukan ke pengecoh di sebelahnya.
for (const [kind, from] of [['negara', 'countries'], ['provinsi', 'provinces']]) {
  test(`setiap soal tebak ${kind} bisa diketik dan tidak tertukar`, () => {
    for (const t of Object.values(geo[from])) {
      const q = geoQuestion(geo, kind, t);
      assert.equal(new Set(q.options).size, 4, q.id);
      const m = buildMatcher(q);
      q.options.forEach((o, i) => {
        assert.equal(matchAnswer(o, m), i, `${q.id}: "${o}"`);
        for (const a of q.alias[o] || []) assert.equal(matchAnswer(a, m), i, `${q.id}: alias "${a}"`);
        assert.ok(o.length <= 22 && o.split(' ').length <= 3, `${q.id}: opsi panjang "${o}"`);
      });
      assert.ok(Math.abs(q.focus.lat) <= 90 && Math.abs(q.focus.lon) <= 180, q.id);
    }
  });
}

test('austria dan australia tidak tertukar', () => {
  const m = buildMatcher({ options: ['Austria', 'Australia'] });
  assert.equal(matchAnswer('austria', m), 0);
  assert.equal(matchAnswer('australia', m), 1);
  assert.equal(matchAnswer('australi', m), 1);
});

test('ronde tebak provinsi: 10 soal, tidak ada wilayah ganda', () => {
  const e = new QuizEngine(QUESTIONS, { rng: mulberry32(3), theme: 'provinsi', generators: makeGenerators(geo) });
  e.start(0);
  assert.equal(e.questions.length, 10);
  assert.ok(e.questions.every((q) => q.gen === 'provinsi'));
  assert.equal(new Set(e.questions.map((q) => q.id)).size, 10);
});

test('ronde campuran memuat satu soal negara dan satu provinsi', () => {
  const e = new QuizEngine(QUESTIONS, { rng: mulberry32(4), generators: makeGenerators(geo) });
  e.start(0);
  assert.equal(e.questions.filter((q) => q.gen === 'negara').length, 1);
  assert.equal(e.questions.filter((q) => q.gen === 'provinsi').length, 1);
});
