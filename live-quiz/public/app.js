// Kuis Bayangin Aja: menyatukan mesin kuis, sumber event (TikTok lewat server, atau
// simulasi), Bumi, scene, sorotan gift, dan suara.
//
// Parameter URL:
//   ?sim=1          penonton palsu (tanpa TikTok)    &viewers=60  &simgift=0 tanpa gift acak
//   &speed=4        percepat waktu (uji)             &seed=7   hasil acak tetap
//   &q=komodo       mulai dari soal tertentu         &like=100 target like bantuan
//   &tema=negara    topik ronde pertama (sains, sejarah, olahraga, umum, negara, provinsi, campuran);
//                   tanpa ini dipilih acak, ronde berikutnya lewat vote penonton
//   &mute=1         tanpa suara                       &debug=1  tampilkan status koneksi
//   &musik=0        tanpa musik latar (SFX tetap), misalnya saat musik dari Spotify
//   &bumi=nyata     cahaya Bumi: nyata (sesuai jam), siang, senja
//   &jam=2026-10-20T05:00:00Z   waktu awal untuk mode nyata (default: sekarang)
//   &capture=1      waktu dikendalikan skrip render (window.__step)
import { QuizEngine, mulberry32, DEFAULTS } from './engine.js';
import { QUESTIONS } from './questions.js';
import { Sim } from './sim.js';
import { SCENES, lowerZone, spotlightLayer } from './ui.js';
import { loadMap, loadGeo } from './map.js';
import { makeGenerators } from './geoquiz.js';
import { Sound } from './sfx.js';
import { Globe } from './globe.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
const capture = params.has('capture');
const speed = num('speed', 1);
const seed = params.get('seed');

const stage = document.getElementById('stage');
const sceneBox = document.getElementById('scene');
const connEl = document.getElementById('conn');
const scrimHeavy = document.getElementById('scrimHeavy');
const lower = lowerZone(document.getElementById('lower'));
const spot = spotlightLayer(document.getElementById('spot'));

function fitStage() {
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  stage.style.transform = `translate(${(innerWidth - 1080 * s) / 2}px, 0) scale(${s})`;
}
addEventListener('resize', fitStage);
fitStage();

// Jam: nyata (dikali speed) atau manual saat render frame-per-frame.
let manualNow = 0;
const t0 = performance.now();
const clock = () => (capture ? manualNow : (performance.now() - t0) * speed);

const sound = new Sound({ muted: params.has('mute') || capture, bed: params.get('musik') !== '0' });
const startDate = params.has('jam') ? new Date(params.get('jam')) : new Date();
const globe = new Globe(document.getElementById('globe'), {
  mode: params.get('bumi') || 'nyata',
  date: (ms) => new Date(startDate.getTime() + ms / speed),
});
const ctx = { mapData: null, geoData: null };
let engine = null;
let sim = null;

function connect() {
  if (sim) return;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events`);
  ws.onmessage = (m) => {
    let msg;
    try {
      msg = JSON.parse(m.data);
    } catch {
      return;
    }
    if (msg.type === 'status') {
      if (params.has('debug')) connEl.textContent = msg.text;
    } else if (msg.type === 'reset') {
      location.reload(); // mulai ulang dari nol: klasemen, skor, ronde
    } else {
      engine.handle(msg, clock());
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

let scene = null;
let sceneKey = '';
let firedCues = new Set();
let heavy = 1;
let last = null;
let toastIds = new Set();

const play = (name, at) => sound.play(name, at);

function render(now) {
  const dt = last === null ? 0 : now - last;
  last = now;
  engine.tick(now);
  sim?.step(now);
  const v = engine.view(now);

  const key = `${v.round}:${v.qNumber}:${v.phase}`;
  if (key !== sceneKey) {
    sceneKey = key;
    scene = SCENES[v.phase]?.(v, ctx) ?? null;
    sceneBox.replaceChildren(...(scene ? [scene.node] : []));
    scene?.mount?.();
    firedCues = new Set();
  }
  if (scene) {
    scene.update(v, (name) => play(name, now));
    for (const [i, c] of (scene.cues || []).entries()) {
      if (!firedCues.has(i) && v.elapsed >= c.at) {
        firedCues.add(i);
        play(c.name, now - v.elapsed + c.at);
      }
    }
  }

  // Scrim pekat saat ada teks padat, lebih tipis saat pembuka supaya Bumi terlihat.
  const target = v.phase === 'intro' || v.phase === 'rules' ? 0 : 1;
  heavy += (target - heavy) * (1 - Math.exp(-dt / 350));
  scrimHeavy.style.opacity = heavy.toFixed(3);

  lower.update(v);
  spot.update(v, now, play);

  // Bunyi untuk toast follow/share/bantuan yang baru masuk.
  const ids = new Set(v.toasts.map((t) => Math.round(now - t.age)));
  for (const t of v.toasts) {
    if (!toastIds.has(Math.round(now - t.age))) play(t.kind === 'hint' ? 'hint' : 'follow', now);
  }
  toastIds = ids;

  const q = v.question;
  const place = q?.focus ?? q?.map;
  const focus = place && (v.phase === 'reveal' || v.phase === 'winners') ? { lat: place.lat, lon: place.lon } : null;
  globe.update(dt, now, focus);
}

async function boot() {
  await Promise.all([
    document.fonts.ready,
    loadMap().then((m) => (ctx.mapData = m)),
    loadGeo().then((g) => (ctx.geoData = g)),
    sound.init().catch(() => {}),
    globe.init().catch((e) => console.warn('Bumi gagal dimuat:', e)),
  ]);
  engine = new QuizEngine(QUESTIONS, {
    rng: seed ? mulberry32(Number(seed)) : Math.random,
    startWith: params.get('q'),
    theme: params.get('tema'),
    generators: ctx.geoData ? makeGenerators(ctx.geoData) : {},
    config: { hintLikes: num('like', DEFAULTS.hintLikes) },
  });
  if (params.has('sim')) sim = new Sim(engine, seed ? mulberry32(Number(seed) + 1) : Math.random, { viewers: num('viewers', 60), gifts: params.get('simgift') !== '0' });
  if (params.has('debug')) connEl.textContent = sim ? 'simulasi' : 'menunggu server';
  connect();
  engine.start(clock());
  if (capture) {
    // Skrip render memanggil __step(ms) per frame lalu mengambil tangkapan layar.
    window.__quiz = { engine, sound, sim, now: () => manualNow };
    // draw=false hanya memajukan mesin dan simulasi (untuk melompati bagian yang tidak direkam).
    window.__step = (ms, draw = true) => {
      manualNow += ms;
      if (draw) {
        render(manualNow);
      } else {
        engine.tick(manualNow);
        sim?.step(manualNow);
      }
      const v = engine.view(manualNow);
      return { phase: v.phase, round: v.round, q: v.qNumber, gen: v.question?.gen ?? null, elapsed: v.elapsed, now: manualNow };
    };
    render(0);
    document.title = 'ready';
    return;
  }
  const loop = () => {
    render(clock());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Cadangan kalau tab tidak terlihat (rAF berhenti): mesin tetap jalan.
  setInterval(() => document.hidden && engine.tick(clock()), 500);
}

boot();
