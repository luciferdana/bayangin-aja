"""Musik latar prosedural untuk kuis live: loop 60 detik yang menyambung mulus.

Dm - Bb - F - C, 96 BPM. Pad lembut + arpeggio tipis + sub, reverb konvolusi.
Hasil: public/sfx/bed.ogg, dinormalkan ke sekitar -26 LUFS supaya tetap di bawah SFX.

    python3 scripts/make-music.py
"""
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
LOOP_BARS = 24
LOOP = LOOP_BARS * BAR  # 60 detik
TAIL = 5.0
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sfx' / 'bed.ogg'
TARGET_LUFS = -26.0

rng = np.random.default_rng(5)
n_total = int((LOOP + TAIL) * SR)
t_all = np.arange(n_total) / SR


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# Dm, Bb, F, C (nada MIDI), tiap akor 2 birama
CHORDS = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60]]


def soft_saw(freq, t, harmonics=10, tilt=1.6):
    out = np.zeros_like(t)
    for h in range(1, harmonics + 1):
        if freq * h > 9000:
            break
        out += np.sin(2 * np.pi * freq * h * t) / h ** tilt
    return out


def env(n, attack, release):
    e = np.ones(n)
    a = int(attack * SR)
    r = int(release * SR)
    e[:a] = np.linspace(0, 1, a) ** 2
    e[-r:] *= np.linspace(1, 0, r) ** 2
    return e


left = np.zeros(n_total)
right = np.zeros(n_total)


def add(sig, start, gain, pan=0.0):
    i = int(start * SR)
    j = min(n_total, i + len(sig))
    sig = sig[: j - i] * gain
    left[i:j] += sig * np.sqrt(0.5 * (1 - pan))
    right[i:j] += sig * np.sqrt(0.5 * (1 + pan))


chord_len = 2 * BAR
for k in range(LOOP_BARS // 2):
    notes = CHORDS[k % len(CHORDS)]
    start = k * chord_len
    dur = chord_len + 1.6  # tumpang tindih antar akor
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = env(n, 1.4, 1.8)
    for v, m in enumerate(notes):
        f = midi_hz(m)
        for det, pan in ((-0.07, -0.6), (0.07, 0.6)):
            ff = f * 2 ** (det / 12)
            vib = 1 + 0.0015 * np.sin(2 * np.pi * 0.21 * t + v)
            add(soft_saw(ff, t * vib) * e, start, 0.05, pan)
    # sub
    root = midi_hz(notes[0] - 12)
    add(np.sin(2 * np.pi * root * t) * e, start, 0.10)

# Arpeggio seperdelapan, oktaf atas, sangat pelan, dengan gema
arp_l = np.zeros(n_total)
arp_r = np.zeros(n_total)
pattern = [0, 2, 1, 3, 2, 1, 3, 2]
for b in range(LOOP_BARS * 8):
    t0 = b * BEAT / 2
    chord = CHORDS[int(t0 // chord_len) % len(CHORDS)]
    m = chord[pattern[b % 8]] + 12
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    tone = (np.sin(2 * np.pi * midi_hz(m) * t) + 0.25 * np.sin(4 * np.pi * midi_hz(m) * t)) * np.exp(-t / 0.22)
    tone[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    accent = 1.0 if b % 2 == 0 else 0.7
    i = int(t0 * SR)
    j = min(n_total, i + n)
    pan = 0.35 if b % 2 else -0.35
    arp_l[i:j] += tone[: j - i] * accent * (1 - pan) * 0.5
    arp_r[i:j] += tone[: j - i] * accent * (1 + pan) * 0.5
delay = int(BEAT * 0.75 * SR)
for _ in range(4):
    arp_l[delay:] += arp_r[:-delay] * 0.35
    arp_r[delay:] += arp_l[:-delay] * 0.35
left += arp_l * 0.035
right += arp_r * 0.035

# Reverb: konvolusi dengan derau yang meluruh 3 detik
ir_n = int(3.0 * SR)
ir_t = np.arange(ir_n) / SR
decay = np.exp(-ir_t / 0.75)


def reverb(x, seed):
    ir = np.random.default_rng(seed).standard_normal(ir_n) * decay
    ir[0] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + ir_n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * 0.75 + y * 0.45


left = reverb(left, 1)
right = reverb(right, 2)

# Ekor setelah 60 detik dilipat ke awal supaya loop menyambung tanpa jeda.
n_loop = int(LOOP * SR)
for ch in (left, right):
    ch[: n_total - n_loop] += ch[n_loop:]
left = left[:n_loop]
right = right[:n_loop]

stereo = np.stack([left, right], axis=1)
stereo /= np.max(np.abs(stereo)) / 0.8
tmp = OUT.with_suffix('.wav')
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(tmp), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype('<i2').tobytes())

# Ukur loudness lalu atur gain secara linear (tanpa kompresi dinamis).
probe = subprocess.run(
    ['ffmpeg', '-nostdin', '-hide_banner', '-i', str(tmp), '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
    capture_output=True, text=True)
stats = json.loads(probe.stderr[probe.stderr.rindex('{'):])
gain = TARGET_LUFS - float(stats['input_i'])
subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(tmp), '-af', f'volume={gain:.2f}dB',
                '-c:a', 'libvorbis', '-q:a', '4', str(OUT)], check=True)
tmp.unlink()
print(f'{OUT.name}: {LOOP:.1f} dtk, input {stats["input_i"]} LUFS, gain {gain:+.1f} dB')
