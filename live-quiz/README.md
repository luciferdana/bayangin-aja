# Kuis Bayangin Aja (TikTok LIVE)

Kuis otomatis penuh untuk live @bayangin.3d. Penonton mengetik jawaban di komentar, layar
menampilkan soal, timer, jawaban, 3 tercepat, papan skor, podium, dan klasemen live.
Latarnya Bumi yang berputar real-time, siang dan malamnya mengikuti jam sekarang.

## Menjalankan di laptop

Butuh Node.js 20 atau lebih baru.

```bash
cd live-quiz
npm install
npm run live                  # server + baca komentar TikTok LIVE @bayangin.3d
# akun lain: npm start -- namaakun   (npm start saja = tanpa TikTok, hanya untuk uji)
```

Lalu tambahkan halaman kuis sebagai sumber:

- **TikTok LIVE Studio**: Add source → **Link**, URL **`http://localtest.me:8787`**
  (LIVE Studio menolak `localhost`; `localtest.me` tetap mengarah ke laptop sendiri).
  Nyalakan Custom resolution **1080 x 1920**, Turn on sound, dan Always keep active.
  Kalau kotak sumbernya tetap melebar (kuis kecil di tengah dengan pinggir hitam), LIVE Studio
  membatasi tinggi sumber sesuai layar laptop: pakai **720 x 1280** (atau 540 x 960), Apply, lalu
  klik kanan sumber → Reset (ukuran sumber, bukan skor) → Full screen → Fit to screen.
  Jangan pakai Window capture: hasilnya buram karena tinggi layar laptop di bawah 1920 piksel.
- Pakai musik sendiri (misalnya Spotify)? Tambahkan `/?musik=0` di URL supaya musik latar kuis
  mati dan tidak tabrakan; bunyi tick, jawaban, dan gift tetap ada.
- **OBS**: Browser Source, URL `http://localhost:8787`, ukuran 1080 x 1920, 30 fps,
  centang "Control audio via OBS".

Server bisa dinyalakan sebelum live dimulai. Kalau akun belum live, server menunggu dan
mencoba lagi sendiri. Kalau koneksi terputus, server juga menyambung ulang sendiri.

**Reset** (klasemen, skor, dan ronde mulai dari nol, misalnya di awal live baru): buka
`http://localhost:8787/reset` di browser laptop. Halaman kuis di LIVE Studio langsung mulai ulang.
Me-restart server saja tidak me-reset klasemen.

Uji tanpa live: `npm start`, lalu buka `http://localhost:8787/?sim=1` (penonton palsu).
Parameter lain ada di komentar atas `public/app.js` (misalnya `&speed=4`, `&tema=negara`,
`&bumi=siang`, `&debug=1`). Cahaya Bumi bawaan `nyata`: siang dan malam mengikuti jam sekarang.

Kalau koneksi ke TikTok sering gagal karena batas kuota, buat API key gratis di
eulerstream.com lalu jalankan dengan `EULER_API_KEY=... npm start -- bayangin.3d`.

## Aturan main

- Pilihan jawaban **terkunci** di awal soal. Penonton menebak tanpa pilihan; pilihan terbuka
  setelah soal itu dapat 200 like (atau ada gift sedang). Soal Benar/Mitos selalu terbuka.
- Ketik teks jawabannya. Huruf besar-kecil, tanda baca, dan typo kecil dimaafkan. Angka harus
  persis. Ejaan lain per soal diatur lewat `alias`.
- Maksimal 3 tebakan per soal. Sekali benar, jawaban terkunci.
- Skor: dasar mudah 100, sedang 150, sulit 200, plus bonus cepat sampai +50% (penuh di
  detik pertama, nol di detik terakhir). Benar 3 kali beruntun atau lebih: +50 per soal.
- Target like diatur di `hintLikes` (`public/engine.js`), atau sementara lewat URL `?like=150`.
- Follow dan share memunculkan ucapan terima kasih.

### Gift

Tingkat gift dihitung dari nilai koinnya. Nilai koin **tidak pernah tampil di layar**; yang tampil
foto profil, nama, nama gift, dan boost-nya.

| Tingkat | Koin | Boost | Tampilan |
|---|---|---|---|
| Kecil | 1-9 | poin x2 untuk 1 soal | kartu meluncur di slot bawah |
| Sedang | 10-99 | poin x2 untuk 3 soal, membuka pilihan jawaban atas nama pemberi (kalau sudah terbuka: dua pilihan salah dicoret) | kartu lebih besar di slot bawah |
| Besar | 100+ | poin x3 untuk 3 soal, timer menjawab berhenti selama sorotan | pita "Sultan Masuk" di slot bawah, bingkai layar menyala |

Semua sorotan muncul di slot bawah (tempat klasemen mini), jadi soal dan pilihan tidak pernah
tertutup. Tiap sorotan punya animasi masuk dan SFX sendiri (whoosh, power-up, kilau; gift besar
ditambah hantaman), dibuat `scripts/make-sfx.py`.

Boost hanya mengalikan poin jawaban yang **benar**; jawaban salah tetap 0. Boost terpakai satu per
soal yang dijawab. Saat fase vote, gift menambah bobot suara pemberinya. Pemberi gift masuk
daftar Pendukung Live di halaman klasemen. Ambang koin dan boost diatur di `giftTiers`.

Catatan kebijakan: TikTok membatasi live yang dianggap memancing gift secara tidak wajar
("inorganic gift solicitation"). Layar kuis ini tidak pernah menulis ajakan "kirim gift untuk
boost"; penonton tahu dari sorotan yang muncul. Hindari mengucapkan ajakan seperti itu di live.

### Alur ronde

Sekitar 7 menit: cara main, 10 soal (4 mudah, 4 sedang, 2 sulit), papan skor setelah soal 5,
podium juara ronde, klasemen live, lalu **vote tema** ronde berikutnya (15 detik, penonton
mengetik nama topik, terbanyak menang). Setiap ronde satu topik penuh. Topik: sains, sejarah, olahraga,
sepak bola, anime & manga, musik Indonesia, bahasa Inggris, kampus, pengetahuan umum, tebak negara,
tebak provinsi, tebak bendera. Soal tiap topik dirotasi: semua soal satu tingkat keluar dulu sebelum
ada yang terulang (soal peta juga).
Kartu topik di layar vote memakai warna dan ikon per topik (`public/topics.js`, ikon digambar sendiri). Semua angka bisa
diubah di `DEFAULTS` pada `public/engine.js`.

### Tebak negara dan provinsi

Soal dibuat otomatis dari peta: wilayah jawaban disorot, tiga pengecoh diambil dari wilayah
terdekat. Data: Natural Earth (86 negara terpilih, domain publik) dan peta 38 provinsi
(CC BY 4.0, atribusi di `scripts/data/SUMBER.md` dan di pojok peta). Nama, ibu kota, tingkat,
dan ejaan lain ada di `scripts/build-geo.mjs`; jalankan `npm run geo` setelah mengubahnya.
Tebak Bendera memakai SVG dari `flag-icons` (MIT, `public/flags/LICENSE-flag-icons.txt`); saat jawaban
dibuka, lokasi negaranya ditunjukkan di peta.

## Menambah soal

Edit `public/questions.js`. Tiap soal butuh fakta dan sumber. Opsi maksimal 3 kata dan 22
huruf. Lalu jalankan `npm test`: tes menolak soal yang opsinya bisa tertukar saat diketik.

## Render dan cek

```bash
npm run stills -- out/stills        # still tiap fase
npm run preview -- out/preview.mp4  # klip preview ~80 detik dengan audio
```

## Isi folder

| File | Isi |
|---|---|
| `server.js` | Server lokal, relay event TikTok (`tiktok-live-connector`, tidak resmi) ke halaman |
| `public/engine.js` | Mesin kuis: fase, pencocokan jawaban, skor, klasemen |
| `public/questions.js` | Bank soal |
| `public/ui.js` | Tampilan per fase; animasi dihitung dari waktu, bukan CSS |
| `public/globe.js` | Bumi three.js, tekstur NASA (domain publik) |
| `public/sfx/` | SFX Kenney Interface Sounds (CC0) dan musik latar prosedural (`scripts/make-music.py`) |
| `public/data/map.json` | Peta Natural Earth (domain publik), dibuat `scripts/build-map.mjs` |
| `public/data/geo.json`, `public/geoquiz.js` | Data dan generator soal tebak negara / provinsi |
| `design/` | Mockup still dan latar awal |
