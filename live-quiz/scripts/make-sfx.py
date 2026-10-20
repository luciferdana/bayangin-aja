"""SFX prosedural untuk sorotan gift: whoosh, impact, powerup, sparkle.

Dibuat sendiri (tanpa lisensi pihak lain), puncak -1 dBFS seperti SFX Kenney lainnya.
Hasil: public/sfx/{whoosh,impact,powerup,sparkle}.ogg

    python3 scripts/make-sfx.py
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sfx'
rng = np.random.default_rng(11)


def t_of(sec):
    return np.arange(int(sec * SR)) / SR


def env(t, attack, decay):
    return np.minimum(1, t / attack) * np.exp(-np.maximum(0, t - attack) / decay)


def bandpass_sweep(noise, f0, f1, q=2.5):
    """Noise lewat filter bandpass state-variable yang frekuensinya bergeser f0 -> f1."""
    n = len(noise)
    f = f0 * (f1 / f0) ** (np.arange(n) / n)
    out = np.zeros(n)
    low = band = 0.0
    damp = 1 / q
    for i in range(n):
        g = 2 * np.sin(np.pi * f[i] / SR)
        high = noise[i] - low - damp * band
        band += g * high
        low += g * band
        out[i] = band
    return out


def whoosh():
    # Udara lewat cepat: noise bandpass naik lalu turun, sedikit stereo-ish lewat dua lapis.
    t = t_of(0.55)
    noise = rng.standard_normal(len(t))
    up = bandpass_sweep(noise, 300, 3200)
    shape = np.sin(np.pi * np.clip(t / 0.55, 0, 1)) ** 2.2
    shape *= np.where(t < 0.3, 1, np.exp(-(t - 0.3) / 0.09))
    return up * shape


def impact():
    # Hantaman untuk gift besar: sub turun + klik + ekor noise gelap.
    t = t_of(1.4)
    f = 110 * np.exp(-t / 0.08) + 42
    phase = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(phase) * env(t, 0.004, 0.45)
    click = rng.standard_normal(len(t)) * env(t, 0.0005, 0.012)
    tail = bandpass_sweep(rng.standard_normal(len(t)), 900, 140, q=1.2) * env(t, 0.01, 0.35) * 0.8
    return sub * 1.0 + click * 0.5 + tail


def powerup():
    # Boost: arpeggio naik cepat (C mayor) dengan nada persegi lembut.
    notes = [72, 76, 79, 84, 88]
    step = 0.055
    t = t_of(step * len(notes) + 0.45)
    out = np.zeros(len(t))
    for k, m in enumerate(notes):
        hz = 440 * 2 ** ((m - 69) / 12)
        tt = t - k * step
        on = tt >= 0
        tt = np.where(on, tt, 0)
        tone = sum(np.sin(2 * np.pi * hz * h * tt) / h for h in (1, 3, 5, 7)) * 0.6
        tone += 0.4 * np.sin(2 * np.pi * hz * 2.003 * tt)
        dec = 0.35 if k == len(notes) - 1 else 0.09
        out += np.where(on, tone * env(tt, 0.003, dec), 0)
    return out


def sparkle():
    # Kilau: denting-denting tinggi acak yang memudar.
    t = t_of(1.2)
    out = np.zeros(len(t))
    for k in range(14):
        start = k * 0.055 + rng.uniform(0, 0.03)
        hz = rng.choice([2093, 2349, 2637, 3136, 3520, 4186])
        tt = t - start
        on = tt >= 0
        tt = np.where(on, tt, 0)
        bell = np.sin(2 * np.pi * hz * tt) + 0.35 * np.sin(2 * np.pi * hz * 2.76 * tt)
        out += np.where(on, bell * env(tt, 0.002, 0.16) * (1 - k / 18), 0)
    return out


def write(name, x):
    fade = min(len(x), int(0.02 * SR))
    x = x.copy()
    x[-fade:] *= np.linspace(1, 0, fade)
    x = x / np.max(np.abs(x)) * 10 ** (-1 / 20)
    tmp = OUT / f'{name}.wav'
    with wave.open(str(tmp), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(tmp), '-c:a', 'libvorbis', '-q:a', '5',
                    str(OUT / f'{name}.ogg')], check=True)
    tmp.unlink()
    print(f'{name}.ogg: {len(x) / SR:.2f} dtk')


for name, fn in [('whoosh', whoosh), ('impact', impact), ('powerup', powerup), ('sparkle', sparkle)]:
    write(name, fn())
