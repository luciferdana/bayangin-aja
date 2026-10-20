// Peta 2D line-art (garis pantai + grid) dari public/data/map.json, dengan penanda bidik.

let dataPromise = null;
export function loadMap() {
  dataPromise ??= fetch('data/map.json').then((r) => r.json()).catch(() => null);
  return dataPromise;
}

const SIGNAL = '#ff5b23';
const INK = '#050608';

export class MapView {
  constructor(canvas, data, regionName) {
    this.canvas = canvas;
    const region = data?.[regionName];
    if (!region) return;
    const [x0, y0, x1, y1] = region.bbox;
    const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    const { width: w, height: h } = canvas;
    const s = Math.min(w / ((x1 - x0) * k), h / (y1 - y0));
    const ox = (w - (x1 - x0) * k * s) / 2;
    const oy = (h - (y1 - y0) * s) / 2;
    this.project = (lon, lat) => [ox + (lon - x0) * k * s, oy + (y1 - lat) * s];

    // Garis pantai dan grid digambar sekali ke kanvas cadangan.
    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;
    const g = this.base.getContext('2d');
    const step = regionName === 'world' ? 30 : 5;
    g.strokeStyle = 'rgba(242,239,232,0.08)';
    g.lineWidth = 2;
    for (let lon = Math.ceil(x0 / step) * step; lon <= x1; lon += step) {
      const [x] = this.project(lon, 0);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let lat = Math.ceil(y0 / step) * step; lat <= y1; lat += step) {
      const [, y] = this.project(x0, lat);
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    g.strokeStyle = 'rgba(242,239,232,0.62)';
    g.fillStyle = 'rgba(242,239,232,0.05)';
    g.lineWidth = regionName === 'world' ? 1.6 : 2.4;
    g.lineJoin = 'round';
    for (const ring of region.rings) {
      g.beginPath();
      ring.forEach(([lon, lat], i) => {
        const [x, y] = this.project(lon, lat);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  // p: 0..1 kemunculan penanda; t: waktu (ms) untuk denyut.
  // overlay=true: hanya gambar penanda di atas isi kanvas yang sudah ada (dipakai ShapeView).
  draw(marker, p, t, overlay = false) {
    if (!this.base) return;
    const c = this.canvas.getContext('2d');
    if (!overlay) {
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.drawImage(this.base, 0, 0);
    }
    if (!marker || p <= 0) return;
    const [mx, my] = this.project(marker.lon, marker.lat);
    const r = 30 + (1 - p) * 120;
    c.globalAlpha = p;
    c.strokeStyle = SIGNAL;
    c.lineWidth = 4;
    c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2); c.stroke();
    const pulse = (t / 1600) % 1;
    c.globalAlpha = p * (1 - pulse) * 0.5;
    c.beginPath(); c.arc(mx, my, 34 + pulse * 60, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = p;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.beginPath(); c.moveTo(mx + dx * 40, my + dy * 40); c.lineTo(mx + dx * 84, my + dy * 84); c.stroke();
    }
    c.fillStyle = SIGNAL;
    c.beginPath(); c.arc(mx, my, 8, 0, Math.PI * 2); c.fill();

    c.font = '700 34px "JetBrains Mono", monospace';
    c.textBaseline = 'middle';
    const label = marker.label.toUpperCase();
    const w = c.measureText(label).width + 36;
    const right = mx + 100 + w < this.canvas.width - 10;
    const lx = right ? mx + 100 : mx - 100 - w;
    const ly = Math.max(10, my - 120);
    c.fillRect(lx, ly, w, 58);
    c.fillStyle = INK;
    c.fillText(label, lx + 18, ly + 30);
    c.strokeStyle = SIGNAL;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(mx + (right ? 44 : -44), my - 44);
    c.lineTo(right ? lx : lx + w, ly + 29);
    c.stroke();
    c.globalAlpha = 1;
  }
}

// 8°33' LS · 119°29' BT
export function formatCoord(lat, lon) {
  const f = (v) => `${Math.floor(Math.abs(v))}°${String(Math.round((Math.abs(v) % 1) * 60)).padStart(2, '0')}'`;
  return `${f(lat)} ${lat < 0 ? 'LS' : 'LU'} · ${f(lon)} ${lon < 0 ? 'BB' : 'BT'}`;
}

let geoPromise = null;
export function loadGeo() {
  geoPromise ??= fetch('data/geo.json').then((r) => r.json()).catch(() => null);
  return geoPromise;
}

// Peta soal tebak negara / provinsi: wilayah jawaban diwarnai, tetangganya hanya garis.
export class ShapeView {
  constructor(canvas, geo, shape) {
    this.canvas = canvas;
    const isProv = shape.kind === 'provinsi';
    const target = geo?.[isProv ? 'provinces' : 'countries']?.[shape.name];
    if (!target) return;
    this.target = target;
    const { width: w, height: h } = canvas;

    // Kotak pandang: wilayah plus ruang untuk tetangga, disesuaikan rasio kanvas.
    let [x0, y0, x1, y1] = target.view;
    const minSpan = isProv ? 4 : 10;
    const padX = Math.max((x1 - x0) * 0.6, minSpan / 2);
    const padY = Math.max((y1 - y0) * 0.6, minSpan / 3);
    x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
    const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    const s = Math.min(w / ((x1 - x0) * k), h / (y1 - y0));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    this.project = (lon, lat) => [w / 2 + (lon - cx) * k * s, h / 2 - (lat - cy) * s];
    const inView = (ring) => ring.some(([lon, lat]) => {
      const [x, y] = this.project(lon, lat);
      return x > -w && x < 2 * w && y > -h && y < 2 * h;
    });

    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;
    const g = this.base.getContext('2d');
    g.lineJoin = 'round';
    const path = (ring) => {
      g.beginPath();
      ring.forEach(([lon, lat], i) => {
        const [x, y] = this.project(lon, lat);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
    };
    const step = isProv ? 2 : 10;
    g.strokeStyle = 'rgba(242,239,232,0.08)';
    g.lineWidth = 2;
    for (let lon = Math.ceil(x0 / step) * step; lon <= x1; lon += step) {
      const [x] = this.project(lon, cy);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let lat = Math.ceil(y0 / step) * step; lat <= y1; lat += step) {
      const [, y] = this.project(cx, lat);
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    g.fillStyle = 'rgba(242,239,232,0.06)';
    g.strokeStyle = 'rgba(242,239,232,0.45)';
    g.lineWidth = 2;
    for (const r of geo.background) if (inView(r)) { path(r); g.fill(); g.stroke(); }
    if (isProv) {
      g.strokeStyle = 'rgba(242,239,232,0.3)';
      g.lineWidth = 1.5;
      for (const p of Object.values(geo.provinces)) for (const r of p.rings) if (inView(r)) { path(r); g.stroke(); }
    }
    g.fillStyle = 'rgba(255,91,35,0.42)';
    g.strokeStyle = SIGNAL;
    g.lineWidth = 4;
    for (const r of target.rings) { path(r); g.fill(); g.stroke(); }
  }

  // label: tampilkan nama (saat jawaban dibuka) dengan kemunculan p.
  draw(label, p, t) {
    if (!this.base) return;
    const c = this.canvas.getContext('2d');
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.base, 0, 0);
    if (!label || p <= 0) return;
    const [lon, lat] = this.target.center;
    MapView.prototype.draw.call(this, { lon, lat, label }, p, t, true);
  }
}
