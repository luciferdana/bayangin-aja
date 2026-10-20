// Bangun public/data/geo.json untuk soal tebak negara dan tebak provinsi.
//   node scripts/build-geo.mjs
// Sumber: Natural Earth (world-atlas, domain publik) dan peta 38 provinsi (CC BY 4.0),
// lihat scripts/data/SUMBER.md.
import fs from 'node:fs';
import * as topo from 'topojson-client';

// Nama Natural Earth -> [nama Indonesia, ibu kota, tingkat, ejaan lain]
// Negara dengan batas yang diperdebatkan sengaja tidak dimasukkan.
const COUNTRIES = {
  Japan: ['Jepang', 'Tokyo', 'mudah', ['japan']],
  Australia: ['Australia', 'Canberra', 'mudah', []],
  Brazil: ['Brasil', 'Brasilia', 'mudah', ['brazil']],
  India: ['India', 'New Delhi', 'mudah', []],
  Egypt: ['Mesir', 'Kairo', 'mudah', ['egypt']],
  Italy: ['Italia', 'Roma', 'mudah', ['italy']],
  'United Kingdom': ['Inggris', 'London', 'mudah', ['britania raya', 'uk', 'england']],
  'United States of America': ['Amerika Serikat', 'Washington, D.C.', 'mudah', ['amerika', 'as', 'usa']],
  Malaysia: ['Malaysia', 'Kuala Lumpur', 'mudah', []],
  Thailand: ['Thailand', 'Bangkok', 'mudah', []],
  Philippines: ['Filipina', 'Manila', 'mudah', ['philippines']],
  'Saudi Arabia': ['Arab Saudi', 'Riyadh', 'mudah', ['saudi']],
  China: ['Tiongkok', 'Beijing', 'mudah', ['china', 'cina']],
  Russia: ['Rusia', 'Moskwa', 'mudah', ['russia']],
  Canada: ['Kanada', 'Ottawa', 'mudah', ['canada']],
  Mexico: ['Meksiko', 'Mexico City', 'mudah', ['mexico']],
  France: ['Prancis', 'Paris', 'mudah', ['perancis', 'france']],
  Spain: ['Spanyol', 'Madrid', 'mudah', ['spain']],
  'South Korea': ['Korea Selatan', 'Seoul', 'mudah', ['korsel']],
  Turkey: ['Turki', 'Ankara', 'mudah', ['turkiye']],
  Argentina: ['Argentina', 'Buenos Aires', 'mudah', []],
  'South Africa': ['Afrika Selatan', 'Pretoria (pemerintahan)', 'mudah', []],
  Vietnam: ['Vietnam', 'Hanoi', 'sedang', []],
  Myanmar: ['Myanmar', 'Naypyidaw', 'sedang', ['burma']],
  Cambodia: ['Kamboja', 'Phnom Penh', 'sedang', ['cambodia']],
  Laos: ['Laos', 'Vientiane', 'sedang', []],
  'Papua New Guinea': ['Papua Nugini', 'Port Moresby', 'sedang', ['png']],
  'Timor-Leste': ['Timor Leste', 'Dili', 'sedang', ['timor timur']],
  'New Zealand': ['Selandia Baru', 'Wellington', 'sedang', ['new zealand']],
  Pakistan: ['Pakistan', 'Islamabad', 'sedang', []],
  Iran: ['Iran', 'Teheran', 'sedang', []],
  Iraq: ['Irak', 'Bagdad', 'sedang', ['iraq']],
  Germany: ['Jerman', 'Berlin', 'sedang', ['germany']],
  Portugal: ['Portugal', 'Lisboa', 'sedang', []],
  Greece: ['Yunani', 'Athena', 'sedang', ['greece']],
  Norway: ['Norwegia', 'Oslo', 'sedang', ['norway']],
  Sweden: ['Swedia', 'Stockholm', 'sedang', ['sweden']],
  Finland: ['Finlandia', 'Helsinki', 'sedang', ['finland']],
  Poland: ['Polandia', 'Warsawa', 'sedang', ['poland']],
  Ukraine: ['Ukraina', 'Kyiv', 'sedang', ['ukraine']],
  Peru: ['Peru', 'Lima', 'sedang', []],
  Chile: ['Chili', 'Santiago', 'sedang', ['chile']],
  Colombia: ['Kolombia', 'Bogota', 'sedang', ['colombia']],
  Nigeria: ['Nigeria', 'Abuja', 'sedang', []],
  Kenya: ['Kenya', 'Nairobi', 'sedang', []],
  Morocco: ['Maroko', 'Rabat', 'sedang', ['morocco']],
  Madagascar: ['Madagaskar', 'Antananarivo', 'sedang', ['madagascar']],
  Mongolia: ['Mongolia', 'Ulaanbaatar', 'sedang', []],
  Kazakhstan: ['Kazakhstan', 'Astana', 'sedang', ['kazakstan']],
  Afghanistan: ['Afganistan', 'Kabul', 'sedang', ['afghanistan']],
  Bangladesh: ['Bangladesh', 'Dhaka', 'sedang', []],
  'Sri Lanka': ['Sri Lanka', 'Sri Jayawardenepura Kotte', 'sedang', []],
  Nepal: ['Nepal', 'Kathmandu', 'sedang', []],
  Cuba: ['Kuba', 'Havana', 'sedang', ['cuba']],
  Netherlands: ['Belanda', 'Amsterdam', 'sulit', ['netherlands', 'holland']],
  Belgium: ['Belgia', 'Brussel', 'sulit', ['belgium']],
  Switzerland: ['Swiss', 'Bern', 'sulit', ['switzerland']],
  Austria: ['Austria', 'Wina', 'sulit', []],
  Hungary: ['Hungaria', 'Budapest', 'sulit', ['hungary']],
  Romania: ['Rumania', 'Bukares', 'sulit', ['romania']],
  Bulgaria: ['Bulgaria', 'Sofia', 'sulit', []],
  Croatia: ['Kroasia', 'Zagreb', 'sulit', ['croatia']],
  Ireland: ['Irlandia', 'Dublin', 'sulit', ['ireland']],
  Iceland: ['Islandia', 'Reykjavik', 'sulit', ['iceland']],
  Ethiopia: ['Etiopia', 'Addis Ababa', 'sulit', ['ethiopia']],
  Sudan: ['Sudan', 'Khartoum', 'sulit', []],
  Tanzania: ['Tanzania', 'Dodoma', 'sulit', []],
  Angola: ['Angola', 'Luanda', 'sulit', []],
  Namibia: ['Namibia', 'Windhoek', 'sulit', []],
  Botswana: ['Botswana', 'Gaborone', 'sulit', []],
  Zambia: ['Zambia', 'Lusaka', 'sulit', []],
  Uruguay: ['Uruguay', 'Montevideo', 'sulit', []],
  Paraguay: ['Paraguay', 'Asuncion', 'sulit', []],
  Bolivia: ['Bolivia', 'Sucre (konstitusional) dan La Paz (pemerintahan)', 'sulit', []],
  Ecuador: ['Ekuador', 'Quito', 'sulit', ['ecuador']],
  Venezuela: ['Venezuela', 'Caracas', 'sulit', []],
  Uzbekistan: ['Uzbekistan', 'Tashkent', 'sulit', []],
  Syria: ['Suriah', 'Damaskus', 'sulit', ['syria']],
  Yemen: ['Yaman', "Sana'a", 'sulit', ['yemen']],
  Oman: ['Oman', 'Muskat', 'sulit', []],
  Jordan: ['Yordania', 'Amman', 'sulit', ['jordan']],
  Brunei: ['Brunei', 'Bandar Seri Begawan', 'sulit', ['brunei darussalam']],
  'North Korea': ['Korea Utara', 'Pyongyang', 'sulit', ['korut']],
  Bhutan: ['Bhutan', 'Thimphu', 'sulit', []],
  Algeria: ['Aljazair', 'Aljir', 'sulit', ['algeria']],
  Libya: ['Libya', 'Tripoli', 'sulit', []],
};

// Nama di data provinsi -> [nama opsi, ibu kota, tingkat, ejaan lain]
const PROVINCES = {
  Aceh: ['Aceh', 'Banda Aceh', 'mudah', []],
  'Sumatera Utara': ['Sumatera Utara', 'Medan', 'mudah', ['sumut', 'sumatra utara']],
  'Sumatera Barat': ['Sumatera Barat', 'Padang', 'sedang', ['sumbar', 'sumatra barat']],
  Riau: ['Riau', 'Pekanbaru', 'sedang', []],
  'Kepulauan Riau': ['Kepulauan Riau', 'Tanjung Pinang', 'sedang', ['kepri']],
  Jambi: ['Jambi', 'Jambi', 'sulit', []],
  'Sumatera Selatan': ['Sumatera Selatan', 'Palembang', 'sedang', ['sumsel', 'sumatra selatan']],
  'Kepulauan Bangka Belitung': ['Bangka Belitung', 'Pangkalpinang', 'sedang', ['babel', 'kepulauan bangka belitung']],
  Bengkulu: ['Bengkulu', 'Bengkulu', 'sulit', []],
  Lampung: ['Lampung', 'Bandar Lampung', 'sedang', []],
  'DKI Jakarta': ['Jakarta', 'Jakarta', 'mudah', ['dki', 'dki jakarta']],
  Banten: ['Banten', 'Serang', 'sedang', []],
  'Jawa Barat': ['Jawa Barat', 'Bandung', 'mudah', ['jabar']],
  'Jawa Tengah': ['Jawa Tengah', 'Semarang', 'mudah', ['jateng']],
  'Daerah Istimewa Yogyakarta': ['Yogyakarta', 'Yogyakarta', 'mudah', ['diy', 'jogja', 'jogjakarta', 'jogya']],
  'Jawa Timur': ['Jawa Timur', 'Surabaya', 'mudah', ['jatim']],
  Bali: ['Bali', 'Denpasar', 'mudah', []],
  'Nusa Tenggara Barat': ['Nusa Tenggara Barat', 'Mataram', 'sedang', ['ntb']],
  'Nusa Tenggara Timur': ['Nusa Tenggara Timur', 'Kupang', 'sedang', ['ntt']],
  'Kalimantan Barat': ['Kalimantan Barat', 'Pontianak', 'mudah', ['kalbar']],
  'Kalimantan Tengah': ['Kalimantan Tengah', 'Palangka Raya', 'sedang', ['kalteng']],
  'Kalimantan Selatan': ['Kalimantan Selatan', 'Banjarbaru', 'sedang', ['kalsel']],
  'Kalimantan Timur': ['Kalimantan Timur', 'Samarinda', 'sedang', ['kaltim']],
  'Kalimantan Utara': ['Kalimantan Utara', 'Tanjung Selor', 'sulit', ['kaltara']],
  'Sulawesi Utara': ['Sulawesi Utara', 'Manado', 'sedang', ['sulut']],
  Gorontalo: ['Gorontalo', 'Gorontalo', 'sulit', []],
  'Sulawesi Tengah': ['Sulawesi Tengah', 'Palu', 'sedang', ['sulteng']],
  'Sulawesi Barat': ['Sulawesi Barat', 'Mamuju', 'sulit', ['sulbar']],
  'Sulawesi Selatan': ['Sulawesi Selatan', 'Makassar', 'mudah', ['sulsel']],
  'Sulawesi Tenggara': ['Sulawesi Tenggara', 'Kendari', 'sedang', ['sultra']],
  Maluku: ['Maluku', 'Ambon', 'sedang', []],
  'Maluku Utara': ['Maluku Utara', 'Sofifi', 'sulit', ['malut']],
  Papua: ['Papua', 'Jayapura', 'sedang', []],
  'Papua Barat': ['Papua Barat', 'Manokwari', 'sedang', []],
  'Papua Barat Daya': ['Papua Barat Daya', 'Sorong', 'sulit', []],
  'Papua Tengah': ['Papua Tengah', 'Nabire', 'sulit', []],
  'Papua Pegunungan': ['Papua Pegunungan', 'Wamena', 'sulit', []],
  'Papua Selatan': ['Papua Selatan', 'Merauke', 'sulit', []],
};

// Douglas-Peucker. Cincin tertutup (titik awal = akhir) dipecah dulu di titik terjauh.
function simplify(ring, eps) {
  if (ring.length < 5) return ring;
  const [ax, ay] = ring[0];
  const [bx, by] = ring[ring.length - 1];
  if (ax === bx && ay === by) {
    let far = 1;
    for (let i = 1; i < ring.length - 1; i++) {
      if (Math.hypot(ring[i][0] - ax, ring[i][1] - ay) > Math.hypot(ring[far][0] - ax, ring[far][1] - ay)) far = i;
    }
    return [...simplify(ring.slice(0, far + 1), eps).slice(0, -1), ...simplify(ring.slice(far), eps)];
  }
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = ring[a];
    const [x2, y2] = ring[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * ring[i][0] - dx * ring[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const round2 = (r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
const area = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
const bboxOf = (rings) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return b.map((v) => Math.round(v * 100) / 100);
};
function centroid(r) {
  let a = 0; let cx = 0; let cy = 0;
  r.forEach(([x, y], i) => {
    const [x2, y2] = r[(i + 1) % r.length];
    const f = x * y2 - x2 * y;
    a += f; cx += (x + x2) * f; cy += (y + y2) * f;
  });
  return a ? [Math.round((cx / (3 * a)) * 100) / 100, Math.round((cy / (3 * a)) * 100) / 100] : r[0];
}

function outerRings(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.map((p) => p[0]);
}

// Ringkasan satu wilayah: cincin luar disederhanakan, titik pusat dan kotak pandang dari
// pulau terbesar plus pulau lain di dekatnya (Alaska dan Hawaii tidak menarik kotak USA).
function region(rings, eps, near) {
  // Cincin yang melintasi garis tanggal dibuka: bujur negatif digeser +360 (Rusia timur).
  const span = (r) => Math.max(...r.map((p) => p[0])) - Math.min(...r.map((p) => p[0]));
  rings = rings.map((r) => (span(r) > 180 ? r.map(([x, y]) => [x < 0 ? x + 360 : x, y]) : r));
  // Cincin kecil yang habis disederhanakan tetap dipakai apa adanya.
  const simple = rings.map((r) => {
    const s = round2(simplify(r, eps));
    return s.length >= 4 ? s : round2(r);
  }).filter((r) => r.length >= 4);
  const main = simple.reduce((a, b) => (area(b) > area(a) ? b : a));
  const [mx0, my0, mx1, my1] = bboxOf([main]);
  const close = simple.filter((r) => {
    const [x0, y0, x1, y1] = bboxOf([r]);
    return x1 > mx0 - near && x0 < mx1 + near && y1 > my0 - near && y0 < my1 + near;
  });
  return { rings: simple, center: centroid(main), view: bboxOf(close) };
}

const world = JSON.parse(fs.readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)));
const features = topo.feature(world, world.objects.countries).features;
const countries = {};
const background = [];
for (const f of features) {
  if (!f.geometry) continue;
  const rings = outerRings(f.geometry);
  for (const r of rings) {
    const s = round2(simplify(r, 0.08));
    if (s.length >= 4) background.push(s);
  }
  const meta = COUNTRIES[f.properties.name];
  if (!meta) continue;
  const [name, capital, diff, alias] = meta;
  countries[name] = { name, capital, diff, alias, ...region(rings, 0.05, 4) };
}
const missing = Object.keys(COUNTRIES).filter((k) => !countries[COUNTRIES[k][0]]);
if (missing.length) throw new Error(`negara tidak ditemukan: ${missing.join(', ')}`);

const provGeo = JSON.parse(fs.readFileSync(new URL('./data/indonesia-38-provinces.geojson', import.meta.url)));
const provinces = {};
for (const f of provGeo.features) {
  const meta = PROVINCES[f.properties.PROVINSI];
  if (!meta) throw new Error(`provinsi tak dikenal: ${f.properties.PROVINSI}`);
  const [name, capital, diff, alias] = meta;
  provinces[name] = { name, capital, diff, alias, ...region(outerRings(f.geometry), 0.005, 1.5) };
}
if (Object.keys(provinces).length !== 38) throw new Error(`provinsi: ${Object.keys(provinces).length}`);

const out = {
  source: 'Natural Earth (domain publik); peta 38 provinsi, CC BY 4.0 (lihat scripts/data/SUMBER.md)',
  background,
  countries,
  provinces,
};
fs.writeFileSync(new URL('../public/data/geo.json', import.meta.url), JSON.stringify(out));
console.log(`geo.json: ${Object.keys(countries).length} negara, ${Object.keys(provinces).length} provinsi, ${background.length} cincin latar`);
