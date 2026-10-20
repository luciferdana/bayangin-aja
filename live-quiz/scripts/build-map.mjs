// Bangun public/data/map.json dari Natural Earth (paket world-atlas).
// Dunia memakai 110m, Indonesia memakai 50m yang dipotong ke kotak wilayahnya.
import fs from 'node:fs';
import * as topo from 'topojson-client';

export const REGIONS = {
  world: { bbox: [-180, -58, 180, 80], src: 'land-110m.json', digits: 1 },
  indonesia: { bbox: [93, -12, 143, 8], src: 'land-50m.json', digits: 2 },
};

function rings(file) {
  const t = JSON.parse(fs.readFileSync(new URL(`../node_modules/world-atlas/${file}`, import.meta.url)));
  const land = topo.feature(t, t.objects.land);
  const out = [];
  for (const f of land.features ?? [land]) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) for (const r of p) out.push(r);
  }
  return out;
}

const map = {};
for (const [name, { bbox, src, digits }] of Object.entries(REGIONS)) {
  const [x0, y0, x1, y1] = bbox;
  const pad = 2;
  const keep = rings(src).filter((r) =>
    r.some(([x, y]) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad));
  const f = 10 ** digits;
  const round = (r) => {
    const o = [];
    for (const [x, y] of r) {
      const p = [Math.round(x * f) / f, Math.round(y * f) / f];
      const last = o[o.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) o.push(p);
    }
    return o;
  };
  map[name] = { bbox, rings: keep.map(round).filter((r) => r.length >= 4) };
}
map.source = 'Natural Earth via world-atlas 2.0 (domain publik)';
fs.writeFileSync(new URL('../public/data/map.json', import.meta.url), JSON.stringify(map));
for (const k of Object.keys(REGIONS)) console.log(k, map[k].rings.length, 'ring');
