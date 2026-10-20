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

  if (username) connectTikTok(username, broadcast, status);

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

function who(data) {
  const u = data?.user ?? data ?? {};
  const user = String(u.uniqueId || u.displayId || u.userId || u.idStr || '');
  return { user, name: u.nickname || user || 'seseorang', avatar: pickAvatar(u) };
}

async function connectTikTok(username, broadcast, status) {
  const { TikTokLiveConnection, WebcastEvent, ControlEvent, UserOfflineError } = await import('tiktok-live-connector');
  const conn = new TikTokLiveConnection(username, {
    signApiKey: process.env.EULER_API_KEY || undefined,
    enableExtendedGiftInfo: true,
  });
  let retry = null;
  let delay = 15000;

  conn.on(WebcastEvent.CHAT, (d) => broadcast({ type: 'comment', ...who(d), text: String(d.comment ?? '') }));
  conn.on(WebcastEvent.LIKE, (d) => broadcast({ type: 'like', ...who(d), count: Number(d.likeCount) || 1 }));
  conn.on(WebcastEvent.GIFT, (d) => {
    // Gift beruntun (giftType 1) baru dihitung saat beruntunnya selesai.
    if (d.giftDetails?.giftType === 1 && !d.repeatEnd) return;
    const gift = d.giftDetails?.giftName || d.extendedGiftInfo?.name || 'hadiah';
    const count = Number(d.repeatCount) || 1;
    // Nilai koin hanya untuk menentukan tingkat boost, tidak pernah ditampilkan.
    const each = Number(d.giftDetails?.diamondCount ?? d.extendedGiftInfo?.diamond_count) || 1;
    const img = [d.giftDetails?.giftImage, d.giftDetails?.icon].flatMap((i) => i?.url ?? i?.urlList ?? [])
      .find((x) => typeof x === 'string' && /^https?:\/\//.test(x)) ?? d.giftPictureUrl ?? null;
    broadcast({ type: 'gift', ...who(d), gift, count, coins: each * count, giftImage: img });
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
