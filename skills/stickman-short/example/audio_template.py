#!/usr/bin/env python3
"""Cue-table audio for a stick-man short -> music.wav + sfx.wav (mixed later by mix.py).
Rewrite the cue tables for the story. DUR = frames/30 (keep picture timing locked first)."""
import numpy as np, subprocess, os

SR = 48000
FRAMES = int(os.environ.get("FRAMES", "810"))       # total frames of the short
DUR = FRAMES / 30
N = int(DUR * SR)
rng = np.random.default_rng(7)

def lp_fast(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x)).astype(np.float32)

def env(n, a=0.01, r=0.3):
    t = np.arange(n) / SR
    return (np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)).astype(np.float32)

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
    X *= np.clip(fc[f] / 400, 0, 1) * np.exp(-((f - fc.mean()) ** 2) / (2 * 900 ** 2))
    s = np.fft.irfft(X, n).astype(np.float32)
    return (s * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.4 / np.abs(s).max()).astype(np.float32)

# ---------------- music bed: low tension pad + sparse pulse (rewrite per story)
music = np.zeros(N, np.float32)
t_all = np.arange(N) / SR
pad = (np.sin(2 * np.pi * 55 * t_all) + 0.6 * np.sin(2 * np.pi * 82.4 * t_all + 1.1) +
       0.35 * np.sin(2 * np.pi * 110 * t_all + 0.5)) / 2.6
music += (pad * lp_fast(rng.standard_normal(N) * 0.4 + 1, 300)).astype(np.float32) * 0.5
for beat in np.arange(0, DUR, 2.0):                    # sparse pulse
    music += place(music, boom(38, 0.8), beat, 0.25) if False else 0
music = lp_fast(music * 0.8, 900)

# ---------------- sfx cues (rewrite: one line per event, t in seconds)
sfx = np.zeros(N, np.float32)
# place(sfx, boom(),  0.10, 0.8)   # cold-open thud
# place(sfx, hit(),   3.20, 0.5)   # knock
# place(sfx, whoosh(),6.10, 0.4)   # move

np.save  # (no-op; keep imports obvious)
import wave
for name, buf in (("music.wav", music), ("sfx.wav", sfx)):
    buf = buf / max(1e-9, np.abs(buf).max()) * 0.9
    w = wave.open(name, "w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((buf * 32767).astype(np.int16).tobytes()); w.close()
    print("wrote", name, "%.2f s" % (len(buf) / SR))
