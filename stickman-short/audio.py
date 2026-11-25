#!/usr/bin/env python3
"""Cue-table audio for "Influencer During the Apocalypse" -> music.wav + sfx.wav.
Frames = 815 @ 30fps => DUR 27.17 s. Cues are aligned to the phrase timings from
tools/timing.py (see work/phrases.json). Mixed later by tools/mix.py (voice-relative).
"""
import numpy as np, os, wave

SR = 48000
FRAMES = int(os.environ.get("FRAMES", "815"))
DUR = FRAMES / 30
N = int(DUR * SR)
rng = np.random.default_rng(7)

def lp_fast(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x)).astype(np.float32)

def place(buf, sig, t0, gain=1.0):
    i = int(t0 * SR); j = min(N, i + len(sig))
    if i < N and j > i: buf[i:j] += sig[: j - i] * gain

def boom(f0=48.0, dur=1.2):
    t = np.arange(int(dur * SR)) / SR
    f = f0 * np.exp(-t * 1.6) + 29
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2) * (1 - np.exp(-t * 90))).astype(np.float32)

def hit(dur=0.25):
    t = np.arange(int(dur * SR)) / SR
    return (rng.standard_normal(int(dur * SR)) * np.exp(-t * 26) * 0.7 +
            np.sin(2 * np.pi * 190 * t) * np.exp(-t * 20) * 0.5).astype(np.float32)

def whoosh(dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    X = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR)
    fc = 300 + 1900 * (t / dur) ** 1.5
    band = np.exp(-((f - fc.mean()) ** 2) / (2 * 1200 ** 2)) * np.clip(f / 400, 0, 1)
    X *= band
    s = np.fft.irfft(X, n).astype(np.float32)
    m = np.abs(s).max()
    return (s * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.4 / (m if m > 0 else 1)).astype(np.float32)

def growl(dur=0.9, f0=70.0):
    n = int(dur * SR); t = np.arange(n) / SR
    wob = 1 + 0.25 * np.sin(2 * np.pi * 5.5 * t)
    body = np.sin(2 * np.pi * f0 * wob * t) + 0.5 * np.sin(2 * np.pi * (f0 * 1.5) * t + 0.7)
    noise = lp_fast(rng.standard_normal(n), 600) * 0.6
    e = np.minimum(1, t / 0.08) * np.exp(-t / (dur * 0.55))
    return ((body * 0.6 + noise) * e).astype(np.float32)

def step(dur=0.12):
    t = np.arange(int(dur * SR)) / SR
    return (lp_fast(rng.standard_normal(int(dur * SR)), 900) * np.exp(-t * 30) * 0.8).astype(np.float32)

def phone_beep(dur=0.16):
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2 * np.pi * 1320 * t) * np.exp(-t * 22) * 0.5).astype(np.float32)

def heartbeat(dur=0.5):
    t = np.arange(int(dur * SR)) / SR
    a = np.sin(2 * np.pi * 60 * t) * np.exp(-t * 22)
    b = np.sin(2 * np.pi * 54 * (t - 0.22)) * np.exp(-np.maximum(0, t - 0.22) * 22) * (t > 0.22)
    return ((a + b) * 0.9).astype(np.float32)

# ---------------- music bed: low tension drone + sparse pulse, hard-stops for the punchline
music = np.zeros(N, np.float32)
t_all = np.arange(N) / SR
pad = (np.sin(2 * np.pi * 55 * t_all) + 0.6 * np.sin(2 * np.pi * 82.4 * t_all + 1.1) +
       0.35 * np.sin(2 * np.pi * 110 * t_all + 0.5)) / 2.6
music += (pad * lp_fast(rng.standard_normal(N) * 0.4 + 1, 280)).astype(np.float32) * 0.45
for b in np.arange(7.1, 12.2, 1.3):                 # chase stabs
    place(music, boom(34, 0.7), b, 0.32)
for b in np.arange(2.0, 6.9, 1.15):                 # comic staccato
    place(music, hit(0.16), b, 0.10)
music[int(26.2 * SR):] = 0.0                        # sudden silence before the punchline

# ---------------- sfx cues (one line per event, t in seconds)
sfx = np.zeros(N, np.float32)
place(sfx, whoosh(0.6), 0.0, 0.5)
for s in [0.15, 0.42, 0.70, 0.98, 1.26, 1.55]:
    place(sfx, step(), s, 0.5)
place(sfx, growl(1.0, 66), 0.35, 0.45)
place(sfx, growl(0.9, 60), 1.10, 0.35)
place(sfx, phone_beep(), 0.30, 0.35)
for s in [2.10, 2.75, 3.40, 4.05, 4.70, 5.40, 6.10, 6.75]:
    place(sfx, step(), s, 0.35)
place(sfx, phone_beep(), 2.05, 0.22)
place(sfx, hit(), 7.13, 0.7)
for s in np.arange(7.2, 12.2, 0.26):
    place(sfx, step(), s, 0.55)
place(sfx, growl(1.1, 74), 7.5, 0.7)
place(sfx, growl(1.0, 68), 9.2, 0.65)
place(sfx, growl(1.2, 72), 11.0, 0.7)
place(sfx, whoosh(0.5), 10.7, 0.5)
place(sfx, hit(), 12.39, 0.6)
place(sfx, heartbeat(), 12.6, 0.55)
place(sfx, heartbeat(), 13.3, 0.40)
place(sfx, growl(0.8, 58), 14.0, 0.30)
place(sfx, phone_beep(), 15.82, 0.4)
place(sfx, hit(0.14), 16.57, 0.22)
place(sfx, phone_beep(), 19.7, 0.2)
place(sfx, growl(1.4, 52), 21.1, 0.45)
place(sfx, heartbeat(), 23.0, 0.5)
place(sfx, hit(), 23.91, 0.4)
place(sfx, whoosh(0.7), 25.9, 0.5)

for name, buf in (("music.wav", music), ("sfx.wav", sfx)):
    buf = buf / max(1e-9, np.abs(buf).max()) * 0.9
    w = wave.open(name, "w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((buf * 32767).astype(np.int16).tobytes()); w.close()
    print("wrote", name, "%.2f s" % (len(buf) / SR))
