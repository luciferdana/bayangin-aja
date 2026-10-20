// Generator soal tebak negara dan tebak provinsi dari public/data/geo.json.
// Jawaban benar disorot di peta; tiga pengecoh diambil dari wilayah terdekat.
import { normalize } from './engine.js';

const KIND = {
  negara: { from: 'countries', cat: 'Tebak Negara', q: 'Negara apa yang ditandai di peta?', source: 'Peta Natural Earth' },
  bendera: { from: 'countries', cat: 'Tebak Bendera', q: 'Ini bendera negara apa?', source: 'Bendera: flag-icons (MIT)', needs: 'flag' },
  provinsi: { from: 'provinces', cat: 'Tebak Provinsi', q: 'Provinsi apa yang ditandai di peta?', source: 'Peta 38 provinsi, CC BY 4.0' },
};

const idOf = (kind, name) => `${kind}-${normalize(name).replace(/ /g, '-')}`;

function factFor(kind, t) {
  if (kind !== 'provinsi') return `Ibu kota ${t.name}: ${t.capital}.`;
  if (t.name === 'Jakarta') return 'Jakarta adalah provinsi dengan daratan paling kecil di antara 38 provinsi Indonesia.';
  if (t.capital === t.name) return `Ibu kota Provinsi ${t.name} juga bernama ${t.capital}.`;
  return `Ibu kota Provinsi ${t.name}: ${t.capital}.`;
}

// Satu soal untuk wilayah `t`.
export function geoQuestion(geo, kind, t) {
  const k = KIND[kind];
  const list = Object.values(geo[k.from]).filter((x) => !k.needs || x[k.needs]);
  const [lon, lat] = t.center;
  const dist = (x) => Math.hypot((x.center[0] - lon) * Math.cos((lat * Math.PI) / 180), x.center[1] - lat);
  const near = list.filter((x) => x !== t).sort((a, b) => dist(a) - dist(b)).slice(0, 3);
  const all = [t, ...near];
  return {
    id: idOf(kind, t.name),
    cat: k.cat,
    diff: t.diff,
    gen: kind,
    q: k.q,
    options: all.map((x) => x.name),
    answer: 0,
    alias: Object.fromEntries(all.filter((x) => x.alias.length).map((x) => [x.name, x.alias])),
    fact: factFor(kind, t),
    source: k.source,
    // Tebak bendera: bendera saat menjawab, lokasi negaranya di peta saat jawaban dibuka.
    shape: { kind: kind === 'provinsi' ? 'provinsi' : 'negara', name: t.name },
    ...(kind === 'bendera' ? { flag: `flags/${t.flag}.svg` } : {}),
    focus: { lat, lon: lon > 180 ? lon - 360 : lon },
  };
}

// { negara(diff, rng, avoid), provinsi(diff, rng, avoid) } untuk QuizEngine.
export function makeGenerators(geo) {
  const gens = {};
  for (const kind of Object.keys(KIND)) {
    const list = Object.values(geo[KIND[kind].from]).filter((x) => !KIND[kind].needs || x[KIND[kind].needs]);
    gens[kind] = (diff, rng, avoid = new Set()) => {
      const tiers = [
        (x) => x.diff === diff && !avoid.has(idOf(kind, x.name)),
        (x) => !avoid.has(idOf(kind, x.name)),
        () => true,
      ];
      for (const ok of tiers) {
        const c = list.filter(ok);
        if (c.length) return geoQuestion(geo, kind, c[Math.floor(rng() * c.length)]);
      }
      return null;
    };
  }
  return gens;
}
