// Warna dan ikon tiap topik untuk kartu vote dan lencana topik.
// Ikon digambar sendiri (SVG garis), tanpa gambar berhak cipta.

const I = (body) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const TOPIC_STYLE = {
  sains: { color: '#2ec4b6', icon: I('<ellipse cx="32" cy="32" rx="26" ry="10"/><ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(120 32 32)"/><circle cx="32" cy="32" r="4" fill="currentColor"/>') },
  sejarah: { color: '#d4a24c', icon: I('<path d="M8 22 32 8l24 14Z"/><path d="M15 27v20M26 27v20M38 27v20M49 27v20"/><path d="M8 54h48M11 49h42"/>') },
  olahraga: { color: '#ff4d4d', icon: I('<path d="M20 9h24v13a12 12 0 0 1-24 0Z"/><path d="M20 13h-8a8 8 0 0 0 9 11M44 13h8a8 8 0 0 1-9 11"/><path d="M32 34v9M24 55h16M27 43h10v12H27Z"/>') },
  bola: { color: '#8bd450', icon: I('<circle cx="32" cy="32" r="25"/><path d="m32 22 9 7-3.5 11h-11L23 29Z"/><path d="M32 22V8M41 29l13-5M37.5 40l8 12M26.5 40l-8 12M23 29l-13-5"/>') },
  anime: { color: '#ff5fa2', icon: I('<path d="M32 4 38 26 60 32 38 38 32 60 26 38 4 32 26 26Z"/><circle cx="32" cy="32" r="5"/>') },
  musik: { color: '#a77bff', icon: I('<path d="M24 46V12l26-6v34"/><circle cx="17" cy="46" r="7"/><circle cx="43" cy="40" r="7"/>') },
  inggris: { color: '#e07a5f', icon: I('<path d="M8 10h48v32H30l-12 11V42H8Z"/><path d="m21 35 8-18 8 18M24 29h10"/><path d="M43 22v13M43 27a5 5 0 1 1 0 6"/>') },
  kampus: { color: '#b08968', icon: I('<path d="M4 24 32 12l28 12-28 12Z"/><path d="M16 30v13c0 4 8 8 16 8s16-4 16-8V30"/><path d="M56 26v15"/><circle cx="56" cy="45" r="2.5" fill="currentColor"/>') },
  umum: { color: '#f2d649', icon: I('<path d="M22 40a16 16 0 1 1 20 0v6H22Z"/><path d="M24 52h16M27 58h10"/>') },
  negara: { color: '#ff8a3d', icon: I('<circle cx="32" cy="32" r="25"/><ellipse cx="32" cy="32" rx="11" ry="25"/><path d="M8 24h48M8 40h48"/>') },
  provinsi: { color: '#2fbf71', icon: I('<path d="M32 58s18-18 18-32a18 18 0 0 0-36 0c0 14 18 32 18 32Z"/><circle cx="32" cy="26" r="6"/>') },
  bendera: { color: '#e8505b', icon: I('<path d="M14 58V8"/><path d="M14 10h34l-7 10 7 10H14"/>') },
  campuran: { color: '#c9c4b8', icon: I('<path d="M8 20h12l24 24h12M8 44h12l24-24h12"/><path d="m50 14 6 6-6 6M50 38l6 6-6 6"/>') },
};

export const topicStyle = (id) => TOPIC_STYLE[id] ?? TOPIC_STYLE.campuran;
