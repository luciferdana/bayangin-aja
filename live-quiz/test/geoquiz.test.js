import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { geoQuestion, makeGenerators, listFor } from '../public/geoquiz.js';
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
const KINDS = ['negara', 'provinsi', 'bendera', 'ibukota', 'dunia'];

for (const kind of KINDS) {
  test(`setiap soal ${kind} bisa diketik dan tidak tertukar`, () => {
    for (const t of listFor(geo, kind)) {
      const q = geoQuestion(geo, kind, t);
      assert.ok(q.q.length <= 110 && q.fact.length <= 130, `${q.id}: teks terlalu panjang`);
      assert.ok(!q.q.toLowerCase().includes(q.options[q.answer].toLowerCase()), `${q.id}: jawaban tertulis di soal`);
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
  const e = new QuizEngine(QUESTIONS, { rng: mulberry32(4), theme: 'campuran', generators: makeGenerators(geo) });
  e.start(0);
  assert.equal(e.questions.filter((q) => q.gen === 'negara').length, 1);
  assert.equal(e.questions.filter((q) => q.gen === 'provinsi').length, 1);
});

test('setiap soal tebak bendera punya gambar dan bisa diketik', () => {
  const withFlag = Object.values(geo.countries).filter((c) => c.flag);
  assert.ok(withFlag.length >= 80);
  for (const t of withFlag) {
    const q = geoQuestion(geo, 'bendera', t);
    assert.ok(fs.existsSync(new URL(`../public/${q.flag}`, import.meta.url)), q.flag);
    assert.equal(q.shape.kind, 'negara');
    const m = buildMatcher(q);
    q.options.forEach((o, i) => assert.equal(matchAnswer(o, m), i, `${q.id}: "${o}"`));
  }
  const gens = makeGenerators(geo);
  const q = gens.bendera('sulit', mulberry32(2));
  assert.ok(q.flag && q.gen === 'bendera');
});

// Rotasi soal peta: dalam satu tingkat, wilayah baru boleh terulang setelah semua wilayah
// tingkat itu sudah keluar.
for (const kind of KINDS) {
  test(`soal ${kind} dirotasi: semua wilayah keluar dulu sebelum ada yang terulang`, () => {
    const list = listFor(geo, kind);
    const total = {};
    for (const x of list) total[x.diff] = (total[x.diff] ?? 0) + 1;
    const e = new QuizEngine(QUESTIONS, { rng: mulberry32(3), theme: kind, generators: makeGenerators(geo) });
    e.start(0);
    const seen = {};
    for (let r = 0; r < 12; r++) {
      if (r > 0) {
        e.nextTheme = e.theme;
        e.newRound(0);
      }
      const ids = e.questions.map((q) => q.id);
      assert.equal(new Set(ids).size, ids.length, `${kind} ronde ${r + 1}: soal ganda`);
      const order = [...e.questions].sort((x, y) => (seen[x.diff]?.has(x.id) ?? false) - (seen[y.diff]?.has(y.id) ?? false));
      for (const q of order) {
        const s = (seen[q.diff] ??= new Set());
        if (s.has(q.id)) {
          assert.equal(s.size, total[q.diff], `${kind}: ${q.id} terulang sebelum semua wilayah ${q.diff} keluar`);
          s.clear();
        }
        s.add(q.id);
        if (s.size === total[q.diff]) s.clear();
      }
    }
  });
}
