// Render deterministik dari halaman kuis (mode simulasi), frame per frame.
//
//   node scripts/capture.mjs stills  <folder>      still tiap fase, untuk dicek sebelum render penuh
//   node scripts/capture.mjs preview <file.mp4>    klip preview ~45 detik dengan audio
//
// Butuh Chromium Playwright dan ffmpeg. Tanpa GPU memakai SwiftShader.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const FRAME = 1000 / FPS;
const [mode, out] = process.argv.slice(2);
if (!['stills', 'preview'].includes(mode) || !out) {
  console.error('pakai: node scripts/capture.mjs stills <folder> | preview <file.mp4>');
  process.exit(1);
}

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright').catch(() =>
  import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const srv = await startServer({ port: 0, log: () => {} });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
// Parameter tambahan lewat env, misalnya QUIZ_PARAMS='bumi=siang'.
const extra = process.env.QUIZ_PARAMS ? `&${process.env.QUIZ_PARAMS}` : '';
const jam = /(^|&)jam=/.test(extra) ? '' : '&jam=2026-10-20T12:00:00Z';
// Halaman deterministik: memuat ulang selalu menghasilkan urutan kejadian yang sama.
async function fresh() {
  await page.goto(`http://localhost:${srv.port}/?sim=1&simgift=0&capture=1&seed=7&viewers=80&q=komodo${jam}${extra}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
}
await fresh();

// Jalankan ffmpeg; kembalikan stderr kalau diminta (untuk hasil ukur loudnorm).
function run(args, wantStderr = false) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', wantStderr ? 'pipe' : 'inherit'] });
    let err = '';
    p.stderr?.on('data', (d) => (err += d));
    p.on('close', (c) => (c ? fail(new Error(`ffmpeg ${c}: ${err.slice(-500)}`)) : ok(err)));
  });
}

const step = (ms, draw = true) => page.evaluate(([a, b]) => window.__step(a, b), [ms, draw]);
const settle = () => page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));

// Gift buatan dari salah satu penonton simulasi (supaya fotonya ikut tampil).
const GIFT = {
  kecil: { gift: 'Mawar', count: 3, coins: 3 },
  sedang: { gift: 'Topi Koboi', count: 1, coins: 99 },
  besar: { gift: 'Paus', count: 1, coins: 500 },
};
const inject = (tier, viewer) => page.evaluate(([g, i]) => {
  const all = window.__quiz.sim.viewers;
  const v = all.slice(i).find((x) => x.avatar) ?? all[i]; // utamakan yang punya foto
  window.__quiz.engine.handle({ type: 'gift', user: v.user, name: v.name, avatar: v.avatar, ...g }, window.__quiz.now());
}, [GIFT[tier], viewer]);

// q: nomor soal, 'negara'/'provinsi' (soal tebak lokasi), atau null.
const matches = (s, phase, q) => s.phase === phase && s.round === 1
  && (q === null || (typeof q === 'number' ? s.q === q : s.gen === q));

// Lompat tanpa menggambar sampai satu frame sebelum titik `start` (ms) di fase dan soal
// yang dicari, di ronde 1. gifts: [{ at, tier, viewer }] disuntik saat waktunya lewat.
async function moveTo(phase, q, start, gifts = []) {
  let s = await step(0, false);
  for (let i = 0; !(matches(s, phase, q) && s.elapsed <= start); i++) {
    if (i > 20000 || s.round > 1) throw new Error(`fase ${phase} soal ${q} tidak ketemu`);
    s = await step(100, false);
  }
  const pending = gifts.filter((g) => g.at < start).sort((a, b) => a.at - b.at);
  // Maju bertahap supaya event simulasi tetap tercatat di waktunya masing-masing.
  while (start - FRAME - s.elapsed > 0.5) {
    if (pending.length && s.elapsed >= pending[0].at) {
      const g = pending.shift();
      await inject(g.tier, g.viewer);
      continue;
    }
    const stop = pending.length ? Math.min(pending[0].at, start - FRAME) : start - FRAME;
    s = await step(Math.max(0.5, Math.min(100, stop - s.elapsed)), false);
  }
  for (const g of pending) await inject(g.tier, g.viewer);
  return s;
}

// [fase, soal, ms dalam fase, gift]
const SHOTS = [
  ['rules', null, 4000],
  ['intro', 1, 2500],
  ['answer', 1, 7000, [{ at: 5500, tier: 'kecil', viewer: 3 }]],
  ['answer', 1, 12000, [{ at: 9500, tier: 'sedang', viewer: 8 }]],
  ['answer', 1, 16000, [{ at: 14800, tier: 'besar', viewer: 11 }]],
  ['reveal', 1, 4000],
  ['winners', 1, 4500],
  ['answer', 'negara', 9000],
  ['reveal', 'negara', 4000],
  ['answer', 'provinsi', 9000],
  ['reveal', 'provinsi', 4000],
  ['board', 5, 4000],
  ['podium', 10, 5000],
  ['standings', 10, 4000],
  ['vote', 10, 9000],
];

// STILL_SHOTS='[["podium",10,6000]]' mengganti daftar still bawaan.
if (process.env.STILL_SHOTS) SHOTS.splice(0, SHOTS.length, ...JSON.parse(process.env.STILL_SHOTS));

if (mode === 'stills') {
  fs.mkdirSync(out, { recursive: true });
  for (const [phase, q, at, gifts] of SHOTS) {
    // Urutan soal tebak lokasi acak di dalam ronde; kalau targetnya sudah lewat, mulai ulang.
    await moveTo(phase, q, at, gifts).catch(async () => {
      await fresh();
      await moveTo(phase, q, at, gifts);
    });
    await step(FRAME, true);
    await settle();
    await step(0, true);
    const file = path.join(out, `${phase}${q ? `-${q}` : ''}${gifts ? `-${gifts[0].tier}` : ''}.png`);
    await page.screenshot({ path: file });
    console.log('still', file);
  }
} else {
  // Segmen [fase, soal, mulai, durasi, gift] dalam ms; disambung dengan cut keras.
  const SEGMENTS = [
    ['rules', null, 0, 3500],
    ['intro', 1, 0, 3000],
    ['answer', 1, 1000, 9500, [{ at: 2500, tier: 'kecil', viewer: 3 }, { at: 6500, tier: 'sedang', viewer: 8 }]],
    ['answer', 1, 12500, 9000, [{ at: 13000, tier: 'besar', viewer: 11 }]],
    ['reveal', 1, 0, 6500],
    ['winners', 1, 0, 6000],
    ['answer', 'negara', 1000, 6000],
    ['reveal', 'negara', 0, 5500],
    ['answer', 'provinsi', 1000, 5000],
    ['reveal', 'provinsi', 0, 5000],
    ['podium', 10, 0, 7000],
    ['standings', 10, 0, 5500],
    ['vote', 10, 0, 9000],
  ];
  // PREVIEW_SEGMENTS='[["podium",10,0,7000]]' mengganti daftar segmen bawaan.
  if (process.env.PREVIEW_SEGMENTS) SEGMENTS.splice(0, SEGMENTS.length, ...JSON.parse(process.env.PREVIEW_SEGMENTS));
  const tmpVideo = `${out}.video.mp4`;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', tmpVideo], { stdio: ['pipe', 'inherit', 'inherit'] });
  const audio = [];
  let offset = 0;
  for (const [phase, q, start, dur, gifts = []] of SEGMENTS) {
    const s = await moveTo(phase, q, start, gifts);
    const later = gifts.filter((g) => g.at >= start).sort((a, b) => a.at - b.at);
    const logStart = await page.evaluate(() => window.__quiz.sound.log.length);
    const t0 = s.now + FRAME;
    const frames = Math.round(dur / FRAME);
    for (let i = 0; i < frames; i++) {
      const at = start + i * FRAME;
      while (later.length && later[0].at <= at) await inject(later[0].tier, later.shift().viewer);
      await step(FRAME, true);
      if (i === 0) await settle();
      const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    const log = await page.evaluate((n) => window.__quiz.sound.log.slice(n), logStart);
    for (const e of log) audio.push({ ...e, t: offset + Math.max(0, e.at - t0) });
    offset += frames * FRAME;
    console.log(`segmen ${phase} q${q ?? '-'}: ${frames} frame, ${log.length} bunyi`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));

  // Audio: musik latar sepanjang klip + SFX di waktunya.
  const total = offset / 1000;
  const sfx = path.join(ROOT, 'public', 'sfx');
  const inputs = ['-stream_loop', '-1', '-i', path.join(sfx, 'bed.ogg')];
  const parts = [`[0:a]atrim=0:${total.toFixed(3)}[bed]`];
  audio.forEach((e, i) => {
    inputs.push('-i', path.join(sfx, `${e.name}.ogg`));
    parts.push(`[${i + 1}:a]volume=${e.gain},adelay=${Math.round(e.t)}|${Math.round(e.t)},aformat=channel_layouts=stereo[s${i}]`);
  });
  const mixIn = ['[bed]', ...audio.map((_, i) => `[s${i}]`)].join('');
  parts.push(`${mixIn}amix=inputs=${audio.length + 1}:normalize=0:duration=first[a]`);
  const tmpAudio = `${out}.mix.wav`;
  await run(['-v', 'error', '-y', ...inputs, '-filter_complex', parts.join(';'), '-map', '[a]', '-ar', '48000', tmpAudio]);
  // Loudness: gain linear + limiter, lalu ukur hasil akhir (setelah encode AAC) dan ulangi
  // sampai sekitar -14 LUFS dengan puncak di bawah -1 dBTP.
  const measure = async (file) => {
    const err = await run(['-nostdin', '-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], true);
    const tail = err.slice(err.lastIndexOf('Summary:'));
    return { i: Number(tail.match(/I:\s+(-?[\d.]+) LUFS/)[1]), tp: Number(tail.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]) };
  };
  let { i: level } = await measure(tmpAudio);
  let gain = -14 - level;
  let limit = 0.7;
  for (let k = 0; k < 4; k++) {
    await run(['-v', 'error', '-y', '-i', tmpVideo, '-i', tmpAudio,
      '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${limit.toFixed(3)}:attack=1:release=60:level=false`,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', out]);
    const m = await measure(out);
    console.log(`audio percobaan ${k + 1}: ${m.i} LUFS, puncak ${m.tp} dBTP`);
    if (Math.abs(m.i + 14) <= 0.5 && m.tp < -1) break;
    gain += -14 - m.i;
    if (m.tp >= -1) limit *= 10 ** ((-1.3 - m.tp) / 20);
  }
  fs.unlinkSync(tmpVideo);
  fs.unlinkSync(tmpAudio);
  console.log(`preview ${out}: ${total.toFixed(1)} dtk, ${audio.length} bunyi`);
}

await browser.close();
await srv.close();
