// Scene per fase. Setiap scene: build(view) membuat DOM, update(view) menggerakkannya.
// Semua animasi dihitung dari view.elapsed (bukan CSS transition), supaya hasil live dan
// render frame-per-frame sama persis. Pergantian fase memakai cut keras.
import { MapView, formatCoord } from './map.js';

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
  mark.append(el('small', '', `KUIS LANGSUNG · RONDE ${pad(v.round)}`));
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
    ['Ketik ', ['jawabannya'], ' di komentar, persis seperti pilihan di layar.'],
    ['Maksimal ', [`${r.maxTries} tebakan`], ' per soal. Typo kecil tetap dihitung.'],
    ['Benar dapat ', [`${r.points.mudah} / ${r.points.sedang} / ${r.points.sulit} poin`], ` sesuai tingkat, plus bonus cepat sampai +${Math.round(r.speedBonus * 100)}%.`],
    ['Benar ', [`${r.streakFrom} kali beruntun`], `: +${r.streakBonus} poin tiap soal berikutnya.`],
    [[`${r.hintLikes} like`], ' membuka bantuan: dua pilihan salah dicoret.'],
  ];
  const title = el('div', 'ui btitle');
  title.append('CARA ', el('em', '', 'MAIN'));
  const sub = el('div', 'ui bsub mono', `RONDE ${pad(v.round)} · ${v.qTotal || 10} SOAL · ${r.answerSec} DETIK PER SOAL`);
  const list = el('ol', 'ui steps');
  const items = steps.map((s, i) => {
    const li = el('li');
    li.append(el('span', 'no', pad(i + 1)), rich('span', 'tx', s));
    list.append(li);
    return li;
  });
  const next = el('div', 'ui next mono');
  next.style.top = '1290px';
  const nb = el('b');
  next.append(el('span', '', 'SOAL PERTAMA DALAM'), nb);
  root.append(head(v, null, { right: 'ronde' }), title, sub, list, next);
  return {
    node: root,
    cues: [{ at: 0, name: 'title' }, ...items.map((_, i) => ({ at: 500 + i * 260, name: 'row' }))],
    update(v) {
      const t = v.elapsed;
      rise(title, prog(t, 0, 500));
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
function answer(v) {
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
  const question = el('div', 'ui question');
  const words = q.q.split(' ').map((w) => {
    const s = el('span', 'w', w);
    question.append(s, ' ');
    return s;
  });

  const two = q.options.length === 2;
  const list = el('ol', `ui options${two ? ' two' : ''}`);
  const rows = q.options.map((o) => {
    const li = el('li', 'opt');
    li.append(el('span', 'mk'), el('span', 't', o));
    list.append(li);
    return li;
  });

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
  assist.append(el('span', '', 'BANTUAN 50:50'), seg, alabel);
  if (two) assist.style.display = 'none';

  root.append(head(v), ruler, cat, question, list, foot, assist);
  let stackKey = '';
  let lastSec = null;
  const self = {
    node: root,
    cues: [],
    mount() {
      fit(question, { max: 84, min: 44, height: 340 });
      for (const r of rows) fit(r.querySelector('.t'), { max: two ? 64 : 50, min: 28, oneLine: true });
    },
    update(v, sound) {
      const t = v.elapsed;
      rise(ruler, prog(t, 0, 300), 10);
      rise(cat, prog(t, 80, 400));
      words.forEach((w, i) => rise(w, prog(t, 120 + i * 35, 420), 22));
      rows.forEach((r, i) => slide(r, prog(t, 350 + i * 110, 450), 40));
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
      const got = Math.min(v.likes, v.hintLikes);
      const on = Math.floor((got / v.hintLikes) * 10);
      segs.forEach((s, i) => s.classList.toggle('on', i < on));
      const done = v.removed.length > 0;
      assist.classList.toggle('done', done);
      alabel.textContent = done ? 'DUA PILIHAN DICORET' : `${got}/${v.hintLikes} LIKE`;
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
  if (q.map && ctx.mapData) {
    mapBox = el('div', 'ui mapbox');
    const cv = el('canvas');
    cv.width = 1904;
    cv.height = 576;
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
      fit(qs, { max: 36, min: 26, height: 90 });
      fit(fakta.querySelector('p'), mapBox ? { max: 40, min: 30, height: 140 } : { max: 54, min: 36, height: 330 });
      for (const r of rows) fit(r.t, { max: two ? 48 : 36, min: 24, oneLine: true });
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
        map.draw(q.map, prog(t, 1000, 700), t);
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
    const max = 14;
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
function leaderboard(v, { titleParts, subText, entries, dense, nextLabel }) {
  const root = el('div');
  const title = el('div', 'ui btitle');
  title.append(titleParts[0], el('em', '', titleParts[1]));
  const sub = el('div', 'ui bsub mono', subText);
  const parts = [head(v, null, { right: v.phase === 'board' ? 'soal' : 'ronde' }), title, sub];
  let rows = [];
  if (entries.length) {
    const list = el('ol', `ui board${dense ? ' dense' : ''}`);
    rows = entries.map((e, i) => {
      const li = el('li');
      const s = el('span', 's', '0');
      li.append(el('span', 'r', pad(i + 1)), avatar(e, dense ? 52 : 72), el('span', 'n', e.name), el('span', 'c', `${e.correct} BENAR`), s);
      list.append(li);
      return { li, s, score: e.score };
    });
    parts.push(list);
  } else {
    parts.push(el('div', 'ui empty', 'Belum ada skor. Ketik jawabanmu di soal berikutnya.'));
  }
  const next = el('div', 'ui next mono');
  const nb = el('b');
  next.append(el('span', '', nextLabel), nb);
  parts.push(next);
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
      nb.textContent = secs(v.remaining);
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
    nextLabel: `RONDE ${pad(v.round + 1)} MULAI DALAM`,
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
    if (s.rank === 1) top.append(el('span', 'crown', 'JUARA'));
    top.append(avatar(e, s.size), el('div', 'n', e.name), el('div', 's', `${e.score.toLocaleString('id-ID')} POIN · ${e.correct} BENAR`));
    const ped = el('div', 'ped');
    ped.style.height = `${s.ped}px`;
    ped.append(el('span', '', String(s.rank)));
    col.append(top, ped);
    stage.append(col);
    return { top, ped, at: s.at };
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
      }
    },
  };
}

export const SCENES = { rules, intro, answer, reveal, winners, board, podium, standings };
