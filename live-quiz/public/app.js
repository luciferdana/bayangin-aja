// Kuis Bayangin Aja: menyatukan mesin kuis, sumber event (TikTok lewat server, atau
// simulasi), Bumi, scene, dan suara.
//
// Parameter URL:
//   ?sim=1          penonton palsu (tanpa TikTok)    &viewers=60
//   &speed=4        percepat waktu (uji)             &seed=7   hasil acak tetap
//   &q=komodo       mulai dari soal tertentu         &like=100 target like bantuan
//   &mute=1         tanpa suara                       &debug=1  tampilkan status koneksi
//   &bumi=nyata     cahaya Bumi: nyata (sesuai jam), siang, senja
//   &jam=2026-10-20T05:00:00Z   waktu awal untuk mode nyata (default: sekarang)
//   &capture=1      waktu dikendalikan skrip render (window.__step)
import { QuizEngine, mulberry32, DEFAULTS } from './engine.js';
import { QUESTIONS } from './questions.js';
import { Sim } from './sim.js';
import { SCENES } from './ui.js';
import { loadMap } from './map.js';
import { Sound } from './sfx.js';
import { Globe } from './globe.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
const capture = params.has('capture');
const speed = num('speed', 1);
const seed = params.get('seed');
const rng = seed ? mulberry32(Number(seed)) : Math.random;

const stage = document.getElementById('stage');
const sceneBox = document.getElementById('scene');
const toastBox = document.getElementById('toasts');
const connEl = document.getElementById('conn');
const scrimHeavy = document.getElementById('scrimHeavy');

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

const engine = new QuizEngine(QUESTIONS, {
  rng,
  startWith: params.get('q'),
  config: { hintLikes: num('like', DEFAULTS.hintLikes) },
});
const sim = params.has('sim') ? new Sim(engine, seed ? mulberry32(Number(seed) + 1) : Math.random, { viewers: num('viewers', 60) }) : null;
const sound = new Sound({ muted: params.has('mute') || capture });
const startDate = params.has('jam') ? new Date(params.get('jam')) : new Date();
const globe = new Globe(document.getElementById('globe'), {
  mode: params.get('bumi') || 'nyata',
  date: (ms) => new Date(startDate.getTime() + ms / speed),
});
const ctx = { mapData: null };

if (params.has('debug')) connEl.textContent = sim ? 'simulasi' : 'menunggu server';

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
let toastKey = '';

function play(name, at) {
  sound.play(name, at);
}

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

  renderToasts(v, now);

  const q = v.question;
  const focus = q?.map && (v.phase === 'reveal' || v.phase === 'winners') ? { lat: q.map.lat, lon: q.map.lon } : null;
  globe.update(dt, now, focus);
}

// Toast dikenali dari waktu munculnya; bunyi hanya untuk toast yang baru masuk.
let toastIds = new Set();
function renderToasts(v, now) {
  const ids = v.toasts.map((t) => Math.round(now - t.age));
  const key = ids.join('|');
  if (key !== toastKey) {
    toastKey = key;
    const fresh = v.toasts.filter((t, i) => !toastIds.has(ids[i]));
    toastIds = new Set(ids);
    for (const t of fresh) play(t.kind === 'hint' ? 'hint' : t.kind === 'gift' ? 'gift' : 'follow', now);
    toastBox.replaceChildren(...v.toasts.map((t) => {
      const n = document.createElement('div');
      n.className = `toast mono ${t.kind}`;
      if (t.name) {
        const b = document.createElement('b');
        b.className = 'user';
        b.textContent = t.name;
        n.append(b, ' ');
      }
      n.append(t.text);
      return n;
    }));
  }
  const nodes = toastBox.children;
  v.toasts.forEach((t, i) => {
    const n = nodes[i];
    if (!n) return;
    const pin = Math.min(1, t.age / 300);
    const pout = Math.min(1, (DEFAULTS.toastMs - t.age) / 400);
    const p = Math.max(0, Math.min(pin, pout));
    n.style.opacity = p;
    n.style.transform = `translateX(${(1 - p) * 40}px)`;
  });
}

async function boot() {
  await Promise.all([
    document.fonts.ready,
    loadMap().then((m) => (ctx.mapData = m)),
    sound.init().catch(() => {}),
    globe.init().catch((e) => console.warn('Bumi gagal dimuat:', e)),
  ]);
  connect();
  engine.start(clock());
  if (capture) {
    // Skrip render memanggil __step(ms) per frame lalu mengambil tangkapan layar.
    window.__quiz = { engine, sound };
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
      return { phase: v.phase, round: v.round, q: v.qNumber, elapsed: v.elapsed, now: manualNow };
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
