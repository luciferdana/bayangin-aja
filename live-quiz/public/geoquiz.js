// Generator soal peta dari public/data/geo.json: tebak negara, provinsi, bendera, dan ibu kota.
// Jawaban benar disorot di peta; tiga pengecoh diambil dari wilayah terdekat.
import { normalize } from './engine.js';

const KIND = {
  negara: { from: 'countries', cat: 'Tebak Negara', q: 'Negara apa yang ditandai di peta?', source: 'Peta Natural Earth' },
  bendera: { from: 'countries', cat: 'Tebak Bendera', q: 'Ini bendera negara apa?', source: 'Bendera: flag-icons (MIT)', needs: 'flag' },
  provinsi: { from: 'provinces', cat: 'Tebak Provinsi', q: 'Provinsi apa yang ditandai di peta?', source: 'Peta 38 provinsi, CC BY 4.0' },
  // Ibu kota: opsinya nama kota, wilayahnya disorot di peta sebagai petunjuk.
  ibukota: { from: 'provinces', cat: 'Ibu Kota Provinsi', q: (t) => `Ibu kota Provinsi ${t.name} adalah...`, source: 'Peta 38 provinsi, CC BY 4.0', capital: true },
  dunia: { from: 'countries', cat: 'Ibu Kota Dunia', q: (t) => `Ibu kota ${t.name} adalah...`, source: 'Peta Natural Earth', capital: true },
};

// Soal ibu kota punya tingkat sendiri (seberapa dikenal kotanya, bukan seberapa mudah
// wilayahnya ditemukan di peta). Yang tidak disebut: sedang.
const CAPITAL_DIFF = {
  mudah: ['Jawa Barat', 'Jawa Tengah', 'Jawa Timur', 'Bali', 'Sumatera Utara', 'Sulawesi Selatan', 'Sumatera Barat',
    'Sumatera Selatan', 'Aceh', 'Lampung', 'Riau', 'Sulawesi Utara',
    'Jepang', 'Inggris', 'Prancis', 'Italia', 'Thailand', 'Malaysia', 'Korea Selatan', 'Tiongkok', 'Rusia', 'Mesir',
    'Arab Saudi', 'Filipina', 'Spanyol', 'Jerman', 'Amerika Serikat', 'India', 'Timor Leste', 'Brunei', 'Vietnam', 'Argentina'],
  sulit: ['Papua Tengah', 'Papua Pegunungan', 'Papua Selatan', 'Papua Barat Daya', 'Maluku Utara', 'Kalimantan Utara',
    'Sulawesi Barat', 'Kalimantan Selatan', 'Papua Barat',
    'Australia', 'Kanada', 'Brasil', 'Turki', 'Myanmar', 'Kazakhstan', 'Nigeria', 'Tanzania', 'Selandia Baru', 'Swiss',
    'Pakistan', 'Maroko', 'Afrika Selatan', 'Uzbekistan', 'Mongolia', 'Madagaskar', 'Botswana', 'Namibia', 'Bhutan',
    'Oman', 'Yaman', 'Paraguay', 'Ekuador', 'Angola', 'Zambia', 'Islandia'],
};
// Tidak dipakai di soal ibu kota: nama ibu kota sama dengan wilayahnya (jawabannya ada di soal),
// atau ibu kotanya lebih dari satu / terlalu panjang untuk diketik.
const CAPITAL_SKIP = new Set(['Jakarta', 'Yogyakarta', 'Gorontalo', 'Bengkulu', 'Jambi', 'Bolivia', 'Sri Lanka']);
const CAPITAL_NAME = { 'Washington, D.C.': 'Washington DC', 'Pretoria (pemerintahan)': 'Pretoria', "Sana'a": 'Sanaa' };
const CAPITAL_ALIAS = {
  'Washington DC': ['washington'], Moskwa: ['moskow', 'moscow'], Beijing: ['peking'], Kairo: ['cairo'], Roma: ['rome'],
  Wina: ['vienna', 'wien'], Bukares: ['bucharest'], Warsawa: ['warsaw'], Lisboa: ['lisbon'], Teheran: ['tehran'],
  Bagdad: ['baghdad'], Damaskus: ['damascus'], Athena: ['athens'], Brussel: ['brussels'], Aljir: ['algiers'],
  Muskat: ['muscat'], Kyiv: ['kiev'], 'Mexico City': ['ciudad de mexico'], 'New Delhi': ['delhi'], Sanaa: ['sana'],
  Naypyidaw: ['naypyitaw'], Ulaanbaatar: ['ulan bator'], Tashkent: ['taskent'], 'Kuala Lumpur': ['kl'],
  Pretoria: ['tshwane'],
};
const CAPITAL_FACT = {
  'Kalimantan Selatan': 'Sejak 2022, ibu kota Kalimantan Selatan pindah dari Banjarmasin ke Banjarbaru.',
  'Maluku Utara': 'Sofifi ada di Pulau Halmahera. Kota terbesar Maluku Utara justru Ternate.',
  'Kalimantan Utara': 'Kalimantan Utara jadi provinsi sendiri tahun 2012, pisah dari Kalimantan Timur.',
  Australia: 'Banyak yang mengira Sydney. Canberra sengaja dibangun di antara Sydney dan Melbourne.',
  Kanada: 'Bukan Toronto atau Vancouver. Ottawa ada di Provinsi Ontario.',
  Brasil: 'Brasilia diresmikan tahun 1960, menggantikan Rio de Janeiro.',
  Turki: 'Bukan Istanbul. Ankara jadi ibu kota sejak Republik Turki berdiri tahun 1923.',
  Myanmar: 'Naypyidaw menggantikan Yangon sebagai ibu kota sejak 2005.',
  Kazakhstan: 'Astana menggantikan Almaty sebagai ibu kota sejak 1997.',
  Nigeria: 'Abuja menggantikan Lagos sebagai ibu kota sejak 1991.',
  Tanzania: 'Dodoma ibu kota resminya. Kota terbesarnya Dar es Salaam.',
  'Selandia Baru': 'Bukan Auckland, kota terbesarnya. Wellington ada di ujung selatan Pulau Utara.',
  Swiss: 'Bern disebut kota federal. Kota terbesar Swiss adalah Zurich.',
  Pakistan: 'Islamabad dibangun tahun 1960-an menggantikan Karachi.',
  Maroko: 'Bukan Casablanca, kota terbesarnya. Ibu kotanya Rabat.',
  'Afrika Selatan': 'Afrika Selatan punya tiga ibu kota: Pretoria, Cape Town, dan Bloemfontein.',
  Malaysia: 'Pusat pemerintahannya sudah pindah ke Putrajaya, tapi ibu kota resminya tetap Kuala Lumpur.',
  Belanda: 'Pemerintah dan raja berkantor di Den Haag, tapi ibu kota resminya Amsterdam.',
  'Amerika Serikat': 'Bukan New York. DC singkatan dari District of Columbia.',
};

const capitalOf = (x) => CAPITAL_NAME[x.capital] ?? x.capital;

// Wilayah yang dipakai satu jenis soal, dengan tingkat yang sesuai jenisnya.
export function listFor(geo, kind) {
  const k = KIND[kind];
  let list = Object.values(geo[k.from]).filter((x) => !k.needs || x[k.needs]);
  if (k.capital) {
    list = list.filter((x) => !CAPITAL_SKIP.has(x.name))
      .map((x) => ({ ...x, diff: CAPITAL_DIFF.mudah.includes(x.name) ? 'mudah' : CAPITAL_DIFF.sulit.includes(x.name) ? 'sulit' : 'sedang' }));
  }
  return list;
}

const idOf = (kind, name) => `${kind}-${normalize(name).replace(/ /g, '-')}`;

function factFor(kind, t) {
  if (KIND[kind].capital) return CAPITAL_FACT[t.name] ?? `${capitalOf(t)} adalah ibu kota ${KIND[kind].from === 'provinces' ? 'Provinsi ' : ''}${t.name}.`;
  if (kind !== 'provinsi') return `Ibu kota ${t.name}: ${t.capital}.`;
  if (t.name === 'Jakarta') return 'Jakarta adalah provinsi dengan daratan paling kecil di antara 38 provinsi Indonesia.';
  if (t.capital === t.name) return `Ibu kota Provinsi ${t.name} juga bernama ${t.capital}.`;
  return `Ibu kota Provinsi ${t.name}: ${t.capital}.`;
}

// Satu soal untuk wilayah `t`.
export function geoQuestion(geo, kind, t) {
  const k = KIND[kind];
  const list = listFor(geo, kind);
  const [lon, lat] = t.center;
  const dist = (x) => Math.hypot((x.center[0] - lon) * Math.cos((lat * Math.PI) / 180), x.center[1] - lat);
  const near = list.filter((x) => x.name !== t.name).sort((a, b) => dist(a) - dist(b)).slice(0, 3);
  const all = [t, ...near];
  return {
    id: idOf(kind, t.name),
    cat: k.cat,
    diff: t.diff,
    gen: kind,
    q: k.capital ? k.q(t) : k.q,
    options: all.map((x) => (k.capital ? capitalOf(x) : x.name)),
    answer: 0,
    alias: k.capital
      ? Object.fromEntries(all.map(capitalOf).filter((c) => CAPITAL_ALIAS[c]).map((c) => [c, CAPITAL_ALIAS[c]]))
      : Object.fromEntries(all.filter((x) => x.alias.length).map((x) => [x.name, x.alias])),
    fact: factFor(kind, t),
    source: k.source,
    // Tebak bendera: bendera saat menjawab, lokasi negaranya di peta saat jawaban dibuka.
    shape: { kind: k.from === 'provinces' ? 'provinsi' : 'negara', name: t.name },
    // Soal ibu kota: penanda di peta menunjuk wilayahnya (titik tengah wilayah, bukan letak kotanya).
    ...(k.capital ? { capital: true } : {}),
    ...(kind === 'bendera' ? { flag: `flags/${t.flag}.svg` } : {}),
    focus: { lat, lon: lon > 180 ? lon - 360 : lon },
  };
}

// { negara(diff, rng, avoid), provinsi(diff, rng, avoid) } untuk QuizEngine.
export function makeGenerators(geo) {
  const gens = {};
  for (const kind of Object.keys(KIND)) {
    const list = listFor(geo, kind);
    // avoid: id yang tidak boleh dipakai (sudah ada di ronde ini). rank(id): kapan terakhir tampil
    // (-1 = belum pernah); yang paling lama tidak tampil didahulukan, jadi semua wilayah bergiliran.
    gens[kind] = (diff, rng, avoid = new Set(), rank = () => -1) => {
      const tiers = [
        (x) => x.diff === diff && !avoid.has(idOf(kind, x.name)),
        (x) => !avoid.has(idOf(kind, x.name)),
        () => true,
      ];
      for (const ok of tiers) {
        const c = list.filter(ok);
        if (!c.length) continue;
        const oldest = Math.min(...c.map((x) => rank(idOf(kind, x.name))));
        const pool = c.filter((x) => rank(idOf(kind, x.name)) === oldest);
        return geoQuestion(geo, kind, pool[Math.floor(rng() * pool.length)]);
      }
      return null;
    };
  }
  return gens;
}
