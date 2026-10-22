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
Tombol 1 sampai 5 mengirim gift uji senilai 1, 5, 10, 30, dan 100 koin. Tema terang bisa diuji
cepat dengan `&tapgoal=300` (ganti tema tiap 300 like, bukan 10.000).
Parameter lain ada di komentar atas `public/app.js` (misalnya `&speed=4`, `&tema=negara`,
`&bumi=siang`, `&debug=1`). Cahaya Bumi bawaan `nyata`: siang dan malam mengikuti jam sekarang.

Kalau koneksi ke TikTok sering gagal karena batas kuota, buat API key gratis di
eulerstream.com lalu jalankan dengan `EULER_API_KEY=... npm start -- bayangin.3d`.

## Aturan main

- Pilihan jawaban **terkunci** di awal soal. Penonton menebak tanpa pilihan; pilihan terbuka
  setelah soal itu dapat 70 like. Soal Benar/Mitos selalu terbuka.
- Ketik teks jawabannya. Huruf besar-kecil, tanda baca, dan typo kecil dimaafkan. Angka harus
  persis. Ejaan lain per soal diatur lewat `alias`.
- Maksimal 3 tebakan per soal. Sekali benar, jawaban terkunci.
- Skor: dasar mudah 100, sedang 150, sulit 200, plus bonus cepat sampai +50% (penuh di
  detik pertama, nol di detik terakhir). Benar 3 kali beruntun atau lebih: +50 per soal.
- Target like diatur di `hintLikes` (`public/engine.js`), atau sementara lewat URL `?like=150`.
- Setiap kelipatan **10.000 like** (tap tap), tampilan berganti gelap ke terang lewat sapuan
  "10.000 TAP TAP! GANTI TEMA", lalu kembali gelap di 20.000, terang lagi di 30.000, dan
  seterusnya. Hitungan mulai dari nol tiap halaman dimuat ulang. Diatur di `themeLikes`.
- Follow dan share memunculkan ucapan terima kasih.

### Gift

Tingkat gift dihitung dari nilai koinnya. Nilai koin **tidak pernah tampil di layar**; yang tampil
foto profil, nama, nama gift, dan boost-nya.

| Koin (satu kiriman/combo) | Boost | Tampilan |
|---|---|---|
| 1-4 | poin x1,5 untuk 1 soal | kartu di slot bawah |
| 5-9 | poin x2 untuk 2 soal | kartu di slot bawah |
| 10-29 | poin x2,5 dan +2 jatah tebakan untuk 3 soal | kartu lebih besar di slot bawah |
| 30-99 | poin x3 dan +2 tebakan untuk 3 soal, timer menjawab berhenti | takeover sultan dengan musik |
| 100+ | poin x5 dan +2 tebakan untuk 5 soal, timer berhenti, **pilih topik ronde berikutnya** | takeover sultan dengan musik |

**Pilih topik (100 koin ke atas):** komentar pengirimnya yang menyebut nama topik langsung
mengunci topik ronde berikutnya. Vote dilewati dan diganti pengumuman "Topik Pilihan Sultan"
(kartu dibalik lalu dicap namanya). Kalau dia mengetik saat vote berjalan, vote langsung berhenti.
Saat soal berjalan, jawaban soal tetap didahulukan. Kalau ada beberapa pengirim, yang pertama
memilih dulu dan yang lain mengantre ke ronde-ronde berikutnya. Hak yang tidak dipakai gugur
setelah dua kali vote.

Semua sorotan muncul di slot bawah (tempat klasemen mini), jadi soal dan pilihan tidak pernah
tertutup. Tiap sorotan punya animasi masuk dan SFX sendiri (whoosh, power-up, kilau; gift besar
ditambah hantaman), dibuat `scripts/make-sfx.py`.

Boost hanya mengalikan poin jawaban yang **benar**; jawaban salah tetap 0. Boost terpakai satu per
soal yang dijawab. Vote topik satu orang satu suara; gift tidak menambah suara. Pemberi gift masuk
daftar Pendukung Live di halaman klasemen. Ambang koin dan boost diatur di `giftTiers`.

Catatan kebijakan: TikTok membatasi live yang dianggap memancing gift secara tidak wajar
("inorganic gift solicitation"). Info bonus pendukung hanya muncul di jeda (papan skor setelah
soal 5, klasemen akhir ronde, dan layar pilih topik), nadanya informatif, dan selalu ditemani
"nggak kirim gift? tetap bisa juara". Tidak ada ajakan "kirim gift sekarang" di layar. Hindari
mengucapkan ajakan seperti itu di live.

### Alur ronde

Sekitar 7 menit: cara main, 10 soal (4 mudah, 4 sedang, 2 sulit), papan skor setelah soal 5
(15 detik), podium juara ronde, klasemen live (15 detik), lalu **vote tema** ronde berikutnya
(30 detik, penonton mengetik nama topik atau huruf kartunya A/K/Q/J, terbanyak menang; komentar
yang menyebut dua topik dihitung ke topik yang disebut pertama). Semua topik kebagian main
sekali sebelum ada topik yang ditawarkan lagi. Giliran soal dan topik disimpan di browser, jadi
live berikutnya melanjutkan, bukan mulai dari soal yang sama. Setiap ronde satu topik penuh. Topik: sains, sejarah, olahraga,
sepak bola, anime & manga, musik Indonesia (lagu kekinian), musik barat, bahasa Inggris,
matematika, kampus, pengetahuan umum, tebak negara, tebak provinsi, tebak bendera, ibu kota
provinsi, ibu kota dunia. Soal tiap topik dirotasi: semua soal satu tingkat keluar dulu sebelum
ada yang terulang (soal peta juga). Soal matematika dibuat acak setiap tampil (`public/mtk.js`),
jadi tidak bisa dihafal.

Soal bertanda `jebakan: true` (pertanyaan yang menggiring ke jawaban yang terasa benar padahal
salah) keluar paling depan di ronde pertama topiknya, lalu soal bertanda `baru: true`, baru
setelah itu rotasi acak biasa.
Kartu topik di layar vote memakai warna dan ikon per topik (`public/topics.js`, ikon digambar sendiri). Semua angka bisa
diubah di `DEFAULTS` pada `public/engine.js`.

### Tebak negara dan provinsi

Soal dibuat otomatis dari peta: wilayah jawaban disorot, tiga pengecoh diambil dari wilayah
terdekat. Data: Natural Earth (86 negara terpilih, domain publik) dan peta 38 provinsi
(CC BY 4.0, atribusi di `scripts/data/SUMBER.md` dan di pojok peta). Nama, ibu kota, tingkat,
dan ejaan lain ada di `scripts/build-geo.mjs`; jalankan `npm run geo` setelah mengubahnya.
Ibu Kota Provinsi (33 provinsi) dan Ibu Kota Dunia (84 negara) memakai data yang sama: wilayahnya
disorot di peta, opsinya ibu kota wilayah terdekat. Tingkat, ejaan lain, dan fakta khusus (misalnya
Canberra, Ankara, Banjarbaru) ada di `public/geoquiz.js`.
Tebak Bendera memakai SVG dari `flag-icons` (MIT, `public/flags/LICENSE-flag-icons.txt`); saat jawaban
dibuka, lokasi negaranya ditunjukkan di peta.

## Menambah soal

Edit `public/questions.js`. Tiap soal butuh fakta dan sumber. Soal yang diberi `baru: true` keluar lebih dulu
(sebelum soal lama yang belum tampil, dan di awal ronde) sampai masing-masing pernah tampil sekali. Opsi maksimal 3 kata dan 22
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
