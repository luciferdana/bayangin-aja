// Generator soal Matematika. Angka diacak setiap kali soal dibuat, jadi soalnya tidak bisa
// dihafal penonton. Pengecoh diambil dari salah hitung yang umum: urutan operasi dikerjakan dari
// kiri, diskon bertingkat dijumlahkan, lupa menyimpan, selisih satu.

const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const one = (rng, arr) => arr[Math.floor(rng() * arr.length)];
// 135000 -> "135.000" (tanpa Intl supaya sama di semua browser)
const rp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

// Jawaban + pengecoh: kandidat dipakai berurutan (yang paling "menjebak" duluan), dibuang kalau
// sama dengan jawaban, ganda, atau bukan bilangan bulat positif. Kurang dari tiga: diisi angka dekat.
function numbers(answer, cands) {
  const out = [];
  const ok = (x) => Number.isInteger(x) && x > 0 && x !== answer && !out.includes(x);
  for (const x of cands) if (out.length < 3 && ok(x)) out.push(x);
  for (const d of [1, 2, 10, 3, 5, 20]) {
    for (const x of [answer + d, answer - d]) if (out.length < 3 && ok(x)) out.push(x);
  }
  return out;
}

// Opsi angka diurutkan naik (ordered), jadi posisi jawaban ikut acak sesuai angkanya.
function numeric(kind, diff, q, answer, cands, fact, { money = false } = {}) {
  const all = [answer, ...numbers(answer, cands)].sort((a, b) => a - b);
  const label = money ? rp : String;
  const options = all.map(label);
  const alias = money ? Object.fromEntries(all.filter((n) => n % 1000 === 0).map((n) => [rp(n), [`${n / 1000}rb`, `${n / 1000} ribu`, `rp${n}`]])) : undefined;
  return { id: `mtk-${kind}-${q.replace(/\D+/g, '-')}`, cat: 'Matematika', diff, gen: 'mtk', ordered: true, q, options,
    answer: all.indexOf(answer), ...(alias && { alias }), fact, source: 'Hitungan' };
}

const MAKERS = {
  mudah: [
    // Penjumlahan bersimpan: pengecoh = lupa menyimpan.
    (rng) => {
      const a = int(rng, 18, 79);
      const b = int(rng, 13, 69);
      const noCarry = Number(String(Math.floor(a / 10) + Math.floor(b / 10)) + String((a % 10 + b % 10) % 10));
      return numeric('tambah', 'mudah', `Berapa hasil ${a} + ${b}?`, a + b, [noCarry, a + b + 10, a + b - 1],
        `${a} + ${b} = ${a + b}. Satuannya ${a % 10} + ${b % 10} = ${a % 10 + b % 10}${a % 10 + b % 10 >= 10 ? ', simpan 1 ke puluhan' : ''}.`);
    },
    (rng) => {
      const a = int(rng, 52, 98);
      const b = int(rng, 14, a - 12);
      const noBorrow = Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) * 10 + Math.abs((a % 10) - (b % 10));
      return numeric('kurang', 'mudah', `Berapa hasil ${a} − ${b}?`, a - b, [noBorrow, a - b + 10, a - b - 10],
        `${a} − ${b} = ${a - b}. Cek balik: ${a - b} + ${b} = ${a}.`);
    },
    (rng) => {
      const a = int(rng, 4, 9);
      const b = int(rng, 6, 13);
      return numeric('kali', 'mudah', `Berapa hasil ${a} × ${b}?`, a * b, [a * (b + 1), (a - 1) * b, a * b + 10],
        `${a} × ${b} artinya ${b} dijumlah ${a} kali: hasilnya ${a * b}.`);
    },
    // Jebakan urutan operasi paling dasar.
    (rng) => {
      const a = int(rng, 2, 9);
      const b = int(rng, 2, 6);
      const c = int(rng, 3, 7);
      return numeric('urutan', 'mudah', `Berapa hasil ${a} + ${b} × ${c}?`, a + b * c, [(a + b) * c, a * b + c, a + b * c + 1],
        `Kali dulu baru tambah: ${b} × ${c} = ${b * c}, lalu ${a} + ${b * c} = ${a + b * c}. Bukan dari kiri ke kanan.`);
    },
    (rng) => {
      const h = int(rng, 1, 4);
      const m = one(rng, [15, 20, 25, 30, 35, 40, 45, 50]);
      return numeric('menit', 'mudah', `${h} jam ${m} menit itu sama dengan berapa menit?`, h * 60 + m, [h * 100 + m, h * 60 + m + 10, (h + 1) * 60],
        `1 jam = 60 menit, jadi ${h} × 60 + ${m} = ${h * 60 + m} menit.`);
    },
  ],
  sedang: [
    (rng) => {
      const a = int(rng, 5, 9);
      const b = int(rng, 5, 9);
      const c = int(rng, 2, 4);
      const d = int(rng, 2, 4);
      const ltr = (a * b - c) * d;
      return numeric('kalikurang', 'sedang', `Berapa hasil ${a} × ${b} − ${c} × ${d}?`, a * b - c * d, [ltr, a * b - c, a * (b - c) * d],
        `Dua perkalian dulu: ${a} × ${b} = ${a * b} dan ${c} × ${d} = ${c * d}. Lalu ${a * b} − ${c * d} = ${a * b - c * d}.`);
    },
    (rng) => {
      const c = int(rng, 2, 5);
      const b = c * int(rng, 3, 9);
      const a = int(rng, b / c + 6, 40);
      const ltr = (a - b) / c;
      return numeric('bagi', 'sedang', `Berapa hasil ${a} − ${b} ÷ ${c}?`, a - b / c, [ltr, a - b, a - b / c + c],
        `Bagi dulu: ${b} ÷ ${c} = ${b / c}, lalu ${a} − ${b / c} = ${a - b / c}.`);
    },
    (rng) => {
      const p = one(rng, [10, 20, 25, 30, 40, 75]);
      const n = 20 * int(rng, 3, 24);
      const ans = (p * n) / 100;
      return numeric('persen', 'sedang', `Berapa ${p}% dari ${n}?`, ans, [n - ans, ans * 2, ans + 10],
        `${p}% artinya ${p} per 100, jadi ${p} ÷ 100 × ${n} = ${ans}.`);
    },
    (rng) => {
      const n = int(rng, 11, 19);
      return numeric('kuadrat', 'sedang', `Berapa hasil ${n}²?`, n * n, [n * 2, (n + 1) * (n + 1), n * n + 10],
        `${n}² artinya ${n} × ${n} = ${n * n}, bukan ${n} × 2.`);
    },
    (rng) => {
      const s = int(rng, 2, 9);
      const d = int(rng, 3, 9);
      const seq = [0, 1, 2, 3].map((k) => s + k * d);
      return numeric('deret', 'sedang', `Angka berikutnya: ${seq.join(', ')}, ...?`, s + 4 * d, [s + 4 * d + 1, s + 5 * d, s + 3 * d + d * 2],
        `Setiap langkah naik ${d}: ${seq[3]} + ${d} = ${s + 4 * d}.`);
    },
    (rng) => {
      const h = 500 * int(rng, 3, 19);
      const n = int(rng, 3, 8);
      return numeric('belanja', 'sedang', `Satu buku harganya Rp${rp(h)}. Berapa rupiah harga ${n} buku?`, h * n, [h * (n - 1), h * (n + 1), h * n + 1000],
        `${n} × Rp${rp(h)} = Rp${rp(h * n)}.`, { money: true });
    },
  ],
  sulit: [
    // Diskon bertingkat: diskon kedua dihitung dari harga setelah diskon pertama, bukan dijumlah.
    (rng) => {
      const combos = [];
      for (const H of [80000, 100000, 120000, 160000, 200000, 240000, 300000, 400000]) {
        for (const d1 of [20, 25, 50]) {
          for (const d2 of [10, 20]) {
            const ans = (H * (100 - d1) * (100 - d2)) / 10000;
            if (ans % 1000 === 0) combos.push([H, d1, d2, ans]);
          }
        }
      }
      const [H, d1, d2, ans] = one(rng, combos);
      const sum = (H * (100 - d1 - d2)) / 100;
      const mid = (H * (100 - d1)) / 100;
      return numeric('diskon', 'sulit', `Baju Rp${rp(H)} didiskon ${d1}%, lalu didiskon lagi ${d2}%. Berapa rupiah harganya?`, ans,
        [sum, mid, ans + 2000], `Bukan diskon ${d1 + d2}%. Setelah ${d1}% jadi Rp${rp(mid)}, lalu ${d2}% dari situ: Rp${rp(ans)}.`, { money: true });
    },
    (rng) => {
      const e = int(rng, 2, 4);
      const d = e * int(rng, 2, 6);
      const a = int(rng, 3, 9);
      const b = int(rng, 2, 6);
      const c = int(rng, 2, 5);
      const ans = a + b * c - d / e;
      const ltr = ((a + b) * c - d) / e;
      return numeric('campur', 'sulit', `Berapa hasil ${a} + ${b} × ${c} − ${d} ÷ ${e}?`, ans, [ltr, (a + b) * c - d / e, a + b * c - d],
        `Kali dan bagi dulu: ${b} × ${c} = ${b * c}, ${d} ÷ ${e} = ${d / e}. Lalu ${a} + ${b * c} − ${d / e} = ${ans}.`);
    },
    (rng) => {
      const s = int(rng, 2, 5);
      const k = one(rng, [2, 3]);
      const seq = [0, 1, 2, 3].map((i) => s * k ** i);
      const ans = s * k ** 4;
      return numeric('deretkali', 'sulit', `Angka berikutnya: ${seq.join(', ')}, ...?`, ans, [seq[3] + (seq[3] - seq[2]), ans + seq[0], seq[3] * (k + 1)],
        `Setiap langkah dikali ${k}: ${seq[3]} × ${k} = ${ans}.`);
    },
    (rng) => {
      const v = one(rng, [40, 50, 60, 80, 90, 100, 120]);
      const t = one(rng, [1.5, 2.5, 3.5]);
      const ans = v * t;
      return numeric('jarak', 'sulit', `Mobil melaju ${v} km/jam selama ${String(t).replace('.', ',')} jam. Berapa km jaraknya?`, ans,
        [v * Math.floor(t), v * Math.ceil(t), ans + v / 10 * 5], `Jarak = kecepatan × waktu = ${v} × ${String(t).replace('.', ',')} = ${ans} km.`);
    },
    (rng) => {
      const [a, b] = one(rng, [[2, 3], [3, 4], [2, 5], [3, 5], [5, 6], [3, 8]]);
      const n = b * int(rng, 4, 20);
      const ans = (n / b) * a;
      return numeric('pecahan', 'sulit', `Berapa ${a}/${b} dari ${n}?`, ans, [n - ans, n / b, ans + n / b],
        `Bagi dulu dengan penyebut: ${n} ÷ ${b} = ${n / b}, lalu kali pembilang: ${n / b} × ${a} = ${ans}.`);
    },
    // Hari: sisa bagi 7. Pengecoh: meleset satu hari ke depan/belakang dan hari yang sama.
    (rng) => {
      const today = int(rng, 0, 6);
      let n = int(rng, 30, 200);
      if (n % 7 === 0) n += int(rng, 1, 6);
      const at = (k) => DAYS[(((today + k) % 7) + 7) % 7];
      const options = [...new Set([at(n), at(n + 1), at(n - 1), at(0)])];
      return { id: `mtk-hari-${today}-${n}`, cat: 'Matematika', diff: 'sulit', gen: 'mtk',
        q: `Hari ini hari ${DAYS[today]}. ${n} hari lagi hari apa?`, options, answer: 0,
        fact: `${n} hari = ${Math.floor(n / 7)} minggu lebih ${n % 7} hari. Jadi tinggal maju ${n % 7} hari dari ${DAYS[today]}.`, source: 'Hitungan' };
    },
  ],
};

// (diff, rng, avoid) => soal. Dipakai engine sebagai generator tema 'mtk'.
export function mathQuestion(diff, rng, avoid = new Set()) {
  const list = MAKERS[diff] ?? MAKERS.sedang;
  let q = null;
  for (let i = 0; i < 12 && (!q || avoid.has(q.id)); i++) q = one(rng, list)(rng);
  return q;
}
