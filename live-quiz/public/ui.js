// Scene per fase. Setiap scene: build(view) membuat DOM, update(view) menggerakkannya.
// Semua animasi dihitung dari view.elapsed (bukan CSS transition), supaya hasil live dan
// render frame-per-frame sama persis. Pergantian fase memakai cut keras.
import { MapView, ShapeView, formatCoord } from './map.js';
import { topicStyle } from './topics.js';
import { VOTE_KEYS } from './engine.js';

const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - (1 - x) ** 3;
const prog = (ms, start, dur) => ease(clamp((ms - start) / dur));
const smooth = (x) => x * x * (3 - 2 * x); // ease in-out
const pad = (n) => String(n).padStart(2, '0');
const secs = (ms) => `00:${pad(Math.max(0, Math.ceil(ms / 1000)))}`;
const fmtSec = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} DTK`;
const DIFF_LABEL = { mudah: 'MUDAH', sedang: 'SEDANG', sulit: 'SULIT' };
// Pengali boost bisa pecahan (1,5 dan 2,5): koma desimal Indonesia.
const xm = (m) => String(m).replace('.', ',');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Teks dengan bagian tebal: parts = ['biasa ', ['tebal'], ' biasa']
function rich(tag, cls, parts) {
  const n = el(tag, cls);
  for (const p of parts) n.append(Array.isArray(p) ? el('b', '', p[0]) : document.createTextNode(p));
  return n;
}

function initials(name) {
  const m = String(name).match(/[\p{L}\p{N}]/gu);
  return m ? m[0].toUpperCase() : '?';
}

export function avatar(p, size) {
  const a = el('span', 'av');
  if (size) Object.assign(a.style, { width: `${size}px`, height: `${size}px` });
  const ini = el('span', 'ini', initials(p?.name ?? '?'));
  if (size) ini.style.fontSize = `${Math.round(size * 0.4)}px`;
  a.append(ini);
  if (p?.avatar) {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.alt = '';
    img.onerror = () => img.remove();
    img.src = p.avatar;
    a.append(img);
  }
  return a;
}

function rise(node, p, dy = 28) {
  node.style.opacity = p;
  node.style.transform = p >= 1 ? '' : `translateY(${(1 - p) * dy}px)`;
}

function slide(node, p, dx = 80) {
  node.style.opacity = p;
  node.style.transform = p >= 1 ? '' : `translateX(${(1 - p) * dx}px)`;
}

// Kecilkan huruf sampai muat: setinggi `height`, atau tidak meluber ke samping (`oneLine`).
function fit(node, { max, min, height, oneLine }) {
  let size = max;
  node.style.fontSize = `${size}px`;
  while (size > min && ((height && node.scrollHeight > height) || (oneLine && node.scrollWidth > node.clientWidth))) {
    size -= 2;
    node.style.fontSize = `${size}px`;
  }
}

function head(v, ctx, { right = 'soal' } = {}) {
  const h = el('div', 'ui head');
  const mark = el('div', 'mark', 'BAYANGIN AJA');
  mark.append(el('small', '', `RONDE ${pad(v.round)} · ${(v.theme?.label ?? 'Kuis').toUpperCase()}`));
  const q = el('div', 'qcount', right === 'soal' ? 'SOAL' : 'RONDE');
  const b = el('b');
  if (right === 'soal') {
    b.textContent = pad(v.qNumber);
    b.append(el('span', '', `/${v.qTotal}`));
  } else {
    b.textContent = pad(v.round);
  }
  q.append(b);
  h.append(mark, q);
  return h;
}

function catLine(q, extra) {
  const c = el('div', 'ui cat mono');
  c.append(el('span', 'sq'), el('b', '', q.cat), el('span', '', extra ?? `TINGKAT ${DIFF_LABEL[q.diff]}`));
  return c;
}

// Penghitung angka naik: dipakai untuk poin dan persen.
const countUp = (node, value, p, fmt = (x) => x) => { node.textContent = fmt(Math.round(value * p)); };

// ---------------------------------------------------------------- cara main
function rules(v) {
  const root = el('div');
  const r = v.rules;
  const steps = [
    ['Ketik ', ['jawabannya'], ' di komentar. Pilihan jawaban terkunci di awal soal.'],
    ['Maksimal ', [`${r.maxTries} tebakan`], ' per soal. Typo kecil tetap dihitung.'],
    ['Benar dapat ', [`${r.points.mudah} / ${r.points.sedang} / ${r.points.sulit} poin`], ` sesuai tingkat, plus bonus cepat sampai +${Math.round(r.speedBonus * 100)}%.`],
    ['Benar ', [`${r.streakFrom} kali beruntun`], `: +${r.streakBonus} poin tiap soal berikutnya.`],
    [[`${r.hintLikes} like`], ' membuka empat pilihan jawaban. Tebak lebih dulu, skor lebih tinggi.'],
    // Info gift cukup sekali per ronde, tanpa angka koin dan tanpa nada menyuruh
    // (ajakan gift berulang di layar kena sanksi TikTok).
    ['Yang kirim gift, poinnya dapat ', ['boost'], ' di soal berikutnya. Nggak kirim juga tetap bisa juara kok.'],
  ];
  const title = el('div', 'ui btitle');
  title.append('CARA ', el('em', '', 'MAIN'));
  const st = topicStyle(v.theme?.id);
  const badge = el('div', 'ui topic-badge');  // kartu mini bermuka kertas, sama seperti kartu vote
  badge.style.setProperty('--tc', st.color);
  const bi = el('span', 'vicon');
  bi.innerHTML = st.icon; // SVG statis dari topics.js
  const bt = el('div', 'tb-text');
  bt.append(el('span', 'mono', 'TOPIK RONDE INI'), el('b', '', (v.theme?.label ?? 'Campuran').toUpperCase()));
  badge.append(bi, bt);
  const sub = el('div', 'ui bsub mono');
  sub.append(`RONDE ${pad(v.round)} · TOPIK `, el('b', '', (v.theme?.label ?? 'Campuran').toUpperCase()), ` · ${v.qTotal || 10} SOAL · ${r.answerSec} DETIK`);
  const list = el('ol', 'ui steps');
  const items = steps.map((s, i) => {
    const li = el('li');
    li.append(el('span', 'no', pad(i + 1)), rich('span', 'tx', s));
    list.append(li);
    return li;
  });
  const next = el('div', 'ui next mono');
  next.style.top = '1100px';
  const nb = el('b');
  next.append(el('span', '', 'SOAL PERTAMA DALAM'), nb);
  root.append(head(v, null, { right: 'ronde' }), title, badge, sub, list, next);
  return {
    node: root,
    cues: [{ at: 0, name: 'title' }, ...items.map((_, i) => ({ at: 500 + i * 260, name: 'row' }))],
    update(v) {
      const t = v.elapsed;
      rise(title, prog(t, 0, 500));
      const pb = prog(t, 150, 500);
      badge.style.opacity = pb;
      badge.style.transform = pb >= 1 ? '' : `scale(${0.85 + 0.15 * pb})`;
      rise(sub, prog(t, 150, 500));
      items.forEach((li, i) => slide(li, prog(t, 500 + i * 260, 500), 60));
      rise(next, prog(t, 1900, 500));
      nb.textContent = secs(v.remaining);
    },
  };
}

// ---------------------------------------------------------------- pembuka soal
function intro(v) {
  const q = v.question;
  const root = el('div');
  const no = el('div', 'ui intro-no mono', `SOAL ${pad(v.qNumber)} / ${v.qTotal}`);
  const cat = el('div', 'ui intro-cat', q.cat);
  const meta = el('div', 'ui intro-meta mono');
  const pts = v.rules.points[q.diff];
  meta.append(el('span', `d ${q.diff}`, DIFF_LABEL[q.diff]), el('span', '', `${pts} POIN + BONUS CEPAT`));
  const line = el('div', 'ui intro-line');
  root.append(head(v), no, cat, meta, line);
  return {
    node: root,
    cues: [{ at: 0, name: 'intro' }],
    mount() { fit(cat, { max: 150, min: 80, height: 290 }); },
    update(v) {
      const t = v.elapsed;
      rise(no, prog(t, 0, 400));
      rise(cat, prog(t, 120, 600), 60);
      rise(meta, prog(t, 450, 500));
      line.style.transform = `scaleX(${1 - clamp(t / v.duration)})`;
    },
  };
}

// ---------------------------------------------------------------- menjawab
function answer(v, ctx) {
  const q = v.question;
  const root = el('div');
  const n = v.rules.answerSec;

  const ruler = el('div', 'ui ruler');
  const ticks = el('div', 'ticks');
  ticks.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  const tickEls = Array.from({ length: n }, () => ticks.appendChild(el('i')));
  const clock = el('div', 'clock');
  ruler.append(ticks, clock);

  const cat = catLine(q);
  const question = el('div', `ui question${q.shape ? ' short' : ''}`);
  const words = q.q.split(' ').map((w) => {
    const s = el('span', 'w', w);
    question.append(s, ' ');
    return s;
  });

  // Soal tebak lokasi: peta besar di tengah, pilihan dipadatkan di bawahnya.
  let shapeBox = null;
  let shapeMap = null;
  if (q.flag) {
    shapeBox = el('div', 'ui mapbox shapeq flagq');
    const img = new Image();
    img.className = 'flag';
    img.alt = '';
    img.src = q.flag;
    shapeBox.append(img, el('div', 'tag mono', q.source.toUpperCase()));
  } else if (q.shape && ctx.geoData) {
    shapeBox = el('div', 'ui mapbox shapeq');
    const cv = el('canvas');
    cv.width = 1904;
    cv.height = 700;
    shapeBox.append(cv, el('div', 'tag mono', q.source.toUpperCase()));
    shapeMap = new ShapeView(cv, ctx.geoData, q.shape);
  }

  const two = q.options.length === 2;
  const list = el('ol', `ui options${two ? ' two' : ''}${shapeBox ? ' compact shapeq' : ''}`);
  const rows = q.options.map((o) => {
    const li = el('li', 'opt');
    li.append(el('span', 'mk'), el('span', 't', o), el('span', 'ph'));
    list.append(li);
    return li;
  });
  // Selama terkunci, baris pilihan berupa bilah arsir dan papan "terkunci" di tengahnya.
  const lock = el('div', 'optlock mono');
  const lockNum = el('b');
  lock.append(el('span', '', 'PILIHAN TERKUNCI'), lockNum);
  list.append(lock);

  const foot = el('div', 'ui foot mono');
  const instr = el('div', '');
  instr.append('KETIK JAWABANNYA DI KOMENTAR · ', el('b', '', `MAKS ${v.rules.maxTries} TEBAKAN`));
  const count = el('div', 'count');
  const stack = el('div', 'stack');
  const cnum = el('b');
  const clabel = el('span', '', 'MENJAWAB');
  count.append(stack, cnum, clabel);
  foot.append(instr, count);

  const assist = el('div', 'ui assist mono');
  const seg = el('div', 'seg');
  const segs = Array.from({ length: 10 }, () => seg.appendChild(el('i')));
  const alabel = el('span');
  assist.append(el('span', '', 'BUKA PILIHAN'), seg, alabel);
  if (two) assist.style.display = 'none';

  // Target tap tap ganti tema: di kanan baris kategori, selalu terlihat dan tidak ketutup komentar.
  const tap = el('div', 'ui tapgoal mono');
  const tapSeg = el('div', 'tseg');
  const tapSegs = Array.from({ length: 10 }, () => tapSeg.appendChild(el('i')));
  const tapNum = el('b');
  const tapNext = el('span');
  const tapBar = el('div', 'tbar');
  tapBar.append(tapSeg, tapNum);
  tap.append(tapNext, tapBar);

  root.append(head(v), ruler, cat, tap, question, ...(shapeBox ? [shapeBox] : []), list, foot, assist);
  let stackKey = '';
  let lastSec = null;
  let openAt = v.optionsShown ? 0 : null; // waktu fase saat pilihan terbuka
  const self = {
    node: root,
    cues: [],
    mount() {
      fit(question, shapeBox ? { max: 50, min: 34, height: 80 } : { max: 80, min: 42, height: 290 });
      for (const r of rows) fit(r.querySelector('.t'), { max: shapeBox ? 34 : two ? 60 : 48, min: 24, oneLine: true });
      shapeMap?.draw(null, 0, 0);
    },
    update(v, sound) {
      const t = v.elapsed;
      rise(ruler, prog(t, 0, 300), 10);
      rise(cat, prog(t, 80, 400));
      // Progres ke pergantian tema berikutnya; 10% terakhir menyala oranye dan berdenyut.
      const L = v.look;
      const goal = (L.n + 1) * L.every;
      const part = clamp((v.totalLikes - L.n * L.every) / L.every);
      const near = part >= 0.9;
      tapSegs.forEach((s, i) => s.classList.toggle('on', i < Math.floor(part * 10)));
      tapNext.textContent = `TAP TAP · GANTI TEMA ${L.light ? 'GELAP' : 'TERANG'}`;
      tapNum.textContent = `${v.totalLikes.toLocaleString('id-ID')}/${goal.toLocaleString('id-ID')}`;
      tap.classList.toggle('near', near);
      tap.style.opacity = prog(t, 80, 400);
      tap.style.transform = near ? `scale(${1 + 0.04 * Math.exp(-(t % 600) / 150)})` : '';
      words.forEach((w, i) => rise(w, prog(t, 120 + i * 35, 420), 22));
      if (shapeBox) rise(shapeBox, prog(t, 200, 500), 16);
      const shown = v.optionsShown;
      if (shown && openAt === null) openAt = Math.max(t, 350);
      const from = openAt ?? 350;
      rows.forEach((r, i) => {
        r.classList.toggle('locked', !shown);
        if (shown) slide(r, prog(t, from + i * 110, 450), 40);
        else rise(r, prog(t, 350 + i * 110, 450), 16);
        r.classList.toggle('opened', shown && openAt > 350 && t - openAt < 900 + i * 110);
      });
      lock.style.opacity = shown ? Math.max(0, 1 - (t - from) / 250) : prog(t, 600, 400);
      lock.style.transform = shown ? `scale(${1 + 0.3 * clamp((t - from) / 250)})` : '';
      rise(foot, prog(t, 800, 400));
      rise(assist, prog(t, 900, 400));

      const left = Math.ceil(v.remaining / 1000);
      tickEls.forEach((k, i) => k.classList.toggle('on', i < left));
      ticks.classList.toggle('low', left <= 5);
      clock.classList.toggle('low', left <= 5);
      clock.textContent = secs(v.remaining);
      if (sound && lastSec !== null && left !== lastSec && left > 0) sound(left <= 5 ? 'tickUrgent' : 'tick');
      lastSec = left;

      rows.forEach((r, i) => r.classList.toggle('removed', v.removed.includes(i)));
      cnum.textContent = v.totalAnswers;
      const key = v.recent.map((p) => p.name).join('|');
      if (key !== stackKey) {
        stackKey = key;
        stack.replaceChildren(...v.recent.slice(-5).map((p) => avatar(p, 44)));
      }
      const got = shown ? v.hintLikes : Math.min(v.likes, v.hintLikes);
      const on = Math.floor((got / v.hintLikes) * 10);
      segs.forEach((s, i) => s.classList.toggle('on', i < on));
      assist.classList.toggle('done', shown);
      lockNum.textContent = `${Math.min(v.likes, v.hintLikes)}/${v.hintLikes} LIKE`;
      alabel.textContent = v.hintBy ? `DUA PILIHAN DICORET OLEH @${v.hintBy}`
        : v.openedBy ? `PILIHAN DIBUKA OLEH @${v.openedBy}`
        : shown ? 'PILIHAN DIBUKA' : `${got}/${v.hintLikes} LIKE`;
      clock.classList.toggle('frozen', v.frozen);
    },
  };
  return self;
}

// ---------------------------------------------------------------- buka jawaban
function reveal(v, ctx) {
  const q = v.question;
  const root = el('div');
  const note = el('div', 'ui rev-note mono');
  const line = el('span', 'line');
  note.append(el('span', '', 'WAKTU HABIS'), line, el('span', '', 'JAWABAN DIBUKA'));
  const cat = catLine(q);
  const qs = el('div', 'ui qsmall', q.q);

  let map = null;
  let mapBox = null;
  let shapeMap = null;
  if (q.shape && ctx.geoData) {
    mapBox = el('div', 'ui mapbox');
    const cv = el('canvas');
    cv.width = 1904;
    cv.height = 540;
    const [lon, lat] = ctx.geoData[q.shape.kind === 'provinsi' ? 'provinces' : 'countries'][q.shape.name].center;
    mapBox.append(cv, el('div', 'coord mono', formatCoord(lat, lon > 180 ? lon - 360 : lon)), el('div', 'tag mono', q.source.toUpperCase()));
    shapeMap = new ShapeView(cv, ctx.geoData, q.shape);
  } else if (q.map && ctx.mapData) {
    mapBox = el('div', 'ui mapbox');
    const cv = el('canvas');
    cv.width = 1904;
    cv.height = 540;
    mapBox.append(cv, el('div', 'coord mono', formatCoord(q.map.lat, q.map.lon)), el('div', 'tag mono', 'PETA · NATURAL EARTH'));
    map = new MapView(cv, ctx.mapData, q.map.region);
  }

  const fakta = el('div', `ui fakta${mapBox ? '' : ' solo'}`);
  fakta.append(el('span', 'lbl', 'FAKTA'), el('p', '', q.fact), el('div', 'src mono', `SUMBER: ${q.source}`));

  const total = Math.max(1, v.counts.reduce((a, b) => a + b, 0));
  const two = q.options.length === 2;
  const list = el('ol', `ui options compact${two ? ' two' : ''}`);
  const rows = q.options.map((o, i) => {
    const win = i === q.answer;
    const li = el('li', `opt${win ? ' win' : ''}`);
    const bg = el('span', 'win-bg');
    const t = el('span', 't', o);
    const pct = el('span', 'p', '0%');
    const bar = el('span', 'bar');
    li.append(bg, el('span', 'mk'), t);
    if (win) li.append(el('span', 'stamp', 'BENAR'));
    li.append(pct, bar);
    list.append(li);
    return { li, bg, t, pct, bar, win, share: v.counts[i] / total };
  });

  const stats = el('div', 'ui stats mono');
  const s1 = el('span');
  s1.append(el('b', '', String(v.correctCount)), ` DARI ${v.totalAnswers} BENAR`);
  stats.append(s1);
  if (v.winners[0]) {
    const s2 = el('span', '', 'TERCEPAT ');
    s2.append(el('b', 'user', `@${v.winners[0].name}`), ` · ${fmtSec(v.winners[0].ms)}`);
    stats.append(s2);
  }

  root.append(head(v), note, cat, qs, ...(mapBox ? [mapBox] : []), fakta, list, stats);
  return {
    node: root,
    cues: [{ at: 0, name: 'timeUp' }, { at: 450, name: 'reveal' }],
    mount() {
      fit(qs, { max: 34, min: 24, height: 80 });
      fit(fakta.querySelector('p'), mapBox ? { max: 38, min: 28, height: 130 } : { max: 54, min: 36, height: 400 });
      for (const r of rows) fit(r.t, { max: two ? 48 : 34, min: 24, oneLine: true });
    },
    update(v) {
      const t = v.elapsed;
      line.style.transform = `scaleX(${prog(t, 0, 500)})`;
      rise(note, prog(t, 0, 250), 0);
      rise(cat, prog(t, 100, 300));
      rise(qs, prog(t, 150, 300));
      for (const r of rows) {
        const pw = prog(t, 450, 450);
        if (r.win) {
          r.bg.style.transform = `scaleX(${pw})`;
          r.li.style.color = pw > 0.5 ? 'var(--ink)' : '';
        } else {
          r.li.classList.toggle('dim', t > 450);
        }
        const pb = prog(t, 700, 1000);
        r.bar.style.transform = `scaleX(${r.share * pb})`;
        countUp(r.pct, r.share * 100, pb, (x) => `${x}%`);
      }
      if (mapBox) {
        rise(mapBox, prog(t, 500, 500), 16);
        if (shapeMap) shapeMap.draw(q.capital ? q.shape.name : q.options[q.answer], prog(t, 1000, 700), t);
        else map.draw(q.map, prog(t, 1000, 700), t);
      }
      rise(fakta, prog(t, 900, 500));
      rise(stats, prog(t, 1500, 400));
    },
  };
}

// ---------------------------------------------------------------- tercepat benar
function winners(v) {
  const q = v.question;
  const root = el('div');
  const title = el('div', 'ui btitle');
  title.append('TERCEPAT ', el('em', '', 'BENAR'));
  const sub = el('div', 'ui bsub mono', `SOAL ${pad(v.qNumber)} · JAWABAN: ${q.options[q.answer]}`);
  const cardsBox = el('div', 'ui cards');
  const cards = v.winners.map((w, i) => {
    const c = el('div', 'card');
    const who = el('div', 'who');
    const meta = el('div', 'meta mono');
    meta.append(el('span', '', fmtSec(w.ms)));
    if (w.streak >= v.rules.streakFrom) meta.append(el('span', 'streak', `${w.streak}X BERUNTUN`));
    if (w.mult > 1) meta.append(el('span', 'streak', `BOOST x${xm(w.mult)}`));
    who.append(el('div', 'n', w.name), meta);
    const pts = el('div', 'pts', '+0');
    c.append(el('span', 'r', pad(i + 1)), avatar(w, 96), who, pts);
    cardsBox.append(c);
    return { c, pts, points: w.points };
  });

  const rest = Math.max(0, v.correctCount - v.winners.length);
  const parts = [head(v), title, sub, cardsBox];
  let cells = [];
  let wallTitle = null;
  if (rest > 0) {
    wallTitle = el('div', 'ui wall-title mono');
    const wt = el('span');
    wt.append(el('b', '', 'JUGA BENAR'));
    wallTitle.append(wt, el('span', '', `${rest} ORANG`));
    const wall = el('div', 'ui wall');
    const max = 7; // satu baris: di bawahnya sudah area komentar
    const shown = v.wall.slice(0, rest > max ? max - 1 : max);
    cells = shown.map((p) => {
      const cell = el('div', 'cell');
      cell.append(avatar(p, 72), el('span', 'nm user', p.name));
      wall.append(cell);
      return cell;
    });
    if (rest > shown.length) {
      const more = el('div', 'cell');
      const bubble = el('span', 'av');
      bubble.style.cssText = 'width:72px;height:72px;background:transparent';
      bubble.append(el('span', 'ini', `+${rest - shown.length}`));
      more.append(bubble, el('span', 'nm', 'LAINNYA'));
      wall.append(more);
      cells.push(more);
    }
    parts.push(wallTitle, wall);
  }
  root.append(...parts);
  return {
    node: root,
    cues: [{ at: 0, name: 'title' }, ...cards.map((_, i) => ({ at: 350 + i * 380, name: 'card' }))],
    update(v) {
      const t = v.elapsed;
      rise(title, prog(t, 0, 450));
      rise(sub, prog(t, 120, 450));
      cards.forEach((c, i) => {
        slide(c.c, prog(t, 350 + i * 380, 500), 120);
        countUp(c.pts, c.points, prog(t, 550 + i * 380, 700), (x) => `+${x}`);
      });
      if (wallTitle) rise(wallTitle, prog(t, 1600, 400));
      cells.forEach((c, i) => rise(c, prog(t, 1750 + i * 45, 350), 16));
    },
  };
}

// ---------------------------------------------------------------- papan skor / klasemen
function leaderboard(v, { titleParts, subText, entries, dense, nextLabel, fans = [] }) {
  const root = el('div');
  const title = el('div', 'ui btitle');
  title.append(titleParts[0], el('em', '', titleParts[1]));
  const sub = el('div', 'ui bsub mono', subText);
  const parts = [head(v, null, { right: v.phase === 'board' ? 'soal' : 'ronde' }), title, sub];
  let rows = [];
  let scan = null;
  if (entries.length) {
    const list = el('ol', `ui board${dense ? ' dense' : ''}`);
    // Pita pindai pelan di atas daftar: layar tetap hidup setelah semua baris masuk.
    scan = el('span', 'scan');
    rows = entries.map((e, i) => {
      const li = el('li');
      const s = el('span', 's', '0');
      const c = el('span', 'c', `${e.correct} BENAR`);
      if (e.boost > 1) c.prepend(el('span', 'boost', `x${xm(e.boost)}`), ' ');
      li.append(el('span', 'r', pad(i + 1)), avatar(e, dense ? 52 : 72), el('span', 'n', e.name), c, s);
      list.append(li);
      return { li, s, score: e.score };
    });
    list.append(scan); // setelah baris, supaya li:first-child tetap baris juara
    parts.push(list);
  } else {
    parts.push(el('div', 'ui empty', 'Belum ada skor. Ketik jawabanmu di soal berikutnya.'));
  }
  const next = el('div', 'ui next mono');
  const nb = el('b');
  const countdown = el('span', 'countdown');
  next.append(el('span', '', nextLabel), nb, countdown);
  parts.push(next);
  // Pendukung live: yang mengirim gift selama sesi ini, terbaru dulu.
  let fanBox = null;
  if (fans.length) {
    fanBox = el('div', 'ui fans');
    const ft = el('div', 'fans-title mono');
    ft.append(el('b', '', 'PENDUKUNG LIVE'), ' · MAKASIH GIFT-NYA');
    const row = el('div', 'fans-row');
    for (const f of fans.slice(0, 9)) {
      const c = el('div', 'fan');
      c.append(avatar(f, 64), el('span', 'nm user', f.name));
      row.append(c);
    }
    fanBox.append(ft, row);
    parts.push(fanBox);
  }
  // Slot bawah layar jeda (di bawah pendukung live kalau ada): info bonus pendukung dulu,
  // lalu disapu keluar dan diganti banner promosi.
  const slotTop = fanBox ? 1330 : 1190;
  const perks = perkPanel(v.rules.giftTiers);
  perks.node.style.top = `${slotTop}px`;
  const promo = promoBanner(true);
  promo.node.classList.add('ui');
  promo.node.style.top = `${slotTop}px`;
  parts.push(perks.node, promo.node);
  root.append(...parts);
  const stagger = dense ? 110 : 160;
  const perkAt = fanBox ? 2000 : 1600;
  const swapAt = perkAt + PERK_SHOW;
  return {
    node: root,
    cues: [{ at: 0, name: 'title' }, ...rows.map((_, i) => ({ at: 400 + i * stagger, name: 'row' })), ...perks.cues(perkAt)],
    update(v) {
      const t = v.elapsed;
      rise(title, prog(t, 0, 450));
      rise(sub, prog(t, 120, 450));
      rows.forEach((r, i) => {
        slide(r.li, prog(t, 400 + i * stagger, 450), 60);
        countUp(r.s, r.score, prog(t, 500 + i * stagger, 800), (x) => x.toLocaleString('id-ID'));
      });
      rise(next, prog(t, 600, 400));
      if (fanBox) rise(fanBox, prog(t, 1600, 500));
      perks.update(t - perkAt, clamp((t - swapAt) / 350));
      promo.node.style.visibility = t >= swapAt + 200 ? '' : 'hidden';
      promo.update(Math.max(0, t - swapAt - 200));
      nb.textContent = secs(v.remaining);
      countdown.style.transform = `scaleX(${clamp(v.remaining / v.duration)})`;
      if (scan) {
        const ph = (t % 4000) / 4000;
        scan.style.transform = `translateY(${ph * 100}%)`;
        scan.style.opacity = prog(t, 1500, 600);
      }
    },
  };
}

function board(v) {
  return leaderboard(v, {
    titleParts: ['PAPAN ', 'SKOR'],
    subText: `RONDE ${pad(v.round)} · SETELAH ${v.qNumber} DARI ${v.qTotal} SOAL`,
    entries: v.roundBoard,
    nextLabel: 'SOAL BERIKUTNYA',
  });
}

function standings(v) {
  return leaderboard(v, {
    titleParts: ['KLASEMEN ', 'LIVE'],
    subText: `TOTAL SKOR SEJAK LIVE DIMULAI · ${v.playerCount} PEMAIN`,
    entries: v.standings,
    dense: true,
    nextLabel: 'PILIH TOPIK RONDE BERIKUTNYA DALAM',
    fans: v.supporters,
  });
}

// ---------------------------------------------------------------- podium juara ronde
function podium(v) {
  const root = el('div');
  const title = el('div', 'ui btitle');
  title.append('JUARA ', el('em', '', `RONDE ${pad(v.round)}`));
  const sub = el('div', 'ui bsub mono', `${v.qTotal} SOAL SELESAI · SKOR DIRESET DI RONDE BERIKUTNYA`);
  const stage = el('div', 'ui podium');
  const spec = [
    { rank: 1, x: 326, ped: 330, size: 180, cls: 'first', at: 1300 },
    { rank: 2, x: 0, ped: 240, size: 140, cls: '', at: 800 },
    { rank: 3, x: 652, ped: 180, size: 140, cls: '', at: 400 },
  ];
  const cols = spec.filter((s) => v.roundBoard[s.rank - 1]).map((s) => {
    const e = v.roundBoard[s.rank - 1];
    const col = el('div', `pcol ${s.cls}`);
    col.style.left = `${s.x}px`;
    const top = el('div');
    Object.assign(top.style, { display: 'flex', flexDirection: 'column', alignItems: 'center' });
    let rings = [];
    if (s.rank === 1) {
      top.append(el('span', 'crown', 'JUARA'));
      const halo = el('div', 'halo');
      rings = [0, 1].map(() => halo.appendChild(el('span', 'ring')));
      halo.append(avatar(e, s.size));
      top.append(halo);
    } else {
      top.append(avatar(e, s.size));
    }
    top.append(el('div', 'n', e.name), el('div', 's', `${e.score.toLocaleString('id-ID')} POIN · ${e.correct} BENAR`));
    const ped = el('div', 'ped');
    ped.style.height = `${s.ped}px`;
    ped.append(el('span', '', String(s.rank)));
    col.append(top, ped);
    stage.append(col);
    return { top, ped, at: s.at, rings };
  });
  root.append(head(v, null, { right: 'ronde' }), title, sub, stage, el('div', 'ui podium-base'));
  return {
    node: root,
    cues: [{ at: 0, name: 'title' }, ...cols.map((c) => ({ at: c.at, name: c.at === 1300 ? 'podium' : 'row' }))],
    update(v) {
      const t = v.elapsed;
      rise(title, prog(t, 0, 450));
      rise(sub, prog(t, 120, 450));
      for (const c of cols) {
        c.ped.style.transform = `scaleY(${prog(t, c.at, 500)})`;
        rise(c.top, prog(t, c.at + 350, 500), -30);
        c.rings.forEach((r, i) => {
          const ph = ((t + i * 1000) % 2000) / 2000;
          r.style.transform = `scale(${1 + ph * 0.6})`;
          r.style.opacity = (1 - ph) * prog(t, c.at + 600, 400);
        });
      }
    },
  };
}

// ---------------------------------------------------------------- voting tema
function vote(v) {
  const root = el('div');
  const title = el('div', 'ui btitle');
  title.append('PILIH ', el('em', '', 'TOPIK'));
  // Huruf kartu dan nama topik sama-sama dihitung; tulis huruf yang ada saja (kartu bisa < 4).
  const keys = VOTE_KEYS.slice(0, v.vote.options.length).map((k) => k.toUpperCase()).join('/');
  const sub = el('div', 'ui bsub mono', `RONDE ${pad(v.round + 1)} · KETIK HURUF KARTU (${keys}) ATAU NAMA TOPIK · TERBANYAK MENANG`);
  // Kartu topik seperti kartu remi di tangan: muka kertas, ikon topik di tengah, indeks di
  // pojok (A K Q J). Kartu yang memimpin terangkat dari kipas.
  const RANK = VOTE_KEYS.map((k) => k.toUpperCase());
  const FAN = [{ r: -5, y: 22 }, { r: -1.7, y: 6 }, { r: 1.7, y: 6 }, { r: 5, y: 22 }];
  const list = el('div', 'ui vhand');
  const tally = el('div', 'ui vtally');
  // Akhir siklus topik bisa tinggal 1-3 kartu: kipas digeser ke tengah.
  const shift = ((4 - v.vote.options.length) * 243) / 2;
  const rows = v.vote.options.map((o, i) => {
    const st = topicStyle(o.id);
    const card = el('div', 'pcard');
    card.style.setProperty('--tc', st.color);
    card.style.left = `${shift + i * 243}px`;
    const corner = (cls) => {
      const c = el('div', `pc-corner ${cls}`);
      const mini = el('span', 'pc-mini');
      mini.innerHTML = st.icon; // SVG statis dari topics.js, bukan masukan penonton
      c.append(el('b', '', RANK[i]), mini);
      return c;
    };
    const icon = el('span', 'pc-icon');
    icon.innerHTML = st.icon;
    const kw = el('div', 'pc-kw', o.keyword.toUpperCase());
    const lb = el('div', 'pc-lb mono', o.label.toLowerCase() === o.keyword ? '' : o.label.toUpperCase());
    const tag = el('span', 'pc-tag mono', 'MEMIMPIN');
    card.append(el('span', 'pc-frame'), corner('tl'), icon, kw, lb, corner('br'), tag);
    list.append(card);
    const col = el('div', 'vt-col');
    col.style.left = `${shift + i * 243}px`;
    const n = el('span', 'vt-n', '0');
    const bar = el('span', 'vt-bar');
    bar.style.setProperty('--tc', st.color);
    col.append(n, el('span', 'vt-track'), bar);
    tally.append(col);
    return { li: card, bar, n, fan: FAN[i] };
  });
  const next = el('div', 'ui next mono');
  const nb = el('b');
  const voters = el('span');
  next.append(voters, nb);
  // Pengirim gift sultan yang belum memilih: diberi tahu bahwa komentarnya langsung menentukan topik.
  const pickNote = el('div', 'ui pick-note');
  const pickAv = el('span', 'pn-av');
  const pickTx = el('div', 'pn-tx');
  const pickName = el('b', 'user');
  pickTx.append(pickName, el('span', 'mono', 'KETIK NAMA TOPIK DI KOMENTAR, LANGSUNG JADI TOPIK RONDE DEPAN'));
  pickNote.append(el('span', 'pn-tag mono', 'HAK SULTAN'), pickAv, pickTx);
  let pickKey = '';
  let pickAt = null;
  const perks = perkPanel(v.rules.giftTiers);
  perks.node.style.top = '1190px';
  const PERK_AT = 1300;
  root.append(head(v, null, { right: 'ronde' }), title, sub, list, tally, pickNote, next, perks.node);
  return {
    node: root,
    cues: [{ at: 0, name: 'title' }, ...rows.map((_, i) => ({ at: 400 + i * 150, name: 'row' })), ...perks.cues(PERK_AT)],
    update(v) {
      const t = v.elapsed;
      perks.update(t - PERK_AT);
      const pk = v.pick && !v.pick.theme ? v.pick : null;
      if ((pk?.name ?? '') !== pickKey) {
        pickKey = pk?.name ?? '';
        pickAt = pk ? t : null;
        pickName.textContent = pk ? `@${pk.name}` : '';
        pickAv.replaceChildren(...(pk ? [avatar(pk, 64)] : []));
      }
      pickNote.style.visibility = pk ? '' : 'hidden';
      if (pk) {
        const pp = clamp((t - pickAt) / 420);
        pickNote.style.opacity = Math.min(1, pp * 2);
        pickNote.style.transform = `translateX(${(1 - back(pp)) * -120}px)`;
      }
      rise(title, prog(t, 0, 450));
      rise(sub, prog(t, 120, 450));
      const opts = v.vote?.options ?? [];
      const max = Math.max(1, ...opts.map((o) => o.votes));
      const lead = opts.findIndex((o) => o.votes === max && o.votes > 0);
      rows.forEach((r, i) => {
        // Kartu dibagikan satu per satu dari bawah, lalu yang memimpin terangkat.
        const p = prog(t, 400 + i * 150, 500);
        const isLead = i === lead;
        r.lift = (r.lift ?? 0) + ((isLead ? 1 : 0) - (r.lift ?? 0)) * 0.18;
        const y = r.fan.y + (1 - p) * 160 - r.lift * 40;
        r.li.style.opacity = p;
        r.li.style.transform = `translateY(${y}px) rotate(${r.fan.r * (isLead ? 0.4 : 1)}deg)`;
        r.li.style.zIndex = isLead ? 5 : 1;
        r.li.classList.toggle('lead', isLead);
        const votes = opts[i]?.votes ?? 0;
        r.n.textContent = votes;
        r.bar.style.transform = `scaleX(${votes / max})`;
      });
      voters.textContent = `${v.vote?.voters ?? 0} PEMILIH · RONDE ${pad(v.round + 1)} DALAM`;
      rise(next, prog(t, 900, 400));
      nb.textContent = secs(v.remaining);
    },
  };
}

// ---------------------------------------------------------------- topik pilihan sultan
// Vote dilewati. Tiga kartu tertutup dibagikan, dua disingkirkan, kartu tengah dibalik jadi topik
// pilihan, dibanting membesar, lalu dicap nama pemilihnya.
const PK = { deal: 300, flip: 950, slam: 1350, stamp: 1750 };

function topicFace(st, keyword, label) {
  const frag = [];
  const corner = (cls) => {
    const c = el('div', `pc-corner ${cls}`);
    const mini = el('span', 'pc-mini');
    mini.innerHTML = st.icon; // SVG statis dari topics.js
    c.append(mini);
    return c;
  };
  const icon = el('span', 'pc-icon');
  icon.innerHTML = st.icon;
  frag.push(el('span', 'pc-frame'), corner('tl'), icon, el('div', 'pc-kw', keyword.toUpperCase()),
    el('div', 'pc-lb mono', label.toLowerCase() === keyword ? '' : label.toUpperCase()), corner('br'));
  return frag;
}

function picked(v) {
  const p = v.picked;
  const root = el('div');
  const title = el('div', 'ui btitle');
  title.append('TOPIK ', el('em', '', 'PILIHAN SULTAN'));
  const sub = el('div', 'ui bsub mono', `RONDE ${pad(v.round + 1)} · VOTE DILEWATI · DIPILIH LEWAT KOMENTAR`);
  const st = topicStyle(p.theme.id);
  const table = el('div', 'ui pk-table');
  table.style.setProperty('--tc', st.color);
  const rays = el('span', 'pk-rays');
  // Kartu tertutup kiri dan kanan, lalu kartu tengah yang dibalik.
  const ghosts = [-1, 1].map((side) => {
    const g = el('div', 'pcard back');
    g.append(el('span', 'pc-frame'));
    table.append(g);
    return { g, side };
  });
  const card = el('div', 'pcard chosen');
  card.style.setProperty('--tc', st.color);
  const front = el('div', 'pc-front');
  front.append(...topicFace(st, p.theme.keyword, p.theme.label));
  const backFace = el('div', 'pc-back');
  backFace.append(el('span', 'pc-frame'));
  card.append(front, backFace);
  const stamp = el('div', 'pk-stamp');
  const sTx = el('div', 'ps-tx');
  sTx.append(el('span', 'mono', 'DIPILIH'), el('b', 'user', `@${cleanName(p.name)}`));
  stamp.append(avatar(p, 76), sTx);
  table.prepend(rays);
  table.append(card, stamp);
  const next = el('div', 'ui next mono');
  const nb = el('b');
  next.append(el('span', '', `RONDE ${pad(v.round + 1)} · ${p.theme.label.toUpperCase()} DIMULAI DALAM`), nb);
  root.append(head(v, null, { right: 'ronde' }), title, sub, table, next);
  const CX = (952 - 222) / 2;
  return {
    node: root,
    mount() {
      fit(sTx.querySelector('b'), { max: 54, min: 28, oneLine: true });
    },
    cues: [{ at: 0, name: 'title' }, { at: PK.deal, name: 'whoosh' }, { at: PK.flip, name: 'reveal' }, { at: PK.slam, name: 'impact' },
      { at: PK.stamp, name: 'powerup' }, { at: PK.stamp + 150, name: 'sparkle' }],
    update(v) {
      const t = v.elapsed;
      rise(title, prog(t, 0, 450));
      rise(sub, prog(t, 120, 450));
      // Bagi kartu: tiga kartu naik dari bawah membentuk kipas.
      const deal = (i) => back(clamp((t - PK.deal - i * 90) / 460));
      const away = smooth(clamp((t - PK.flip) / 420));
      ghosts.forEach(({ g, side }, i) => {
        const d = deal(i === 0 ? 0 : 2);
        g.style.left = `${CX}px`;
        g.style.opacity = t >= PK.deal ? 1 - away : 0;
        g.style.transform = `translate(${side * (250 + away * 500)}px, ${(1 - d) * 700 + 30}px) rotate(${side * (8 + away * 30)}deg)`;
      });
      // Kartu tengah: dibalik (lebar menyempit lalu melebar), lalu dibanting membesar dan melayang pelan.
      const d = deal(1);
      const fl = clamp((t - PK.flip) / 400);
      const sx = Math.abs(Math.cos(fl * Math.PI));
      const showFront = fl >= 0.5;
      front.style.visibility = showFront ? '' : 'hidden';
      backFace.style.visibility = showFront ? 'hidden' : '';
      const slam = back(clamp((t - PK.slam) / 380));
      const scale = 1 + 0.55 * slam;
      const bob = t > PK.slam + 400 ? Math.sin((t - PK.slam) / 520) * 6 : 0;
      card.style.left = `${CX}px`;
      card.style.opacity = t >= PK.deal ? 1 : 0;
      card.style.transform = `translateY(${(1 - d) * 700 + bob}px) scale(${scale}) scaleX(${t < PK.flip ? 1 : sx})`;
      card.classList.toggle('lead', t >= PK.slam);
      // Sinar di belakang kartu berputar pelan setelah kartu mendarat.
      rays.style.opacity = prog(t, PK.slam, 500) * 0.9;
      rays.style.transform = `rotate(${t / 60}deg) scale(${0.6 + 0.4 * prog(t, PK.slam, 600)})`;
      // Cap nama dibanting dari besar ke ukuran asli, sedikit miring.
      const sp = clamp((t - PK.stamp) / 260);
      stamp.style.opacity = t >= PK.stamp ? Math.min(1, sp * 3) : 0;
      stamp.style.transform = `rotate(-7deg) scale(${2.2 - 1.2 * ease(sp)})`;
      // Guncangan kecil sekali saat cap menghantam.
      const hit = t >= PK.stamp + 260 && t < PK.stamp + 460 ? Math.sin((t - PK.stamp) / 18) * 6 * (1 - (t - PK.stamp - 260) / 200) : 0;
      table.style.transform = `translateX(${hit}px)`;
      rise(next, prog(t, PK.stamp + 300, 400));
      nb.textContent = secs(v.remaining);
    },
  };
}

export const SCENES = { rules, intro, answer, reveal, winners, board, podium, standings, vote, picked };

// ---------------------------------------------------------------- zona bawah
// Klasemen live mini di area bawah selama kuis berjalan, klasemen ronde di bawahnya,
// plus ucapan follow/share terbaru.
const LOWER_PHASES = new Set(['intro', 'answer', 'reveal', 'winners']);

// Satu baris 5 besar: nomor, foto, boost, nama, skor.
function chipSection(cls, size) {
  const sec = el('div', `lsec ${cls}`);
  const headRow = el('div', 'lower-head mono');
  const label = el('span');
  const right = el('span', 'lower-toast');
  headRow.append(label, right);
  const chips = el('div', 'chips5');
  sec.append(headRow, chips);
  let key = '';
  return {
    sec, label, right,
    set(entries) {
      const k = entries.map((e) => `${e.user}:${e.score}:${e.boost}`).join('|');
      if (k === key) return;
      key = k;
      chips.replaceChildren(...entries.map((e, i) => {
        const c = el('div', 'chip5');
        const top = el('div', 'c5top');
        top.append(el('span', 'c5r', pad(i + 1)), avatar(e, size));
        if (e.boost > 1) top.append(el('span', 'boost', `x${xm(e.boost)}`));
        c.append(top, el('span', 'c5n user', e.name), el('span', 'c5s', e.score.toLocaleString('id-ID')));
        return c;
      }));
    },
  };
}

// Nama tingkat di kartu boost. Keterangannya rentang koin dari ambang tingkat (lihat coinRange):
// lebih jelas daripada contoh gift, karena satu combo Mawar bisa naik tingkat.
const GIFT_TIER_INFO = {
  kecil: { label: 'GIFT KECIL' },
  sedang: { label: 'GIFT SEDANG' },
  besar: { label: 'GIFT SULTAN' },
};

// Kartu "KIRIM GIFT, DAPAT BOOST" di zona bawah. Mati: memicu sanksi TikTok "inorganic gift solicitation".
const SHOW_GIFT_STRIP = false;

// Keuntungan gift selain pengali poin. Suara topik kecil tidak ditulis supaya kartu tetap ringkas.
const giftPerks = (t) => [
  `${t.questions} SOAL`,
  ...(t.tries ? [`+${t.tries} TEBAKAN`] : []),
  ...(t.hint ? ['BUKA PILIHAN'] : []),
  ...(t.vote >= 50 ? [`+${t.vote} SUARA TOPIK`] : []),
];

// Daftar boost gift: kartu per tingkat berjalan pelan ke kiri dan berulang, jadi semuanya
// bergiliran lewat. Posisi dihitung dari jam (`now`), bukan CSS animation.
function giftStrip(tiers) {
  // Rentang koin per tingkat: "1–9 koin", "10–99 koin", "100 koin ke atas" (total satu kiriman/combo).
  const coinRange = (t) => {
    const next = tiers.find((x) => x.min > t.min);
    return next ? `${t.min}–${next.min - 1} koin` : `${t.min} koin ke atas`;
  };
  const sec = el('div', 'lsec gifts');
  const headRow = el('div', 'lower-head mono');
  const lbl = el('span');
  lbl.append(el('b', '', 'KIRIM GIFT, DAPAT BOOST'), ' · POIN DIKALI DI SOAL YANG KAMU JAWAB');
  headRow.append(lbl);
  const view = el('div', 'gstrip');
  const track = el('div', 'gtrack');
  const card = (t) => {
    const info = { label: t.tier.toUpperCase(), ...GIFT_TIER_INFO[t.tier], eg: coinRange(t) };
    const c = el('div', `gcard ${t.tier}`);
    const x = el('div', 'gx');
    x.append(el('b', '', `x${xm(t.mult)}`), el('span', 'mono', 'POIN'));
    const tx = el('div', 'gtx');
    const perk = giftPerks(t).join(' · ');
    tx.append(el('span', 'gt', info.label), el('span', 'ge', info.eg), el('span', 'gp mono', perk));
    if (t.tier === 'besar') c.append(el('span', 'gstripes'));
    c.append(x, tx);
    return c;
  };
  // Dua salinan berurutan supaya putarannya menyambung tanpa celah.
  for (let k = 0; k < 2; k++) for (const t of tiers) track.append(card(t));
  view.append(track);
  sec.append(headRow, view);
  const CARD = 372; // lebar kartu + jarak, sama dengan CSS
  const loop = CARD * tiers.length;
  return {
    sec,
    update(now) {
      track.style.transform = `translateX(${-((now * 0.05) % loop)}px)`;
      for (const s of track.querySelectorAll('.gstripes')) s.style.backgroundPosition = `${(now * 0.04) % 56}px 0`;
    },
  };
}

// Banner promosi jasa setup live, gaya lower-third siaran: tag pertanyaan, kata yang
// bergiliran, CTA. `big` untuk layar jeda (papan skor, klasemen).
const PROMO = {
  ask: ['MAU LIVE', 'KAYAK GINI?'],
  label: 'SETUP LIVE INTERAKTIF',
  words: ['KUIS LIVE', 'GAME LIVE', 'KONSEP CUSTOM', 'TERIMA BERES'],
  cta: 'DM AJA',
};
const PR_OPEN = 380; // isi terlihat setelah balok sapuan menutup penuh
const PR_WORD = 2400; // lama satu kata
const PR_BEAT = 458; // denyut kecil, setempo musik sultan pertama
// Kulit slot per kata: [latar, warna kata, warna gema]. Ganti latar = potongan adegan.
const PR_SKIN = [
  ['var(--ink)', 'var(--paper)', 'var(--signal)'],
  ['#7d1d4f', 'var(--paper)', '#e2508f'],
  ['var(--paper)', 'var(--ink)', 'var(--signal)'],
  ['var(--ink)', 'var(--signal)', 'var(--paper)'],
];

function promoBanner(big) {
  const node = el('div', `promo${big ? ' big' : ''}`);
  const tag = el('div', 'pr-tag');
  tag.append(el('span', 'mono', PROMO.ask[0]), el('b', '', PROMO.ask[1]));
  const slot = el('div', 'pr-slot');
  const top = el('div', 'pr-top mono');
  const idx = el('span');
  top.append(el('span', '', PROMO.label), idx);
  const box = el('div', 'pr-words');
  // Tiap kata punya gema garis di belakangnya, seperti kata raksasa di takeover sultan.
  const words = PROMO.words.map((w) => {
    const e = box.appendChild(el('b', 'pr-word echo', w));
    const m = box.appendChild(el('b', 'pr-word', w));
    return { m, e };
  });
  const under = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  under.setAttribute('viewBox', '0 0 400 24');
  under.setAttribute('preserveAspectRatio', 'none');
  under.setAttribute('class', 'pr-under');
  const uPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  uPath.setAttribute('d', 'M4 16 C 60 6, 120 22, 190 12 S 320 4, 396 14');
  under.append(uPath);
  const glitch = el('div', 'pr-glitch');
  const gBars = [0, 1, 2].map(() => glitch.appendChild(el('i')));
  const bar = el('span', 'pr-bar');
  slot.append(top, box, under, glitch, bar);
  const cta = el('div', 'pr-cta');
  const dm = el('div', 'pr-dm');
  const arrow = el('span', 'pr-arrow mono', '→');
  dm.append(el('b', '', PROMO.cta), arrow);
  cta.append(el('span', 'mono', 'LANGSUNG'), dm);
  // Tiga balok warna menyapu dari kiri bertingkat, lalu lepas ke kanan dan membuka isinya.
  // Urutan DOM = tumpukan: yang mulai duluan paling bawah, jadi tepinya terlihat berundak.
  const wipes = ['w3', 'w2', 'w1'].map((c) => el('span', `pr-wipe ${c}`));
  node.append(tag, slot, cta, ...wipes);
  const parts = [tag, slot, cta];
  return {
    node,
    // t: milidetik sejak banner muncul.
    update(t) {
      wipes.forEach((w, i) => {
        const shut = prog(t, i * 90, 280);
        const open = prog(t, PR_OPEN + (2 - i) * 90, 300);
        w.style.transformOrigin = open > 0 ? '100% 50%' : '0 50%';
        w.style.transform = `scaleX(${open > 0 ? 1 - open : shut})`;
      });
      for (const p of parts) p.style.opacity = t >= PR_OPEN ? 1 : 0;
      tag.style.transform = `translateX(${(1 - prog(t, PR_OPEN, 450)) * -40}px)`;

      // Kata dibanting masuk (gema menyusul), berdenyut di ketukan, lalu dipotong keluar ke kanan.
      // Latar slot berganti warna di setiap kata; coretan lime tergambar di bawahnya.
      const k = Math.max(0, t - PR_OPEN);
      const n = Math.floor(k / PR_WORD);
      const cur = n % words.length;
      const local = k % PR_WORD;
      const [bgc, fg, ec] = PR_SKIN[cur % PR_SKIN.length];
      slot.style.background = bgc;
      slot.style.setProperty('--pr-fg', fg);
      slot.style.setProperty('--pr-ec', ec);
      slot.classList.toggle('light', bgc === 'var(--paper)');
      const pulse = Math.exp(-(local % PR_BEAT) / 120);
      const sl = local < 160 ? 1.3 - 0.3 * ease(local / 160) : 1;
      const pout = clamp((local - (PR_WORD - 180)) / 180);
      const outTf = `translateX(${pout * pout * 140}px) skewX(${-8 - 18 * pout}deg)`;
      words.forEach((w, i) => {
        const on = i === cur;
        w.m.style.opacity = on ? 1 - pout : 0;
        w.e.style.opacity = on && local > 60 ? 1 - pout : 0;
        if (!on) return;
        w.m.style.transform = `${outTf} scale(${sl * (1 + 0.03 * pulse)})`;
        // Gema bergeser jauh lalu memudar, supaya kata utama tetap bersih terbaca.
        const lag = 6 + 16 * ease(clamp((local - 60) / 360));
        w.e.style.transform = `translate(${lag}px, ${lag * 0.6}px) ${outTf}`;
        w.e.style.opacity = on && local > 60 ? (1 - pout) * (1 - 0.65 * prog(local, 400, 600)) : 0;
      });
      uPath.style.strokeDasharray = '460';
      uPath.style.strokeDashoffset = `${460 * (1 - prog(local, 200, 420)) + 460 * pout}`;
      // Glitch singkat di setiap pergantian kata.
      gBars.forEach((g, i) => {
        const on = local < 90 && t > PR_OPEN + 50;
        g.style.opacity = on ? 1 : 0;
        if (!on) return;
        g.style.top = `${hash(n * 9 + i) * 90}%`;
        g.style.height = `${3 + hash(n * 9 + i + 3) * 10}px`;
        g.style.transform = `translateX(${(hash(n * 9 + i + 6) - 0.5) * 120}px)`;
      });
      idx.textContent = `${pad(cur + 1)}/${pad(words.length)}`;
      bar.style.transform = `scaleX(${local / PR_WORD})`;
      const cp = Math.exp(-((t - PR_OPEN) % PR_BEAT) / 140);
      dm.style.transform = `scale(${1 + 0.04 * cp})`;
      arrow.style.transform = `translateX(${Math.max(0, Math.sin(t / 200)) * 10}px)`;
    },
  };
}

// Panel info bonus pendukung di layar jeda (papan skor, klasemen) dan layar pilih topik.
// Hanya muncul di jeda, nada informatif, dan selalu ditemani "tetap bisa juara": ajakan gift yang
// tampil terus-menerus di setiap soal pernah kena sanksi TikTok.
// Bentuknya tangga: tiap tingkat lebih tinggi dan lebih "panas" warnanya dari kiri ke kanan.
const PERK_STEP = 120; // jeda antar anak tangga (ms), tiap anak tangga berbunyi
const PERK_GLINT = 2600; // kilau menyapu tangga, berulang
const PERK_SHOW = 6500; // lama panel tampil di layar jeda sebelum gantian dengan banner promosi

function perkPanel(tiers) {
  const extra = (t) => (t.pick ? 'PILIH TOPIK' : t.tier === 'besar' ? 'SOROTAN' : t.tries ? `+${t.tries} TEBAKAN` : `${t.questions} SOAL`);
  const node = el('div', 'ui perks');
  const top = el('div', 'pk-top mono');
  top.append(el('b', '', 'BONUS BUAT PENDUKUNG'), el('span', '', 'NGGAK KIRIM GIFT? TETAP BISA JUARA'));
  const stair = el('div', 'pk-stair');
  const steps = tiers.map((t, i) => {
    const s = el('div', `pk-step s${i + 1}`);
    s.style.height = `${116 + i * 17}px`;
    const coin = el('span', 'pk-coin mono', `${t.min}+ KOIN`);
    const x = el('b', 'pk-x', `×${xm(t.mult)}`);
    const tag = el('span', 'pk-tag mono', extra(t));
    s.append(coin, x, tag);
    stair.append(s);
    return { s, x, tag };
  });
  const glint = el('span', 'pk-glint');
  stair.append(glint);
  node.append(top, stair);
  return {
    node,
    // Bunyi relatif terhadap saat panel muncul.
    cues: (at) => [{ at, name: 'whoosh' }, ...steps.map((_, i) => ({ at: at + 260 + i * PERK_STEP, name: i === steps.length - 1 ? 'powerup' : 'row' })),
      { at: at + 260 + steps.length * PERK_STEP + 120, name: 'sparkle' }],
    // t: ms sejak panel muncul, out: 0..1 saat panel disapu keluar.
    update(t, out = 0) {
      node.style.visibility = t >= 0 && out < 1 ? '' : 'hidden';
      if (t < 0) return;
      rise(top, prog(t, 0, 380) * (1 - out), 14);
      steps.forEach((st, i) => {
        // Anak tangga tumbuh dari bawah dengan sedikit pantulan; label menyusul.
        const p = clamp((t - 260 - i * PERK_STEP) / 420);
        st.s.style.transform = `scaleY(${p >= 1 ? 1 : back(p)})`;
        st.s.style.opacity = (p > 0 ? 1 : 0) * (1 - out);
        const pl = prog(t, 420 + i * PERK_STEP, 300);
        st.x.style.transform = `translateY(${(1 - pl) * 18}px) scale(${1 + 0.18 * Math.exp(-Math.max(0, t - 420 - i * PERK_STEP) / 160) * (pl > 0 ? 1 : 0)})`;
        st.tag.style.opacity = pl;
      });
      // Anak tangga teratas berdenyut pelan; kilau lewat dari kiri ke kanan.
      const last = steps.at(-1);
      const beat = Math.exp(-((t % 916) / 220));
      last.tag.style.transform = `scale(${1 + 0.05 * beat})`;
      const g = ((t - 1400) % PERK_GLINT) / PERK_GLINT;
      glint.style.opacity = t > 1400 && g < 0.5 ? 1 - out : 0;
      glint.style.transform = `translateX(${g * 2 * 1100 - 200}px) skewX(-18deg)`;
      node.style.clipPath = out > 0 ? `inset(0 0 0 ${ease(out) * 100}%)` : '';
    },
  };
}

export function lowerZone(box) {
  const wrap = el('div', 'lower');
  const live = chipSection('live', 56);
  const round = chipSection('round', 44);
  wrap.append(live.sec, round.sec);
  box.append(wrap);
  let gifts = null;
  const promo = promoBanner(false);
  let toastKey = '';
  let shownAt = null; // banner disapu masuk lagi setiap zona bawah muncul
  return {
    update(v, now = 0) {
      if (!gifts && v.rules?.giftTiers) {
        gifts = giftStrip(v.rules.giftTiers);
        // Daftar boost gift tidak ditampilkan: tampil terus di setiap soal dengan angka koin dan
        // janji keuntungan, TikTok menilainya ajakan gift berulang dan membekukan gift + jangkauan live.
        if (SHOW_GIFT_STRIP) wrap.append(gifts.sec);
        wrap.append(promo.node);
      }
      const show = LOWER_PHASES.has(v.phase) && !v.spotlight && v.standings.length > 0;
      wrap.style.opacity = show ? 1 : 0;
      if (!show) {
        shownAt = null;
        return;
      }
      shownAt ??= now;
      live.label.replaceChildren(el('b', '', 'KLASEMEN LIVE'), ` · ${v.playerCount} PEMAIN`);
      live.set(v.standings.slice(0, 5));

      // Klasemen ronde: mulai ronde 2 (di ronde 1 isinya sama dengan klasemen live), begitu ada
      // yang dapat poin di ronde ini.
      const rb = v.round > 1 ? v.roundBoard.slice(0, 5) : [];
      round.label.replaceChildren(el('b', '', `KLASEMEN RONDE ${pad(v.round)}`), ` · ${(v.theme?.label ?? '').toUpperCase()}`);
      round.right.textContent = `SOAL ${pad(v.qNumber)}/${v.qTotal}`;
      round.set(rb);
      round.sec.style.display = rb.length ? '' : 'none';

      const tst = v.toasts.at(-1);
      const tk = tst ? `${tst.name}${tst.text}` : '';
      if (tk !== toastKey) {
        toastKey = tk;
        live.right.replaceChildren(...(tst ? [el('b', 'user', tst.name ? `${tst.name} ` : ''), tst.text.toUpperCase()] : []));
      }
      live.right.style.opacity = tst ? Math.min(1, tst.age / 300, (4500 - tst.age) / 400) : 0;
      gifts?.update(now);
      promo.update(now - shownAt);
    },
  };
}

// Gambar gift dari TikTok; kalau gagal dimuat, cukup teks namanya.
function giftImage(src, size) {
  const img = new Image();
  img.className = 'gift-img';
  img.referrerPolicy = 'no-referrer';
  img.alt = '';
  Object.assign(img.style, { width: `${size}px`, height: `${size}px` });
  img.onerror = () => img.remove();
  img.src = src;
  return img;
}

// ---------------------------------------------------------------- sorotan gift
// Kartu kertas: foto kotak penuh di kiri, nama besar, tab boost oranye menonjol di atas kanan,
// keuntungan khusus menggantung di bawah. kecil/sedang: satu kartu di slot bawah (tidak menutupi
// soal). besar (sultan): takeover layar penuh bergaya poster esports yang dikunci ke ketukan
// musik sultan, lalu turun jadi kartu di slot bawah. Nilai koin tidak pernah ditampilkan.
const back = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

// Musik sultan bergiliran per gift sultan. Ketukan dihitung dari awal klip (lihat CLIPS di sfx.js):
// `beat0` = ketukan keras pertama, `beat` = jarak antar ketukan (ms).
// Grid ketukan dipaskan ke seluruh potongan 10,5 dtk (periode dan fase dicari bersamaan).
const SULTAN_TRACKS = [
  { cue: 'sultan', beat0: 894, beat: 453.7 }, // 132 BPM, mulai detik 10
  { cue: 'sultan2', beat0: 84, beat: 353.3 }, // 170 BPM, mulai detik 11
  { cue: 'sultan3', beat0: 148, beat: 545.7 }, // 110 BPM, mulai detik 0
];
// Jadwal acuan takeover (ms, dirancang di lagu pertama). Untuk lagu lain setiap titik ditempel ke
// ketukan terdekat, jadi pergantian adegan selalu jatuh di beat.
// Sekitar 10 detik: tiap adegan sempat dibaca. +suara jatuh di drop lagu pertama (detik 18 lagu).
const PLAN = { s1: 890, tan: 1348, photo: 1806, glitch: 2722, s2: 3638, s3: 5470, s3s: 5928, s4: 8218, s4s: 8676, s4l: 9134, hero: 10050 };

function timeline(track) {
  const T = { ...track };
  let prev = 0;
  for (const [k, ms] of Object.entries(PLAN)) {
    let at = track.beat0 + Math.round((ms - track.beat0) / track.beat) * track.beat;
    while (at < prev + 300) at += track.beat; // urutan tetap naik, tiap langkah sempat terbaca
    T[k] = at;
    prev = at;
  }
  T.scenes = [0, T.s1, T.s2, T.s3, T.s4];
  return T;
}

// Bunyi per tingkat: [ms sejak sorotan mulai, nama SFX]. Sultan memakai klip musiknya sendiri.
const SPOT_CUES = {
  kecil: [[0, 'whoosh'], [380, 'gift'], [460, 'powerup']],
  sedang: [[0, 'whoosh'], [380, 'gift'], [460, 'powerup'], [700, 'sparkle']],
};

// Foto profil kotak; inisial kalau tidak ada atau gagal dimuat.
function photo(p) {
  const box = el('div', 'gc-ph');
  box.append(el('span', 'ini', initials(p?.name ?? '?')));
  let img = null;
  if (p?.avatar) {
    img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.alt = '';
    img.onload = () => box.classList.add('has-img'); // inisial disembunyikan di balik foto
    img.onerror = () => img.remove();
    img.src = p.avatar;
    box.append(img);
  }
  return { box, img };
}

function tabParts(cls) {
  const tab = el('div', `gc-tab${cls ? ` ${cls}` : ''}`);
  const num = el('b');
  const sub = el('span', 'mono');
  tab.append(num, sub);
  return { tab, num, sub };
}

// Label di bawah kartu gift: cuma yang langsung dirasakan pengirimnya, bukan janji keuntungan.
// Hak pilih topik ditulis sebagai petunjuk cara memakainya.
const perksOf = (s) => [...(s.tries ? [`+${s.tries} TEBAKAN`] : []), ...(s.pick ? ['KETIK NAMA TOPIK DI KOMENTAR: KAMU YANG PILIH'] : [])];

// Kartu di slot bawah (dipakai semua tingkat; sultan setelah kartu hero turun).
function giftCard(s) {
  const card = el('div', `gc ${s.tier}`);
  const face = el('div', 'gc-face');
  const ph = photo(s);
  const body = el('div', 'gc-body');
  const lbl = el('span', 'gc-lbl mono');
  const name = el('div', 'gc-name user', cleanName(s.name));
  const gift = el('div', 'gc-gift mono');
  if (s.giftImg) gift.append(giftImage(s.giftImg, 34));
  const giftLine = el('span');
  gift.append(giftLine);
  body.append(lbl, name, gift);
  const life = el('span', 'gc-life');
  face.append(ph.box, body, life);
  const T = tabParts();
  card.append(face, T.tab);
  const perks = perksOf(s);
  const perk = perks.length ? el('div', 'gc-perk mono', perks.join(' · ')) : null;
  if (perk) card.append(perk);
  return { card, face, img: ph.img, lbl, name, gift, giftLine, life, perk, ...T };
}

// Acak tetap (tanpa Math.random) supaya render frame-per-frame sama dengan live.
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Coretan tangan melingkar (dua putaran, sedikit goyah) di sekitar foto.
const SCRIBBLE = (() => {
  const pts = [];
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 2 * 1.35 - 0.6;
    const w = 1 + 0.06 * Math.sin(i * 0.23) + 0.025 * Math.sin(i * 0.61 + 1);
    pts.push(`${(540 + Math.cos(a) * 430 * w).toFixed(1)},${(900 + Math.sin(a) * 330 * w + i * 0.8).toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
})();

// Tepi sobek untuk bingkai foto: poligon dengan gigi acak di keempat sisi.
function tornEdge(seed) {
  const side = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n, hash(seed + i) * 2.2));
  const pts = [
    ...side(9, (p, j) => [p * 100, j]),
    ...side(11, (p, j) => [100 - j, p * 100]),
    ...side(9, (p, j) => [100 - p * 100, 100 - j]),
    ...side(11, (p, j) => [j, 100 - p * 100]),
  ];
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(', ')})`;
}

// Nama tampilan tanpa emoji (font poster tidak punya glyph emoji, hasilnya kotak/berantakan).
// Kalau isinya cuma emoji, pakai "SULTAN".
function cleanName(name) {
  const s = String(name ?? '')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u200d\ufe0f\u20e3]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || 'SULTAN';
}

// Nama dipecah jadi 1-3 baris raksasa, seperti RESI / LI / ENCE di referensi. Pemisah (_ . spasi)
// di awal baris kedua dibuang supaya tidak tampil sebagai garis yang melayang.
function nameChunks(name) {
  const s = cleanName(name).toUpperCase().slice(0, 33);
  const n = s.length <= 6 ? 1 : s.length <= 12 ? 2 : 3;
  // Ada pemisah: susun kata utuh ke paling banyak n baris (MUHAMMAD / RIZKY PRATAMA / OFFICIAL).
  const words = s.split(/[_. -]+/).filter(Boolean);
  if (words.length > 1 && n > 1 && Math.max(...words.map((w) => w.length)) <= 12) {
    const pack = (width) => words.reduce((lines, w) => {
      const last = lines.at(-1);
      if (last !== undefined && last.length + 1 + w.length <= width) lines[lines.length - 1] = `${last} ${w}`;
      else lines.push(w);
      return lines;
    }, []);
    // Lebar baris dinaikkan sedikit demi sedikit sampai cukup 3 baris.
    for (let width = Math.max(Math.ceil(words.join(' ').length / n), ...words.map((w) => w.length)); width <= 18; width++) {
      const lines = pack(width);
      if (lines.length <= 3) return lines;
    }
  }
  const size = Math.ceil(s.length / n);
  return Array.from({ length: n }, (_, i) => s.slice(i * size, (i + 1) * size)).filter(Boolean);
}

// Kecilkan huruf sampai satu baris muat di antara margin (diukur rata kiri, lalu dikembalikan).
function fitLine(node, max, min) {
  const align = node.style.textAlign;
  node.style.textAlign = 'left';
  let size = max;
  node.style.fontSize = `${size}px`;
  while (size > min && node.scrollWidth > node.clientWidth) {
    size -= 8;
    node.style.fontSize = `${size}px`;
  }
  node.style.textAlign = align;
  return size;
}

// Takeover sultan: blok warna penuh layar, huruf raksasa yang dibengkokkan dengan lapisan garis
// (gema) di belakangnya, foto duotone bertepi sobek, coretan garis, segitiga, dan glitch tiap ganti adegan.
function sultanTakeover(s) {
  const root = el('div', 'st');
  const bg = el('div', 'st-bg');
  // Satu blok warna per adegan; adegan berikutnya menyapu masuk secara diagonal di atas yang lama.
  const SCENE_BG = ['var(--ink)', 'var(--signal)', 'var(--ink)', '#7d1d4f', 'var(--signal)'];
  const layers = SCENE_BG.map((c, i) => {
    const l = el('div', 'st-layer');
    l.style.background = c;
    l.style.zIndex = i * 10;
    return l;
  });
  const shown = cleanName(s.name);
  const tri = el('div', 'st-tri');
  const tris = Array.from({ length: 9 }, (_, i) => {
    const t = tri.appendChild(el('i'));
    t.style.left = `${60 + hash(i * 3) * 940}px`;
    t.style.top = `${330 + hash(i * 3 + 1) * 1350}px`;
    return { t, r: hash(i * 3 + 2) * 360, d: 0.6 + hash(i + 40) };
  });
  const scrib = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  scrib.setAttribute('viewBox', '0 0 1080 1920');
  scrib.setAttribute('class', 'st-scrib');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', SCRIBBLE);
  scrib.append(path);

  const ph = el('div', 'st-photo');
  ph.style.clipPath = tornEdge(7);
  const phIn = el('div', 'in');
  const pic = photo(s);
  phIn.append(pic.box, el('span', 'dots'));
  ph.append(phIn);

  const pre = el('div', 'st-pre mono');
  const preName = el('div', 'user', `@${shown}`);
  pre.append(preName, el('b', '', `KIRIM ${s.gift.toUpperCase()} ×${s.count}`));
  // Keterangan pengirim di kiri bawah adegan SUL/TAN, berseberangan dengan foto di kanan bawah.
  const who = el('div', 'st-who mono');
  const whoName = el('div', 'user', `@${shown}`);
  who.append(whoName, el('b', '', `KIRIM ${s.gift.toUpperCase()} ×${s.count}`));

  // Setiap kata raksasa punya kembaran garis (gema) yang tertinggal sedikit di belakangnya.
  const word = (cls, text) => ({ m: el('div', cls, text), e: el('div', `${cls} echo`, text) });
  const s1a = word('st-line st-s1 a', 'SUL');
  const s1b = word('st-line st-s1 b', 'TAN');
  const s2 = nameChunks(s.name).map((c, i) => {
    const w = word('st-line st-s2', c);
    w.i = i;
    return w;
  });
  const cap = el('div', 'st-cap mono');
  cap.append(el('b', '', 'SULTAN MASUK'), el('span', '', `KIRIM ${s.gift.toUpperCase()} ×${s.count}`));
  const s3 = word('st-big st-s3', `×${xm(s.mult)}`);
  const s3strip = el('div', 'st-strip st-s3s mono');
  const s3q = el('b');
  s3strip.append(el('span', '', 'BOOST POIN'), s3q);
  // Gift terbesar: pengirimnya memilih topik ronde berikutnya lewat komentar.
  const s3pick = el('div', 'st-strip st-s3p mono');
  s3pick.append(el('span', '', 'KETIK DI KOMENTAR'), el('b', '', 'KAMU PILIH TOPIKNYA'));
  // Adegan penutup: ucapan makasih untuk sultannya, bukan janji keuntungan.
  const s4 = word('st-big st-s4', 'MAKASIH');
  const s4strip = el('div', 'st-strip st-s4s mono');
  s4strip.append(el('span', '', 'BUAT SULTAN KITA'), el('b', 'user', shown));
  const s4like = el('div', 'st-strip st-s4l mono');
  const likeN = el('b');
  s4like.append(el('span', '', 'SAMBUTAN PENONTON'), likeN);

  const bars = el('div', 'st-bars');
  const barEls = Array.from({ length: 7 }, () => bars.appendChild(el('i')));
  const top = el('div', 'st-top mono');
  const topR = el('b');
  top.append(el('span', '', s.frozen ? 'WAKTU KUIS BERHENTI' : 'SULTAN MASUK'), topR);

  // Tumpukan per adegan (z = 10 x adegan): isi adegan di atas blok warnanya, di bawah sapuan adegan
  // berikutnya. Gema di belakang kata. Foto di depan SUL/TAN supaya wajah tidak tertutup huruf.
  const z = (n, ...els) => els.forEach((e) => { e.style.zIndex = n; });
  z(2, pre, scrib);
  z(11, s1a.e, s1b.e);
  z(12, s1a.m, s1b.m, who);
  z(21, ...s2.map((w) => w.e));
  z(22, ...s2.map((w) => w.m), cap);
  z(29, ph);
  z(31, s3.e);
  z(32, s3.m, s3strip, s3pick);
  z(41, s4.e);
  z(42, s4.m, s4strip, s4like);
  z(50, tri);
  z(55, bars);
  z(60, top);
  root.append(...layers, tri, scrib, s1a.e, s1a.m, s1b.e, s1b.m, who, ph, ...s2.flatMap((w) => [w.e, w.m]), cap,
    s3.e, s3.m, s3strip, ...(s.pick ? [s3pick] : []), s4.e, s4.m, s4strip, s4like, pre, bars, top);
  return { root, layers, tris, path, ph, img: pic.img, pre, preName, who, whoName, s1a, s1b, s2, cap, s3, s3strip, s3q, s3pick: s.pick ? s3pick : null, s4, s4strip, s4like, likeN, bars: barEls, top, topR };
}

// Ukuran kata raksasa disesuaikan setelah masuk DOM: utuh di dalam layar, tidak terpotong tepi.
function fitTakeover(H) {
  fitLine(H.preName, 90, 36);
  fitLine(H.whoName, 76, 30);
  for (const w of [H.s1a, H.s1b]) w.size = fitLine(w.m, 600, 240);
  const n = H.s2.length;
  const size = Math.min(...H.s2.map((w) => fitLine(w.m, n === 1 ? 420 : 380, 120)));
  H.s2.forEach((w) => {
    w.m.style.fontSize = `${size}px`;
    w.m.style.top = `${360 + w.i * size * 0.86}px`;
    w.m.style.textAlign = w.i % 2 ? 'right' : 'left';
  });
  H.cap.style.top = `${400 + n * size * 0.86}px`;
  H.s3.size = fitLine(H.s3.m, 820, 300);
  H.s4.size = fitLine(H.s4.m, 520, 240);
  for (const w of [H.s1a, H.s1b, ...H.s2, H.s3, H.s4]) {
    w.e.style.fontSize = w.m.style.fontSize;
    w.e.style.top = w.m.style.top;
    w.e.style.textAlign = w.m.style.textAlign;
  }
}

export function spotlightLayer(box) {
  let cur = null; // { id, P (kartu), H (takeover), T (jadwal ketukan), fired }
  let lastCount = 0;
  let bumpAt = -1e9;
  let sultans = 0; // lagu sultan bergiliran

  function build(s) {
    const P = giftCard(s);
    const H = s.tier === 'besar' ? sultanTakeover(s) : null;
    const T = H ? timeline(SULTAN_TRACKS[sultans++ % SULTAN_TRACKS.length]) : null;
    const node = el('div', `spot ${s.tier}`);
    node.append(...(H ? [H.root] : []), P.card);
    box.replaceChildren(node);
    fit(P.name, { max: s.tier === 'kecil' ? 76 : s.tier === 'sedang' ? 90 : 96, min: 40, oneLine: true });
    if (H) fitTakeover(H);
    const cues = T ? [[0, T.cue]] : SPOT_CUES[s.tier];
    return { id: s.id, P, H, T, cues, fired: new Set() };
  }

  function tabText(T, s) {
    const key = `${s.mult}:${s.questions}`;
    if (T.key === key) return;
    T.key = key;
    T.num.textContent = `×${xm(s.mult)}`;
    T.sub.replaceChildren('POIN', el('br'), `${s.questions} SOAL`);
  }

  // Tab boost turun dari atas lalu menempel, sedikit memantul; combo membuatnya menghentak.
  function dropTab(T, t, at, bump, fade = 1) {
    const p = clamp((t - at) / 420);
    T.tab.style.opacity = t >= at ? fade : 0;
    T.tab.style.transform = `translateY(${-(1 - back(p)) * 70}px) scale(${1 + 0.14 * bump})`;
  }

  // Kartu slot bawah. t: ms sejak kartu ini muncul, life: lama tampil.
  function animCard(P, s, t, life, bump, extra) {
    const pin = prog(t, 0, 420);
    const pout = clamp((t - (life - 380)) / 380);
    // Masuk: tirai terbuka kiri ke kanan. Keluar: tirai tertutup ke kanan.
    P.card.style.visibility = t >= 0 ? '' : 'hidden';
    P.face.style.clipPath = pout > 0 ? `inset(0 0 0 ${ease(pout) * 100}%)` : `inset(0 ${(1 - pin) * 100}% 0 0)`;
    if (P.img) P.img.style.transform = `scale(${1.14 - 0.14 * prog(t, 0, 1100)})`;
    rise(P.lbl, prog(t, 120, 320), 14);
    rise(P.name, prog(t, 180, 380), 26);
    rise(P.gift, prog(t, 300, 320), 14);
    P.gift.style.transform += ` scale(${1 + 0.12 * bump})`;
    dropTab(P, t, 380, bump, 1 - pout);
    if (P.perk) {
      const pp = prog(t, 620, 300);
      P.perk.style.opacity = pp * (1 - pout);
      P.perk.style.transform = `translateY(${-(1 - pp) * 16}px)`;
    }
    P.life.style.transform = `scaleX(${clamp(1 - t / life)})`;
    P.giftLine.textContent = `KIRIM ${s.gift.toUpperCase()} ×${s.count}${extra ?? ''}`;
  }

  const show = (node, on) => { node.style.visibility = on ? '' : 'hidden'; };
  const slideIn = (t, at, from) => `translateX(${(1 - back(clamp((t - at) / 420))) * from}px)`;
  const WIPE = 320; // sapuan adegan berikutnya, selesai tepat di ketukan

  // Masuk meluncur dari arah (dx, dy) dengan sedikit pantulan dan kemiringan yang luruh,
  // lalu terus hanyut pelan selama adegan. Gema menyusul 80 ms di belakang dan tertinggal.
  function moveWord(w, on, t, at, { dx = 0, dy = 0, rot = 0, skew = 0, drift = 0, base = '' }, beat) {
    show(w.m, on);
    show(w.e, on);
    if (!on) return;
    const p = clamp((t - at) / 460);
    const b = back(p);
    const hold = Math.max(0, t - at) / 1000;
    const move = (k) => `translate(${(1 - k) * dx + hold * drift}px, ${(1 - k) * dy}px) rotate(${(1 - k) * rot}deg) skewX(${(1 - smooth(p)) * skew}deg)`;
    w.m.style.transform = `${move(b)} ${base} scale(${1 + 0.018 * beat})`;
    w.m.style.opacity = Math.min(1, p * 3);
    const pe = clamp((t - at - 80) / 520);
    const lag = 8 + 18 * smooth(pe);
    w.e.style.transform = `translate(${lag}px, ${lag * 0.7}px) ${move(back(pe))} ${base}`;
    w.e.style.opacity = Math.min(1, pe * 3) * 0.9;
  }

  function animSultan(H, T, s, t) {
    const scene = T.scenes.reduce((k, at, i) => (t >= at ? i : k), 0);
    const out = clamp((t - T.hero) / 380);
    show(H.root, out < 1);
    // Ketukan: denyut skala halus (naik cepat, turun pelan), tanpa guncangan.
    const k = Math.floor((t - T.beat0) / T.beat);
    const since = t - (T.beat0 + k * T.beat);
    const beat = t >= T.beat0 ? Math.min(1, since / 40) * Math.exp(-Math.max(0, since - 40) / 220) : 0;
    // Kamera: zoom pelan berkelanjutan sepanjang takeover.
    H.root.style.transform = `scale(${1 + 0.04 * smooth(clamp(t / T.hero))})`;

    // Blok warna adegan menyapu masuk diagonal dari kiri, selesai tepat di ketukan adegan itu.
    H.layers.forEach((l, i) => {
      if (i === 0) { l.style.opacity = prog(t, 0, 260); return; }
      const p = smooth(clamp((t - (T.scenes[i] - WIPE)) / WIPE));
      show(l, p > 0);
      const a = p * 130;
      l.style.clipPath = `polygon(0 0, ${a}% 0, ${a - 30}% 100%, 0 100%)`;
    });
    // Keluar: celah horizontal menutup ke tengah.
    const eo = smooth(out);
    H.root.style.clipPath = out > 0 ? `inset(${eo * 50}% 0 ${eo * 50}% 0)` : '';

    const left = Math.max(0, (s.ms ?? s.dur) - t);
    H.topR.textContent = s.frozen ? secs(left) : '';
    rise(H.top, prog(t, 120, 300), 10);

    // Pembuka: nama + coretan yang tergambar, menunggu ketukan pertama.
    show(H.pre, t < T.s1 + 100);
    rise(H.pre, prog(t, 120, 420), 30);
    const draw = prog(t, 80, T.s1 + 900);
    H.path.style.strokeDasharray = '6000';
    H.path.style.strokeDashoffset = `${6000 * (1 - draw)}`;
    H.path.parentNode.style.visibility = t < T.s2 ? '' : 'hidden';
    H.tris.forEach(({ t: tr, r, d }, i) => {
      const f = t / 1000;
      tr.style.opacity = prog(t, 200 + i * 70, 300);
      tr.style.transform = `translate(${Math.sin(f * 0.9 + i) * 18}px, ${-f * 40 * d}px) rotate(${r + f * 45 * d}deg)`;
      tr.style.borderTopColor = scene === 1 || scene === 4 ? 'var(--ink)' : i % 3 ? 'var(--signal)' : '#e2508f';
    });

    // Adegan 1: SUL meluncur dari kiri, TAN dari kanan, lalu hanyut berlawanan arah.
    const vis = (i) => t >= T.scenes[i] - 80 && (i === 4 || t < T.scenes[i + 1] + 40);
    moveWord(H.s1a, vis(1), t, T.s1, { dx: -760, skew: -24, drift: -22, base: 'skewY(-7deg)' }, beat);
    moveWord(H.s1b, vis(1) && t >= T.tan, t, T.tan, { dx: 760, skew: 24, drift: 22, base: 'skewY(-7deg)' }, beat);

    show(H.who, vis(1) && t >= T.photo + 120);
    H.who.style.transform = slideIn(t, T.photo + 120, -700);

    // Foto: muncul dari bawah di kanan bawah, di bawah TAN (tidak bertumpuk), bergoyang pelan,
    // pindah sedikit di adegan nama, lalu turun keluar sebelum adegan xN.
    const pin = clamp((t - T.photo) / 520);
    const pmove = smooth(clamp((t - (T.s2 - WIPE)) / 600));
    const pout = smooth(clamp((t - (T.s3 - WIPE)) / WIPE));
    show(H.ph, t >= T.photo && pout < 1);
    const f = t / 1000;
    H.ph.style.transform = `translate(${-pmove * 40}px, ${(1 - back(pin)) * 700 + pout * 900 - pmove * 20}px) `
      + `rotate(${6 - 4 * back(pin) + Math.sin(f * 1.6) * 1.6}deg) translateY(${Math.sin(f * 2.1) * 8}px)`;
    if (H.img) H.img.style.transform = `scale(${1.15 - 0.15 * smooth(clamp((t - T.photo) / 3000))})`;

    // Adegan 2: nama, tiap baris meluncur bergantian arah dengan jeda seperempat ketukan.
    H.s2.forEach((w) => {
      const at = T.s2 + w.i * (T.beat / 4);
      const dir = w.i % 2 ? 1 : -1;
      moveWord(w, vis(2) && t >= at - 40, t, at, { dx: dir * 820, skew: dir * 20, drift: dir * 14, base: `skewX(${-dir * 8}deg)` }, beat);
    });
    show(H.cap, vis(2) && t >= T.s2 + T.beat);
    H.cap.style.transform = slideIn(t, T.s2 + T.beat, -700);

    // Adegan 3: xN berputar membesar. Adegan 4: +suara naik dari bawah. Pita-pita meluncur masuk.
    moveWord(H.s3, vis(3), t, T.s3, { dy: 260, rot: -28, drift: 10, base: 'rotate(-4deg)' }, beat);
    H.s3.m.style.transform += ` scale(${0.7 + 0.3 * back(clamp((t - T.s3) / 460))})`;
    show(H.s3strip, vis(3) && t >= T.s3s);
    H.s3strip.style.transform = slideIn(t, T.s3s, -1100);
    H.s3q.textContent = `×${xm(s.mult)} · ${s.questions} SOAL`;
    if (H.s3pick) {
      show(H.s3pick, vis(3) && t >= T.s3s + T.beat);
      H.s3pick.style.transform = slideIn(t, T.s3s + T.beat, 1100);
    }
    moveWord(H.s4, vis(4), t, T.s4, { dy: 700, rot: 8, drift: -10, base: 'rotate(3deg)' }, beat);
    show(H.s4strip, vis(4) && t >= T.s4s);
    H.s4strip.style.transform = slideIn(t, T.s4s, 1100);
    show(H.s4like, vis(4) && t >= T.s4l);
    H.s4like.style.transform = slideIn(t, T.s4l, -1100);
    H.likeN.textContent = `${(s.likes ?? 0).toLocaleString('id-ID')} LIKE`;

    // Glitch hanya sekilas saat keluar.
    const cut = t >= T.hero && t < T.hero + 140;
    H.bars.forEach((b, i) => {
      if (!cut) { b.style.opacity = 0; return; }
      const seed = i * 5 + 3;
      b.style.opacity = 1;
      b.style.top = `${hash(seed) * 1880}px`;
      b.style.height = `${8 + hash(seed + 1) * 60}px`;
      b.style.transform = `translateX(${(hash(seed + 2) - 0.5) * 260}px)`;
      b.style.background = i % 3 === 0 ? 'var(--paper)' : i % 3 === 1 ? 'var(--signal)' : '#e2508f';
    });
  }

  return {
    // play(nama, waktuMs): dipanggil saat isyarat bunyi sorotan lewat.
    // latency: jeda output audio (ms); gambar takeover sultan ditunda sebesar ini supaya pas di beat.
    update(v, now, play = () => {}, latency = 0) {
      const s = v.spotlight;
      if (!s) {
        if (cur) { box.replaceChildren(); cur = null; }
        return;
      }
      if (!cur || cur.id !== s.id) {
        cur = build(s);
        lastCount = s.count;
      }
      const t = s.age;
      for (const [i, [at, name]] of cur.cues.entries()) {
        if (!cur.fired.has(i) && t >= at) {
          cur.fired.add(i);
          play(name, now - t + at);
        }
      }
      if (s.count !== lastCount) {
        lastCount = s.count;
        bumpAt = now;
        play('gift', now);
      }
      const bump = Math.max(0, 1 - (now - bumpAt) / 300);
      const { P, H, T } = cur;
      tabText(P, s);
      if (H) {
        animSultan(H, T, s, Math.max(0, t - latency));
        // Setelah takeover selesai, sisa waktunya jadi kartu di slot bawah.
        const left = Math.max(0, (s.ms ?? s.dur) - t);
        P.lbl.textContent = s.frozen && left > 0 ? `SULTAN · WAKTU BERHENTI ${secs(left)}` : 'SULTAN';
        animCard(P, s, t - T.hero - 150, s.dur - T.hero - 150, bump, ` · ${(s.likes ?? 0).toLocaleString('id-ID')} LIKE`);
      } else {
        P.lbl.textContent = s.count > 1 ? 'COMBO GIFT' : 'GIFT MASUK';
        animCard(P, s, t, s.dur, bump);
      }
    },
  };
}

// ---------------------------------------------------------------- ganti tema tiap kelipatan like
// Tiga balok diagonal menyapu menutup layar, angka tap tap dibanting di tengah, tema berganti saat
// layar tertutup penuh, lalu balok lepas ke kanan membuka tampilan baru.
const LOOK = { shut: 420, swap: 900, open: 2300, end: 2900 };
const LOOK_CUES = [[0, 'whoosh'], [LOOK.shut, 'impact'], [LOOK.shut + 260, 'powerup'], [LOOK.swap, 'sparkle'], [LOOK.open, 'whoosh']];

export function lookLayer(box) {
  const root = el('div', 'lk');
  const bands = ['b3', 'b2', 'b1'].map((c) => el('span', `lk-band ${c}`));
  const mid = el('div', 'lk-mid');
  const echo = el('b', 'lk-num echo');
  const num = el('b', 'lk-num');
  const tap = el('div', 'lk-tap', 'TAP TAP!');
  const strip = el('div', 'lk-strip mono');
  const from = el('span', 'lk-from');
  const to = el('b', 'lk-to');
  strip.append(el('span', '', 'GANTI TEMA'), from, el('span', 'lk-arrow', '→'), to);
  mid.append(echo, num, tap, strip);
  root.append(...bands, mid);
  box.append(root);
  let key = 0;
  let fired = new Set();
  return {
    // Mengembalikan tema yang sedang terlihat (true = terang): berganti saat layar tertutup penuh.
    update(v, now, play = () => {}) {
      const L = v.look;
      if (!L || L.n === 0) {
        root.style.visibility = 'hidden';
        return false;
      }
      const t = L.age;
      if (L.n !== key) {
        key = L.n;
        fired = new Set();
        num.textContent = L.likes.toLocaleString('id-ID');
        echo.textContent = num.textContent;
        from.textContent = L.light ? 'GELAP' : 'TERANG';
        to.textContent = L.light ? 'TERANG' : 'GELAP';
      }
      for (const [i, [at, name]] of LOOK_CUES.entries()) {
        if (!fired.has(i) && t >= at && t < LOOK.end) {
          fired.add(i);
          play(name, now - t + at);
        }
      }
      root.style.visibility = t < LOOK.end ? 'visible' : 'hidden';
      if (t >= LOOK.end) return L.light;
      // Balok: menutup dari kiri bertingkat, lalu membuka ke kanan bertingkat (yang terakhir menutup
      // paling dulu membuka, jadi tepinya berundak).
      bands.forEach((b, i) => {
        const shut = smooth(clamp((t - i * 90) / 360)) * 130;
        const open = smooth(clamp((t - LOOK.open - (2 - i) * 90) / 380)) * 130;
        b.style.clipPath = `polygon(${open}% 0, ${shut}% 0, ${shut - 30}% 100%, ${open - 30}% 100%)`;
      });
      // Angka dibanting membesar-kecil, gemanya tertinggal; teks lain meluncur masuk.
      const on = t >= LOOK.shut - 40 && t < LOOK.open + 260;
      mid.style.visibility = on ? '' : 'hidden';
      if (!on) return t >= LOOK.swap ? L.light : !L.light;
      const out = smooth(clamp((t - LOOK.open) / 260));
      const p = clamp((t - LOOK.shut) / 420);
      const beat = Math.exp(-((t - LOOK.shut) % 458) / 160);
      num.style.transform = `scale(${(1.7 - 0.7 * back(p)) * (1 + 0.025 * beat)}) translateX(${out * 600}px)`;
      const pe = clamp((t - LOOK.shut - 90) / 520);
      echo.style.transform = `translate(${10 + 16 * smooth(pe)}px, ${8 + 12 * smooth(pe)}px) scale(${1.7 - 0.7 * back(pe)}) translateX(${out * 600}px)`;
      echo.style.opacity = Math.min(1, pe * 3) * 0.9;
      tap.style.transform = `translateX(${(1 - back(clamp((t - LOOK.shut - 160) / 420))) * -900 + out * 900}px) skewX(-8deg)`;
      strip.style.transform = `translateX(${(1 - back(clamp((t - LOOK.swap) / 420))) * 1100 - out * 1100}px)`;
      return t >= LOOK.swap ? L.light : !L.light;
    },
  };
}
