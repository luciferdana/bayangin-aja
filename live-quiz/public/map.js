// Peta 2D datar (equirectangular dengan koreksi lintang) dari public/data/map.json.

let dataPromise = null;
export function loadMap() {
  dataPromise ??= fetch('data/map.json').then((r) => r.json()).catch(() => null);
  return dataPromise;
}

export class MapView {
  constructor(canvas, data, regionName) {
    this.canvas = canvas;
    const region = data?.[regionName];
    if (!region) return;
    const [x0, y0, x1, y1] = region.bbox;
    const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    const w = canvas.width;
    const h = canvas.height;
    const s = Math.min(w / ((x1 - x0) * k), h / (y1 - y0));
    const ox = (w - (x1 - x0) * k * s) / 2;
    const oy = (h - (y1 - y0) * s) / 2;
    this.project = (lon, lat) => [ox + (lon - x0) * k * s, oy + (y1 - lat) * s];

    // Daratan digambar sekali ke kanvas cadangan, tiap frame tinggal disalin.
    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;
    const g = this.base.getContext('2d');
    g.fillStyle = getCss('--land');
    g.strokeStyle = getCss('--land-edge');
    g.lineWidth = 1.5;
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

  draw(marker, t) {
    if (!this.base) return;
    const c = this.canvas.getContext('2d');
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.base, 0, 0);
    if (!marker) return;
    const [x, y] = this.project(marker.lon, marker.lat);
    const accent = getCss('--accent');
    const pulse = (t / 1400) % 1;
    c.strokeStyle = accent;
    c.globalAlpha = 1 - pulse;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(x, y, 14 + pulse * 46, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = accent;
    c.beginPath();
    c.arc(x, y, 12, 0, Math.PI * 2);
    c.fill();

    c.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
    const tw = c.measureText(marker.label).width;
    const pad = 14;
    let lx = x - tw / 2 - pad;
    lx = Math.max(8, Math.min(this.canvas.width - tw - pad * 2 - 8, lx));
    const ly = y - 34 - 44 < 8 ? y + 30 : y - 34 - 44;
    c.fillStyle = 'rgba(10, 10, 12, 0.85)';
    roundRect(c, lx, ly, tw + pad * 2, 44, 10);
    c.fill();
    c.fillStyle = '#f4f1ea';
    c.textBaseline = 'middle';
    c.fillText(marker.label, lx + pad, ly + 23);
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function getCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
