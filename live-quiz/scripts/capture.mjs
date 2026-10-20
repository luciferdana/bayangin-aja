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
await page.goto(`http://localhost:${srv.port}/?sim=1&capture=1&seed=7&viewers=80&q=komodo`);
await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });

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

// Lompat tanpa menggambar sampai satu frame sebelum titik `start` (ms) di fase dan soal
// yang dicari, di ronde 1.
async function moveTo(phase, q, start) {
  const match = (s) => s.phase === phase && s.round === 1 && (q === null || s.q === q);
  let s = await step(0, false);
  for (let i = 0; !(match(s) && s.elapsed <= start); i++) {
    if (i > 20000) throw new Error(`fase ${phase} soal ${q} tidak ketemu`);
    s = await step(100, false);
  }
  // Maju bertahap supaya event simulasi tetap tercatat di waktunya masing-masing.
  while (start - FRAME - s.elapsed > 0.5) s = await step(Math.min(100, start - FRAME - s.elapsed), false);
  return s;
}

const SHOTS = [
  ['rules', null, 4000],
  ['intro', 1, 2500],
  ['answer', 1, 9000],
  ['reveal', 1, 4000],
  ['winners', 1, 4500],
  ['answer', 2, 17500],
  ['reveal', 2, 4000],
  ['board', 5, 4000],
  ['podium', 10, 5000],
  ['standings', 10, 4000],
];

if (mode === 'stills') {
  fs.mkdirSync(out, { recursive: true });
  for (const [phase, q, at] of SHOTS) {
    await moveTo(phase, q, at);
    await step(FRAME, true);
    await settle();
    await step(0, true);
    const file = path.join(out, `${phase}${q ? `-q${q}` : ''}.png`);
    await page.screenshot({ path: file });
    console.log('still', file);
  }
} else {
  // Segmen [fase, soal, mulai, durasi] dalam ms; disambung dengan cut keras.
  const SEGMENTS = [
    ['rules', null, 0, 3200],
    ['intro', 1, 0, 3500],
    ['answer', 1, 0, 7000],
    ['answer', 1, 15500, 4500],
    ['reveal', 1, 0, 7500],
    ['winners', 1, 0, 7000],
    ['board', 5, 0, 5000],
    ['podium', 10, 0, 7500],
    ['standings', 10, 0, 4500],
  ];
  const tmpVideo = `${out}.video.mp4`;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', tmpVideo], { stdio: ['pipe', 'inherit', 'inherit'] });
  const audio = [];
  let offset = 0;
  for (const [phase, q, start, dur] of SEGMENTS) {
    const s = await moveTo(phase, q, start);
    const logStart = await page.evaluate(() => window.__quiz.sound.log.length);
    const t0 = s.now + FRAME;
    const frames = Math.round(dur / FRAME);
    for (let i = 0; i < frames; i++) {
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
  // Loudness: ukur, naikkan secara linear ke sekitar -14 LUFS, lalu limiter supaya puncak
  // tetap di bawah -1 dBTP setelah encode AAC (0,6 dB menutup yang dipangkas limiter).
  const measured = JSON.parse((await run(['-nostdin', '-hide_banner', '-i', tmpAudio, '-af',
    'loudnorm=print_format=json', '-f', 'null', '-'], true)).match(/\{[\s\S]*\}/)[0]);
  const gain = -14 - Number(measured.input_i) + 0.6;
  await run(['-v', 'error', '-y', '-i', tmpVideo, '-i', tmpAudio,
    '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.7:attack=1:release=60:level=false`, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', out]);
  fs.unlinkSync(tmpVideo);
  fs.unlinkSync(tmpAudio);
  console.log(`preview ${out}: ${total.toFixed(1)} dtk, ${audio.length} bunyi`);
}

await browser.close();
await srv.close();
