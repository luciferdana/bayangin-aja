# Kuis Bayangin Aja (TikTok LIVE)

Kuis otomatis penuh untuk live @bayangin.3d. Penonton mengetik jawaban di komentar, layar
menampilkan soal, timer, jawaban, 3 tercepat, papan skor, podium, dan klasemen live.
Latarnya Bumi yang berputar real-time, siang dan malamnya mengikuti jam sekarang.

## Menjalankan di laptop

Butuh Node.js 20 atau lebih baru.

```bash
cd live-quiz
npm install
npm start -- bayangin.3d      # server + baca komentar TikTok LIVE akun ini
```

Lalu di OBS atau TikTok LIVE Studio tambahkan **Browser Source**:

- URL `http://localhost:8787`, ukuran **1080 x 1920**, 30 fps
- centang "Control audio via OBS" supaya musik dan SFX ikut tersiar

Server bisa dinyalakan sebelum live dimulai. Kalau akun belum live, server menunggu dan
mencoba lagi sendiri. Kalau koneksi terputus, server juga menyambung ulang sendiri.

Uji tanpa live: `npm start`, lalu buka `http://localhost:8787/?sim=1` (penonton palsu).
Parameter lain ada di komentar atas `public/app.js` (misalnya `&speed=4`, `&tema=negara`,
`&bumi=siang`, `&debug=1`). Cahaya Bumi bawaan `nyata`: siang dan malam mengikuti jam sekarang.

Kalau koneksi ke TikTok sering gagal karena batas kuota, buat API key gratis di
eulerstream.com lalu jalankan dengan `EULER_API_KEY=... npm start -- bayangin.3d`.

## Aturan main

- Ketik teks jawaban persis seperti pilihan di layar. Huruf besar-kecil, tanda baca, dan typo
  kecil dimaafkan. Angka harus persis. Ejaan lain per soal diatur lewat `alias`.
- Maksimal 3 tebakan per soal. Sekali benar, jawaban terkunci.
- Skor: dasar mudah 100, sedang 150, sulit 200, plus bonus cepat sampai +50% (penuh di
  detik pertama, nol di detik terakhir). Benar 3 kali beruntun atau lebih: +50 per soal.
- 100 like dalam satu soal membuka bantuan 50:50 (dua pilihan salah dicoret).
- Follow dan share memunculkan ucapan terima kasih.

### Gift

Tingkat gift dihitung dari nilai koinnya. Nilai koin **tidak pernah tampil di layar**; yang tampil
foto profil, nama, nama gift, dan boost-nya.

| Tingkat | Koin | Boost | Tampilan |
|---|---|---|---|
| Kecil | 1-9 | poin x2 untuk 1 soal | kartu di area bawah |
| Sedang | 10-99 | poin x2 untuk 3 soal, bantuan 50:50 dibuka atas nama pemberi | kartu besar |
| Besar | 100+ | poin x3 untuk 3 soal, timer menjawab berhenti selama sorotan | layar penuh "Sultan Masuk" |

Boost hanya mengalikan poin jawaban yang **benar**; jawaban salah tetap 0. Boost terpakai satu per
soal yang dijawab. Saat fase vote, gift menambah bobot suara pemberinya. Pemberi gift masuk
daftar Pendukung Live di halaman klasemen. Ambang koin dan boost diatur di `giftTiers`.

Catatan kebijakan: TikTok membatasi live yang dianggap memancing gift secara tidak wajar
("inorganic gift solicitation"). Layar kuis ini tidak pernah menulis ajakan "kirim gift untuk
boost"; penonton tahu dari sorotan yang muncul. Hindari mengucapkan ajakan seperti itu di live.

### Alur ronde

Sekitar 7 menit: cara main, 10 soal (4 mudah, 4 sedang, 2 sulit), papan skor setelah soal 5,
podium juara ronde, klasemen live, lalu **vote tema** ronde berikutnya (15 detik, penonton
mengetik nama tema). Tema: campuran, sains, sejarah, olahraga, umum, tebak negara, tebak provinsi.
Ronde campuran selalu memuat satu soal tebak negara dan satu tebak provinsi. Semua angka bisa
diubah di `DEFAULTS` pada `public/engine.js`.

### Tebak negara dan provinsi

Soal dibuat otomatis dari peta: wilayah jawaban disorot, tiga pengecoh diambil dari wilayah
terdekat. Data: Natural Earth (86 negara terpilih, domain publik) dan peta 38 provinsi
(CC BY 4.0, atribusi di `scripts/data/SUMBER.md` dan di pojok peta). Nama, ibu kota, tingkat,
dan ejaan lain ada di `scripts/build-geo.mjs`; jalankan `npm run geo` setelah mengubahnya.

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
