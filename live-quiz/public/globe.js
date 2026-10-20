// Latar Bumi real-time: satu bola bertekstur NASA. Ringan: satu mesh, tiga tekstur.
// Mode cahaya:
//   nyata  posisi matahari sesuai jam sekarang (siang di sisi yang memang sedang siang)
//   siang  selalu terang dari kiri atas
//   senja  garis senja selalu membelah layar, lampu kota selalu terlihat
import * as THREE from './vendor/three.module.min.js';

const DEG = Math.PI / 180;
const HOME = { lat: -4, lon: 112 }; // Indonesia
const SPIN = 1.0; // derajat per detik saat bebas berputar

const earthVert = `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vUv = uv;
  vN = normalize((modelMatrix * vec4(normal, 0.)).xyz);
  vW = (modelMatrix * vec4(position, 1.)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.);
}`;

const earthFrag = `
uniform sampler2D day, night, clouds; uniform vec3 sun; uniform float cloudShift;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 N = normalize(vN);
  float d = dot(N, sun);
  float dayMix = smoothstep(-0.06, 0.18, d);
  vec3 dc = texture2D(day, vUv).rgb;
  vec3 nc = texture2D(night, vUv).rgb;
  vec4 cm = texture2D(clouds, vUv + vec2(cloudShift, 0.));
  float cl = cm.b;
  float rough = texture2D(clouds, vUv).g;
  vec3 V = normalize(cameraPosition - vW);
  vec3 H = normalize(sun + V);
  float spec = pow(max(dot(N, H), 0.), 40.) * (1. - rough) * 0.6;
  vec3 lit = dc * (0.08 + 1.1 * max(d, 0.)) + spec * vec3(1., .85, .6) * max(d, 0.);
  lit = mix(lit, vec3(1.) * (0.04 + 0.9 * max(d, 0.)), cl * 0.6);
  vec3 dark = nc * vec3(1.0, 0.78, 0.5) * 1.8 * (1. - cl * 0.7);
  vec3 col = mix(dark, lit, dayMix);
  float term = exp(-pow(d / 0.06, 2.)) * 0.22;
  col += vec3(1., .5, .22) * term * (0.25 + cl);
  float fres = pow(1. - max(dot(N, V), 0.), 3.);
  col += vec3(.35, .6, 1.) * fres * 0.6 * smoothstep(-0.2, 0.4, d);
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
}`;

const atmoFrag = `
uniform vec3 sun; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(1. - abs(dot(vN, V)), 2.2);
  float l = smoothstep(-0.35, 0.5, dot(normalize(vW), sun));
  vec3 c = mix(vec3(1., .42, .15), vec3(.35, .62, 1.), l);
  gl_FragColor = vec4(c * rim * 1.1 * (0.15 + l), 1.);
  #include <colorspace_fragment>
}`;

const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

// Arah titik (lintang, bujur) pada bola sebelum diputar, sesuai pemetaan UV SphereGeometry.
const surface = (lat, lon) => new THREE.Vector3(
  Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG));

// Titik di Bumi yang tepat di bawah matahari (tanpa koreksi equation of time, selisih < 4 derajat).
export function subsolar(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return { lat, lon: wrap(-15 * (hours - 12)) };
}

// Kamera di +Z, timur = +X.
const CAMERA_SUN = {
  senja: new THREE.Vector3(Math.sin(98 * DEG) * Math.cos(8 * DEG), Math.sin(8 * DEG), Math.cos(98 * DEG) * Math.cos(8 * DEG)),
  siang: new THREE.Vector3(-0.35, 0.5, 0.8).normalize(),
};

export class Globe {
  // date: fungsi waktu nyata (ms) -> Date, dipakai mode 'nyata'.
  constructor(canvas, { mode = 'nyata', date = () => new Date() } = {}) {
    this.canvas = canvas;
    this.mode = ['nyata', 'siang', 'senja'].includes(mode) ? mode : 'nyata';
    this.date = date;
    this.view = { ...HOME };
    this.ready = false;
  }

  async init() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(this.canvas.width, this.canvas.height, false);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, this.canvas.width / this.canvas.height, 0.01, 100);
    // Bola di bawah bingkai, cakrawala melengkung di sepertiga atas.
    this.camera.position.set(0, -0.55, 2.9);
    this.camera.lookAt(0, 0.62, 0.55);

    const loader = new THREE.TextureLoader();
    const load = (f, srgb = true) => new Promise((ok, fail) => loader.load(`tex/${f}`, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      t.wrapS = THREE.RepeatWrapping;
      ok(t);
    }, undefined, fail));
    const [day, night, clouds] = await Promise.all([
      load('earth_day_4096.jpg'), load('earth_night_4096.jpg'), load('earth_bump_roughness_clouds_4096.jpg', false)]);

    const sun = (CAMERA_SUN[this.mode] ?? CAMERA_SUN.senja).clone();
    this.sun = sun;
    this.uniforms = { day: { value: day }, night: { value: night }, clouds: { value: clouds }, sun: { value: sun }, cloudShift: { value: 0 } };
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 192),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: earthVert, fragmentShader: earthFrag }));
    this.scene.add(this.earth);
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 96), new THREE.ShaderMaterial({
      uniforms: { sun: { value: sun } }, vertexShader: earthVert, fragmentShader: atmoFrag,
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })));

    const pts = [];
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2500; i++) {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(40);
      pts.push(v.x, v.y, v.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, color: 0x9a968c })));
    this.ready = true;
  }

  // focus: { lat, lon } untuk soal lokasi, atau null untuk berputar bebas.
  // dt dalam milidetik; semua gerak bergantung dt sehingga render frame-per-frame tetap sama.
  update(dt, t, focus) {
    if (!this.ready) return;
    const k = 1 - Math.exp(-dt / 700);
    if (focus) {
      this.view.lon += wrap(focus.lon - this.view.lon) * k;
      this.view.lat += (focus.lat - this.view.lat) * k;
    } else {
      this.view.lon = wrap(this.view.lon + (SPIN * dt) / 1000);
      this.view.lat += (HOME.lat - this.view.lat) * (1 - Math.exp(-dt / 2500));
    }
    // Titik (lat, lon) menghadap kamera di +Z.
    this.earth.rotation.set(this.view.lat * DEG, -Math.PI / 2 - this.view.lon * DEG, 0);
    if (this.mode === 'nyata') {
      const ss = subsolar(this.date(t));
      this.sun.copy(surface(ss.lat, ss.lon).applyEuler(this.earth.rotation));
    }
    this.uniforms.cloudShift.value = (t / 1000) * 0.0009;
    this.renderer.render(this.scene, this.camera);
  }
}
