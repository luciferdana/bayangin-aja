import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../public/questions.js';
import { buildMatcher, matchAnswer } from '../public/engine.js';

const DIFFS = new Set(['mudah', 'sedang', 'sulit']);
// Emoji dilarang di identitas Bayangin Aja.
const EMOJI = /\p{Extended_Pictographic}/u;

test('setiap soal lengkap dan valid', () => {
  const ids = new Set();
  for (const q of QUESTIONS) {
    assert.ok(/^[a-z0-9-]+$/.test(q.id), `id ${q.id}`);
    assert.ok(!ids.has(q.id), `id ganda ${q.id}`);
    ids.add(q.id);
    assert.ok(DIFFS.has(q.diff), `${q.id} diff`);
    assert.ok(q.cat && q.q && q.fact && q.source, `${q.id} field kosong`);
    assert.ok(q.options.length >= 2 && q.options.length <= 4, `${q.id} jumlah opsi`);
    assert.equal(new Set(q.options).size, q.options.length, `${q.id} opsi ganda`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${q.id} answer`);
    for (const s of [q.q, q.fact, q.source, ...q.options]) assert.ok(!EMOJI.test(s), `${q.id} emoji`);
    assert.ok(q.q.length <= 110, `${q.id} soal terlalu panjang (${q.q.length})`);
    assert.ok(q.fact.length <= 130, `${q.id} fakta terlalu panjang (${q.fact.length})`);
    for (const o of q.options) {
      assert.ok(o.length <= 22, `${q.id} opsi terlalu panjang: ${o}`);
      assert.ok(o.trim().split(/\s+/).length <= 3, `${q.id} opsi lebih dari 3 kata: ${o}`);
    }
    for (const k of Object.keys(q.alias || {})) assert.ok(q.options.includes(k), `${q.id} alias untuk opsi tak dikenal: ${k}`);
    if (q.map) {
      assert.ok(['indonesia', 'world'].includes(q.map.region), `${q.id} region`);
      assert.ok(Math.abs(q.map.lat) <= 90 && Math.abs(q.map.lon) <= 180 && q.map.label, `${q.id} koordinat`);
      if (q.map.region === 'indonesia') {
        assert.ok(q.map.lon >= 93 && q.map.lon <= 143 && q.map.lat >= -12 && q.map.lat <= 8, `${q.id} di luar peta`);
      }
    }
  }
});

test('setiap tingkat kesulitan cukup untuk satu ronde', () => {
  const n = (d) => QUESTIONS.filter((q) => q.diff === d).length;
  assert.ok(n('mudah') >= 4 && n('sedang') >= 4 && n('sulit') >= 2);
});

// Soal lain diacak oleh engine, jadi hanya soal berurutan yang posisinya tetap.
test('jawaban soal berurutan tidak menumpuk di satu huruf', () => {
  const four = QUESTIONS.filter((q) => q.options.length === 4 && q.ordered);
  const counts = [0, 0, 0, 0];
  for (const q of four) counts[q.answer] += 1;
  console.log('sebaran jawaban A-D:', counts.join(' '));
  for (const c of counts) assert.ok(c >= four.length * 0.1, `sebaran ${counts}`);
});

// Tiap opsi dan aliasnya, diketik persis, harus cocok ke opsi itu sendiri dan bukan opsi lain.
test('setiap opsi bisa diketik dan tidak tertukar', () => {
  for (const q of QUESTIONS) {
    const m = buildMatcher(q);
    q.options.forEach((o, i) => {
      assert.equal(matchAnswer(o, m), i, `${q.id}: "${o}"`);
      assert.equal(matchAnswer(o.toLowerCase(), m), i, `${q.id}: "${o}" huruf kecil`);
      for (const a of q.alias?.[o] || []) assert.equal(matchAnswer(a, m), i, `${q.id}: alias "${a}"`);
    });
  }
});
