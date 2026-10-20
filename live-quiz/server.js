// Server lokal kuis live.
//   node server.js                -> hanya halaman (pakai ?sim=1 untuk penonton palsu)
//   node server.js bayangin.3d    -> plus baca komentar, like, gift, follow dari TikTok LIVE
// Opsi: --port 8787. Kunci Euler Stream (opsional) lewat env EULER_API_KEY.
// Buka http://localhost:8787 di OBS (Browser Source 1080x1920).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const FILES = {
  '/vendor/three.module.min.js': path.join(ROOT, 'node_modules/three/build/three.module.min.js'),
};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8',
};

export function startServer({ port = 8787, username = null, log = console.log } = {}) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = FILES[urlPath] ?? path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath);
    if (!FILES[urlPath] && !file.startsWith(PUBLIC + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end('tidak ditemukan');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server, path: '/events' });
  let lastStatus = { type: 'status', text: username ? 'menghubungkan ke TikTok' : 'tanpa TikTok' };
  const broadcast = (msg) => {
    const s = JSON.stringify(msg);
    for (const c of wss.clients) if (c.readyState === 1) c.send(s);
  };
  const status = (text) => {
    lastStatus = { type: 'status', text };
    log(`[status] ${text}`);
    broadcast(lastStatus);
  };
  wss.on('connection', (ws) => ws.send(JSON.stringify(lastStatus)));

  if (username) connectTikTok(username, broadcast, status, log);

  return new Promise((ok) => server.listen(port, () => {
    const actual = server.address().port;
    log(`Kuis live: http://localhost:${actual}${username ? '' : '  (simulasi: tambahkan ?sim=1)'}`);
    ok({ port: actual, close: () => new Promise((done) => { wss.close(); server.close(done); }) });
  }));
}

// URL foto profil: utamakan ukuran 100x100, abaikan selain http(s).
function pickAvatar(u) {
  const list = u?.avatarThumb?.urlList ?? u?.avatarThumb?.url ?? u?.avatarLarge?.urlList ?? u?.profilePicture?.url
    ?? (u?.profilePictureUrl ? [u.profilePictureUrl] : []);
  const urls = (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && /^https?:\/\//.test(x));
  return urls.find((x) => x.includes('100x100') && !x.includes('.heic')) ?? urls.find((x) => !x.includes('.heic')) ?? null;
}

// Jumlah like dalam satu event: v3 `count`, versi lama `likeCount`.
export function likeEvent(d) {
  return { type: 'like', ...who(d), count: Number(d?.count ?? d?.likeCount) || 1 };
}

// Teks komentar: protokol v3 memakai `content`, versi lama `comment`.
export function chatEvent(d) {
  return { type: 'comment', ...who(d), text: String(d?.content || d?.comment || '') };
}

// Gift: protokol v3 menaruh datanya di `gift` (name, diamondCount, type, image, icon),
// versi lama di `giftDetails` (giftName, diamondCount, giftType, giftImage).
// Gift beruntun (type 1) baru dihitung saat beruntunnya selesai; kembalikan null sebelum itu.
export function giftEvent(d) {
  const g = d?.gift ?? d?.giftDetails ?? {};
  if (Number(g.type ?? g.giftType) === 1 && !d.repeatEnd) return null;
  const count = Number(d.repeatCount) || 1;
  // Nilai koin hanya untuk menentukan tingkat boost, tidak pernah ditampilkan.
  const each = Number(g.diamondCount) || 1;
  const img = [g.image, g.giftImage, g.icon].flatMap((i) => i?.urlList ?? i?.url ?? [])
    .find((x) => typeof x === 'string' && /^https?:\/\//.test(x)) ?? d.giftPictureUrl ?? null;
  return { type: 'gift', ...who(d), gift: g.name || g.giftName || 'hadiah', count, coins: each * count, giftImage: img };
}

export function who(data) {
  const u = data?.user ?? data ?? {};
  const user = String(u.uniqueId || u.displayId || u.userId || u.idStr || '');
  return { user, name: u.nickname || user || 'seseorang', avatar: pickAvatar(u) };
}

async function connectTikTok(username, broadcast, status, log) {
  const { TikTokLiveConnection, WebcastEvent, ControlEvent, UserOfflineError } = await import('tiktok-live-connector');
  // enableExtendedGiftInfo sengaja mati: daftar gift lengkap butuh paket berbayar Euler Stream,
  // dan nama, nilai koin, serta gambar gift sudah ada di setiap event gift.
  const conn = new TikTokLiveConnection(username, {
    signApiKey: process.env.EULER_API_KEY || undefined,
  });
  let retry = null;
  let delay = 15000;

  // Setiap komentar dan gift dicatat di terminal, supaya kelihatan apa yang benar-benar masuk.
  conn.on(WebcastEvent.CHAT, (d) => {
    const msg = chatEvent(d);
    log(`[komentar] @${msg.user || '?'}: ${msg.text.slice(0, 80)}`);
    broadcast(msg);
  });
  conn.on(WebcastEvent.LIKE, (d) => broadcast(likeEvent(d)));
  conn.on(WebcastEvent.GIFT, (d) => {
    const msg = giftEvent(d);
    if (!msg) return;
    log(`[gift] @${msg.user || '?'}: ${msg.gift} x${msg.count}`);
    broadcast(msg);
  });
  conn.on(WebcastEvent.FOLLOW, (d) => broadcast({ type: 'follow', ...who(d) }));
  conn.on(WebcastEvent.SHARE, (d) => broadcast({ type: 'share', ...who(d) }));
  conn.on(WebcastEvent.STREAM_END, () => status('live berakhir'));
  conn.on(ControlEvent.DISCONNECTED, () => schedule('terputus'));
  conn.on(ControlEvent.ERROR, (e) => console.error('[tiktok]', e?.info || e?.message || e));

  function schedule(reason) {
    if (retry) return;
    status(`${reason}, coba lagi dalam ${Math.round(delay / 1000)} dtk`);
    retry = setTimeout(() => {
      retry = null;
      tryConnect();
    }, delay);
    delay = Math.min(60000, delay * 1.5);
  }

  async function tryConnect() {
    try {
      const state = await conn.connect();
      delay = 15000;
      status(`tersambung ke @${username} (room ${state.roomId})`);
    } catch (e) {
      const offline = e instanceof UserOfflineError || /offline/i.test(String(e?.message));
      if (offline) delay = 30000;
      schedule(offline ? `@${username} belum live` : `gagal tersambung (${e?.message || e})`);
    }
  }
  tryConnect();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--port');
  const port = i >= 0 ? Number(args[i + 1]) : 8787;
  const username = args.find((a, k) => !a.startsWith('--') && args[k - 1] !== '--port')?.replace(/^@/, '') || null;
  startServer({ port, username });
}
