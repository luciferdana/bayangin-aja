# Kuis Bayangin Aja (TikTok LIVE)

Kuis otomatis penuh untuk live @bayangin.3d. Penonton mengetik jawaban di komentar, layar
menampilkan soal, timer, jawaban, 3 tercepat, papan skor, podium, dan klasemen live.
Latarnya Bumi yang berputar real-time di garis senja.

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
Parameter lain ada di komentar atas `public/app.js` (misalnya `&speed=4`, `&q=komodo`, `&debug=1`).

Kalau koneksi ke TikTok sering gagal karena batas kuota, buat API key gratis di
eulerstream.com lalu jalankan dengan `EULER_API_KEY=... npm start -- bayangin.3d`.

## Aturan main

- Ketik teks jawaban persis seperti pilihan di layar. Huruf besar-kecil, tanda baca, dan typo
  kecil dimaafkan. Angka harus persis. Ejaan lain per soal diatur lewat `alias`.
- Maksimal 3 tebakan per soal. Sekali benar, jawaban terkunci.
- Skor: dasar mudah 100, sedang 150, sulit 200, plus bonus cepat sampai +50% (penuh di
  detik pertama, nol di detik terakhir). Benar 3 kali beruntun atau lebih: +50 per soal.
- 100 like dalam satu soal membuka bantuan 50:50 (dua pilihan salah dicoret).
- Gift dan follow hanya memunculkan ucapan terima kasih, tidak memengaruhi skor.

Alur satu ronde (sekitar 7 menit): cara main, 10 soal (4 mudah, 4 sedang, 2 sulit), papan skor
setelah soal 5, podium juara ronde, klasemen live, lalu ronde baru. Soal tidak berulang sampai
bank habis. Semua angka bisa diubah di `DEFAULTS` pada `public/engine.js`.

## Menambah soal

Edit `public/questions.js`. Tiap soal butuh fakta dan sumber. Opsi maksimal 3 kata dan 22
huruf. Lalu jalankan `npm test`: tes menolak soal yang opsinya bisa tertukar saat diketik.

## Render dan cek

```bash
npm run stills -- out/stills        # still tiap fase
npm run preview -- out/preview.mp4  # klip preview ~50 detik dengan audio
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
| `design/` | Mockup still dan latar awal |
