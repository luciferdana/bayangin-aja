// Scene per fase. Setiap scene: build(view) membuat DOM, update(view) menggerakkannya.
// Semua animasi dihitung dari view.elapsed (bukan CSS transition), supaya hasil live dan
// render frame-per-frame sama persis. Pergantian fase memakai cut keras.
import { MapView, ShapeView, formatCoord } from './map.js';
import { topicStyle } from './topics.js';

const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - (1 - x) ** 3;
const prog = (ms, start, dur) => ease(clamp((ms - start) / dur));
const pad = (n) => String(n).padStart(2, '0');
const secs = (ms) => `00:${pad(Math.max(0, Math.ceil(ms / 1000)))}`;
const fmtSec = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} DTK`;
const DIFF_LABEL = { mudah: 'MUDAH', sedang: 'SEDANG', sulit: 'SULIT' };

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

  root.append(head(v), ruler, cat, question, ...(shapeBox ? [shapeBox] : []), list, foot, assist);
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
    if (w.mult > 1) meta.append(el('span', 'streak', `BOOST x${w.mult}`));
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
      if (e.boost > 1) c.prepend(el('span', 'boost', `x${e.boost}`), ' ');
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
  root.append(...parts);
  const stagger = dense ? 110 : 160;
  return {
    node: root,
    cues: [{ at: 0, name: 'title' }, ...rows.map((_, i) => ({ at: 400 + i * stagger, name: 'row' }))],
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
  const sub = el('div', 'ui bsub mono', `RONDE ${pad(v.round + 1)} · KETIK NAMA TOPIKNYA DI KOMENTAR · TERBANYAK MENANG`);
  // Kartu topik seperti kartu remi di tangan: muka kertas, ikon topik di tengah, indeks di
  // pojok (A K Q J). Kartu yang memimpin terangkat dari kipas.
  const RANK = ['A', 'K', 'Q', 'J'];
  const FAN = [{ r: -5, y: 22 }, { r: -1.7, y: 6 }, { r: 1.7, y: 6 }, { r: 5, y: 22 }];
  const list = el('div', 'ui vhand');
  const tally = el('div', 'ui vtally');
  const rows = v.vote.options.map((o, i) => {
    const st = topicStyle(o.id);
    const card = el('div', 'pcard');
    card.style.setProperty('--tc', st.color);
    card.style.left = `${i * 243}px`;
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
    col.style.left = `${i * 243}px`;
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
  root.append(head(v, null, { right: 'ronde' }), title, sub, list, tally, next);
  return {
    node: root,
    cues: [{ at: 0, name: 'title' }, ...rows.map((_, i) => ({ at: 400 + i * 150, name: 'row' }))],
    update(v) {
      const t = v.elapsed;
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

export const SCENES = { rules, intro, answer, reveal, winners, board, podium, standings, vote };

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
        if (e.boost > 1) top.append(el('span', 'boost', `x${e.boost}`));
        c.append(top, el('span', 'c5n user', e.name), el('span', 'c5s', e.score.toLocaleString('id-ID')));
        return c;
      }));
    },
  };
}

export function lowerZone(box) {
  const wrap = el('div', 'lower');
  const live = chipSection('live', 56);
  const round = chipSection('round', 44);
  wrap.append(live.sec, round.sec);
  box.append(wrap);
  let toastKey = '';
  return {
    update(v) {
      const show = LOWER_PHASES.has(v.phase) && !v.spotlight && v.standings.length > 0;
      wrap.style.opacity = show ? 1 : 0;
      if (!show) return;
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
// Semua tingkat muncul di slot bawah (tempat klasemen mini), tidak pernah menutupi soal.
// kecil/sedang: kartu meluncur dari kanan. besar: pita lebar + bingkai layar menyala,
// timer kuis berhenti. Nilai koin tidak pernah ditampilkan; yang tampil foto, nama, gift, boost.
const back = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const backIn = (ms, start, dur) => back(clamp((ms - start) / dur));

// Bunyi per tingkat: [ms sejak sorotan mulai, nama SFX]. Waktunya sama dengan animasinya.
const SPOT_CUES = {
  kecil: [[0, 'whoosh'], [260, 'gift'], [520, 'powerup']],
  sedang: [[0, 'whoosh'], [260, 'gift'], [520, 'powerup'], [700, 'sparkle']],
  besar: [[0, 'impact'], [120, 'whoosh'], [450, 'title'], [900, 'powerup'], [1050, 'sparkle']],
};

function burstBits(parent, n, dist) {
  const burst = parent.appendChild(el('div', 'burst'));
  return Array.from({ length: n }, (_, i) => {
    const b = burst.appendChild(el('i'));
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.21;
    return { b, dx: Math.cos(a), dy: Math.sin(a), d: dist[0] + (i % 5) * ((dist[1] - dist[0]) / 4) };
  });
}

function fly(bits, p) {
  const e = ease(p);
  for (const { b, dx, dy, d } of bits) {
    b.style.transform = `translate(${dx * d * e}px, ${dy * d * e + 60 * p * p}px) rotate(${e * 240}deg) scale(${1 - 0.6 * p})`;
    b.style.opacity = p > 0 && p < 1 ? 1 - p * p : 0;
  }
}

export function spotlightLayer(box) {
  let cur = null; // { id, node, parts, fired }
  let lastCount = 0;
  let bumpAt = -1e9;

  function build(s) {
    const node = el('div', `spot ${s.tier}`);
    const parts = {};
    const big = s.tier === 'besar';
    if (big) {
      const edge = el('div', 'spot-edge');
      const band = el('div', 'spot-band');
      const stripes = el('div', 'spot-stripes');
      const flash = el('div', 'spot-flash');
      const ringBox = el('div', 'spot-rings');
      const rings = [0, 1, 2].map(() => ringBox.appendChild(el('span', 'ring')));
      const av = avatar(s, 200);
      ringBox.append(av);
      const bits = burstBits(ringBox, 28, [150, 300]);
      const who = el('div', 'spot-who');
      const tag = el('div', 'spot-tagrow');
      const label = el('span', 'spot-label mono', 'SULTAN MASUK');
      const note = el('span', 'spot-note mono', s.frozen ? 'WAKTU BERHENTI' : '');
      tag.append(label, note);
      const name = el('div', 'spot-name user', s.name);
      const gift = el('div', 'spot-gift mono');
      const giftLine = el('span');
      if (s.giftImg) gift.append(giftImage(s.giftImg, 52));
      gift.append(giftLine);
      who.append(tag, name, gift);
      const boost = el('div', 'spot-boost');
      const boostBits = burstBits(boost, 16, [90, 190]);
      const life = el('div', 'spot-life');
      band.append(stripes, ringBox, who, boost, flash, life);
      node.append(edge, band);
      Object.assign(parts, { edge, band, stripes, flash, rings, av, bits, label, note, name, gift, giftLine, boost, boostBits, life });
    } else {
      const card = el('div', 'spot-card');
      const stripes = el('div', 'spot-stripes');
      const flash = el('div', 'spot-flash');
      const shine = el('div', 'spot-shine');
      const avBox = el('div', 'spot-avbox');
      const ring = el('span', 'spot-ring');
      const av = avatar(s, s.tier === 'sedang' ? 150 : 116);
      avBox.append(ring, av);
      const who = el('div', 'spot-who');
      const name = el('div', 'spot-name user', s.name);
      const gift = el('div', 'spot-gift mono');
      const giftLine = el('span');
      const img = s.giftImg ? giftImage(s.giftImg, s.tier === 'sedang' ? 48 : 40) : null;
      if (img) gift.append(img);
      gift.append(giftLine);
      who.append(name, gift);
      if (s.hintGiven) who.append(el('div', 'spot-hint mono', s.hintGiven === 'pilihan' ? 'PILIHAN JAWABAN DIBUKA UNTUK SEMUA' : 'DUA PILIHAN SALAH DICORET'));
      const boost = el('div', 'spot-boost');
      const boostBits = burstBits(boost, 14, [70, 150]);
      const life = el('div', 'spot-life');
      card.append(stripes, avBox, who, boost, shine, flash, life);
      node.append(card);
      Object.assign(parts, { card, stripes, flash, shine, ring, av, img, name, gift, giftLine, boost, boostBits, life });
    }
    box.replaceChildren(node);
    return { id: s.id, node, parts, fired: new Set() };
  }

  function boostText(P, s) {
    const key = `${s.mult}:${s.questions}`;
    if (P.boostKey === key) return;
    P.boostKey = key;
    P.boostNum?.remove();
    P.boostSub?.remove();
    P.boostNum = el('b', '', `x${s.mult}`);
    P.boostSub = el('span', 'mono', `POIN · ${s.questions} SOAL`);
    P.boost.prepend(P.boostNum, P.boostSub);
  }

  // Angka boost dihentak masuk: besar lalu mengecil dengan pantulan, sedikit miring.
  function punch(P, t, at) {
    const p = clamp((t - at) / 420);
    P.boostNum.style.opacity = t >= at ? 1 : 0;
    P.boostNum.style.transform = `scale(${t >= at ? 2.6 - 1.6 * back(p) : 2.6}) rotate(${-14 * (1 - ease(p))}deg)`;
    rise(P.boostSub, prog(t, at + 200, 300), 10);
    fly(P.boostBits, clamp((t - at) / 700));
  }

  return {
    // play(nama, waktuMs): dipanggil saat isyarat bunyi sorotan lewat.
    update(v, now, play = () => {}) {
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
      for (const [i, [at, name]] of SPOT_CUES[s.tier].entries()) {
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
      const P = cur.parts;
      const out = clamp((s.dur - t) / 450);
      const gone = 1 - out;
      P.giftLine.textContent = `KIRIM ${s.gift.toUpperCase()}${s.count > 1 ? ` x${s.count}` : ''}`;
      const bp = Math.max(0, 1 - (now - bumpAt) / 300);
      P.gift.style.transform = `scale(${1 + 0.18 * bp})`;
      boostText(P, s);
      P.stripes.style.backgroundPosition = `${(t * 0.06) % 56}px 0`;
      P.life.style.transform = `scaleX(${clamp(1 - t / s.dur)})`;

      if (s.tier === 'besar') {
        // Bingkai layar menyala berdenyut; pita terbuka dari tengah dengan guncangan kecil.
        const pulse = 0.55 + 0.45 * Math.cos(t / 160);
        P.edge.style.opacity = Math.min(prog(t, 0, 200), out) * (t < 600 ? 1 : pulse);
        const open = ease(clamp(t / 320));
        const shake = t < 450 ? Math.sin(t / 18) * 14 * (1 - t / 450) : 0;
        P.band.style.opacity = out;
        P.band.style.transform = `translate(${shake}px, ${gone * 80}px) scaleY(${open})`;
        P.flash.style.opacity = t < 500 ? 0.9 * (1 - clamp(t / 500)) : 0;
        const pa = backIn(t, 180, 500);
        P.av.style.transform = `scale(${pa}) rotate(${(1 - clamp((t - 180) / 500)) * -30}deg)`;
        P.av.style.opacity = t >= 180 ? 1 : 0;
        P.rings.forEach((r, i) => {
          const ph = ((t + i * 500) % 1500) / 1500;
          r.style.transform = `scale(${1 + ph * 0.6})`;
          r.style.opacity = (1 - ph) * prog(t, 300, 300);
        });
        fly(P.bits, clamp((t - 250) / 1100));
        P.label.style.transform = `scale(${t >= 450 ? 2 - back(clamp((t - 450) / 380)) : 2})`;
        P.label.style.opacity = t >= 450 ? 1 : 0;
        rise(P.note, prog(t, 1200, 400), 10);
        P.name.style.opacity = prog(t, 550, 350);
        P.name.style.transform = `translateX(${(1 - backIn(t, 550, 500)) * 160}px)`;
        rise(P.gift, prog(t, 750, 400), 20);
        punch(P, t, 900);
      } else {
        // Kartu meluncur dari kanan dengan pantulan, kilat putih saat mendarat, lalu kilau lewat.
        const pin = backIn(t, 0, 520);
        P.card.style.opacity = Math.min(clamp(t / 120), out);
        P.card.style.transform = `translateX(${(1 - pin) * 1000}px) skewX(${(1 - ease(clamp(t / 520))) * -8}deg) translateY(${gone * 60}px)`;
        P.flash.style.opacity = t > 200 && t < 560 ? 0.55 * (1 - (t - 200) / 360) : 0;
        const sh = ((t - 500) % 2200) / 700;
        P.shine.style.transform = `translateX(${t > 500 && sh < 1 ? -200 + sh * 1300 : -400}px) skewX(-20deg)`;
        const pa = backIn(t, 160, 460);
        P.av.style.transform = `scale(${pa})`;
        P.ring.style.transform = `rotate(${t * 0.15}deg) scale(${pa})`;
        P.name.style.opacity = prog(t, 260, 300);
        P.name.style.transform = `translateX(${(1 - prog(t, 260, 360)) * 60}px)`;
        rise(P.gift, prog(t, 360, 300), 14);
        if (P.img) P.img.style.transform = `translateY(${Math.sin(t / 170) * 4}px) rotate(${Math.sin(t / 230) * 8}deg)`;
        punch(P, t, 520);
      }
    },
  };
}
