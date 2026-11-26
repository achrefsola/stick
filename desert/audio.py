#!/usr/bin/env python3
"""Cue-table audio for "Would You Walk or Wait?" -> music.wav + sfx.wav.

Frames = 1770 @ 30fps => DUR 59.0 s. Cues are aligned to the word timings from
faster-whisper (see work/words_fw.json / work/PLAN.md). Mixing is done later by
tools/mix.py which holds the level contract (music/sfx = 50 % of the voice).
"""
import numpy as np, os, wave

SR = 48000
FRAMES = int(os.environ.get("FRAMES", "1770"))
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

def boom(f0=46.0, dur=1.3):            # the crash / a heavy low hit
    t = np.arange(int(dur * SR)) / SR
    f = f0 * np.exp(-t * 1.5) + 28
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.0) * (1 - np.exp(-t * 80))).astype(np.float32)

def hit(dur=0.25):                     # a dry transient
    t = np.arange(int(dur * SR)) / SR
    return (rng.standard_normal(int(dur * SR)) * np.exp(-t * 26) * 0.7 +
            np.sin(2 * np.pi * 180 * t) * np.exp(-t * 20) * 0.5).astype(np.float32)

def lowhit(dur=1.6):                   # the sting: a floor-shaking sub thud
    t = np.arange(int(dur * SR)) / SR
    f = 40 * np.exp(-t * 2.2) + 22
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2) * (1 - np.exp(-t * 60))).astype(np.float32)

def whoosh(dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    X = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR)
    fc = 300 + 1900 * (t / dur) ** 1.5
    band = np.exp(-((f - fc.mean()) ** 2) / (2 * 1200 ** 2)) * np.clip(f / 400, 0, 1)
    X *= band
    s = np.fft.irfft(X, n).astype(np.float32)
    m = np.abs(s).max()
    return (s * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.4 / (m if m > 0 else 1)).astype(np.float32)

def wind(dur=4.0, seed=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    body = lp_fast(x, 900) + 0.6 * lp_fast(x, 260)
    gust = 0.5 + 0.5 * np.sin(2 * np.pi * (0.12 + seed * 0.03) * t + seed)
    e = np.minimum(1, t / 0.8) * np.minimum(1, (dur - t) / 1.2)
    m = np.abs(body).max() or 1
    return (body / m * gust * e).astype(np.float32)

def step(dur=0.12, hi=900):            # a boot on sand
    t = np.arange(int(dur * SR)) / SR
    return (lp_fast(rng.standard_normal(int(dur * SR)), hi) * np.exp(-t * 30) * 0.8).astype(np.float32)

def clink(dur=0.35):                   # the water bottle
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2 * np.pi * 1680 * t) * np.exp(-t * 12) * 0.5 +
            np.sin(2 * np.pi * 2520 * t) * np.exp(-t * 18) * 0.3).astype(np.float32)

def heartbeat(dur=0.5):
    t = np.arange(int(dur * SR)) / SR
    a = np.sin(2 * np.pi * 58 * t) * np.exp(-t * 22)
    b = np.sin(2 * np.pi * 52 * (t - 0.22)) * np.exp(-np.maximum(0, t - 0.22) * 22) * (t > 0.22)
    return ((a + b) * 0.9).astype(np.float32)

def crow(dur=0.7, f0=1150):            # a vulture's rasping cry
    n = int(dur * SR); t = np.arange(n) / SR
    fm = 1 + 0.22 * np.sin(2 * np.pi * 26 * t)
    tone = (np.sin(2 * np.pi * f0 * fm * t) + 0.5 * np.sin(2 * np.pi * f0 * 1.5 * t)) * 0.5
    rough = lp_fast(rng.standard_normal(n), 4200) * 0.5
    e = np.minimum(1, t / 0.05) * np.exp(-t / (dur * 0.5))
    return ((tone + rough) * e).astype(np.float32)

def metal(dur=0.9):                     # the plate scraping as he props it up
    n = int(dur * SR); t = np.arange(n) / SR
    squeal = np.sin(2 * np.pi * (900 + 500 * np.sin(t * 5)) * t)
    body = lp_fast(rng.standard_normal(n), 2600) * 0.5
    e = np.minimum(1, t / 0.04) * np.exp(-t / (dur * 0.5))
    return ((squeal * 0.4 + body) * e).astype(np.float32)

def ping(dur=1.0, f=1400):              # the sun catches the plate (a bright bell)
    t = np.arange(int(dur * SR)) / SR
    v = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.5 * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)) / 1.8
    return (v * np.exp(-t * 4.5) * (1 - np.exp(-t * 200))).astype(np.float32)

def engine(dur=3.0, f0=92.0):           # a distant prop plane
    n = int(dur * SR); t = np.arange(n) / SR
    wob = 1 + 0.03 * np.sin(2 * np.pi * 12 * t)
    body = (np.sin(2 * np.pi * f0 * wob * t) + 0.4 * np.sin(2 * np.pi * f0 * 2 * t) +
            0.2 * np.sin(2 * np.pi * f0 * 3 * t))
    air = lp_fast(rng.standard_normal(n), 1800) * 0.35
    e = np.minimum(1, t / 0.5) * np.minimum(1, (dur - t) / 0.8)
    return ((body * 0.35 + air) * e).astype(np.float32)

def beep(dur=0.12, f=1320):             # cockpit servo beep
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 22) * 0.5).astype(np.float32)

def click(dur=0.05):                    # a clock tick
    t = np.arange(int(dur * SR)) / SR
    return (lp_fast(rng.standard_normal(int(dur * SR)), 3000) * np.exp(-t * 90) * 0.9).astype(np.float32)

def chord(dur=2.4, root=196.0, bright=1.0):   # a warm hopeful swell
    n = int(dur * SR); t = np.arange(n) / SR
    v = (np.sin(2 * np.pi * root * t) + 0.6 * np.sin(2 * np.pi * root * 1.5 * t) +
         0.4 * np.sin(2 * np.pi * root * 2 * t) * bright)
    e = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.9)
    return (v * e / 2.0).astype(np.float32)

# ---------------- music bed: a warm, wide desert drone ----------------------
# It swells while he weighs the choice, breathes through the walk, hushes for the
# shade and the beacon, and CUTS OUT for the final question (the twist sting).
music = np.zeros(N, np.float32)
t_all = np.arange(N) / SR
pad = (np.sin(2 * np.pi * 55 * t_all) + 0.6 * np.sin(2 * np.pi * 82.4 * t_all + 1.1) +
       0.35 * np.sin(2 * np.pi * 110 * t_all + 0.5)) / 2.6
music += (pad * lp_fast(rng.standard_normal(N) * 0.4 + 1, 260)).astype(np.float32) * 0.42
for b in np.arange(17.5, 24.0, 1.5):                      # "one decision could save your life"
    place(music, boom(40, 0.9), b, 0.30)
for b in np.arange(26.6, 33.0, 1.32):                     # the long walk (a tired pulse)
    place(music, hit(0.15), b, 0.09)
place(music, chord(2.6, 196.0), 43.4, 0.22)               # the beacon / hope
place(music, chord(2.6, 220.0), 46.4, 0.20)
music[int(38.6 * SR):int(40.2 * SR)] *= 0.14              # the shade: the score hushes
music[int(43.4 * SR):int(44.6 * SR)] *= 0.5               # "hours pass" — a held breath
music[int(56.5 * SR):] = 0.0                              # THE TWIST: sudden silence
sw = 0.7 + 0.3 * np.sin(2 * np.pi * t_all / 30.0)         # the drone breathes in and out
music *= sw.astype(np.float32)

# ---------------- sfx cues (one line per event, t in seconds) ----------------
# word times (s): crashed 0.78 · road 3.32 · water 8.14 · walk 9.34 · stay 13.44 ·
# save 18.46 · stranded 20.86 · choose 24.22 · walking 25.60 · sand 29.24 ·
# disappears 31.94 · nobody 35.44 · stay 37.74 · shade 39.48 · metal 40.96 ·
# reflect 41.44 · sunlight 41.94 · horizon 42.76 · pass 44.06 · plane 48.54 ·
# survivor 52.10 · wreck 54.92 · walk 57.42 · wait 58.34
sfx = np.zeros(N, np.float32)
# --- the crash + the settling wreck
place(sfx, boom(44, 1.6), 0.0, 0.95)
place(sfx, whoosh(0.7), 0.0, 0.55)
place(sfx, metal(0.8), 0.55, 0.30)
place(sfx, wind(6.0, 0.0), 1.2, 0.30)
for s_ in [1.6, 2.1]: place(sfx, hit(0.18), s_, 0.22)      # cooling metal ticks
# --- the two miles of road: a dry gust
place(sfx, wind(3.0, 0.2), 3.05, 0.26)
place(sfx, step(), 3.5, 0.2); place(sfx, step(), 4.1, 0.16)
# --- the sun setting, the one bottle
place(sfx, wind(4.0, 0.4), 5.6, 0.22)
place(sfx, clink(), 8.10, 0.40)                            # ON "water" 8.14
# --- the walk option: footfalls getting going
for s_ in np.arange(9.2, 12.5, 0.42): place(sfx, step(), s_, 0.42)
place(sfx, wind(3.4, 0.6), 9.2, 0.22)
# --- the stay option: a low unease
place(sfx, boom(36, 1.1), 13.30, 0.30)
place(sfx, wind(3.6, 0.8), 13.6, 0.24)
place(sfx, crow(0.7), 16.2, 0.20)                          # a distant bird
# --- "one decision could save your life": the first heartbeat
place(sfx, heartbeat(), 18.42, 0.55)
place(sfx, heartbeat(), 19.05, 0.35)
# --- "the other could leave you stranded": wind + a vulture
place(sfx, wind(2.4, 1.0), 19.9, 0.30)
place(sfx, crow(0.8, 980), 21.0, 0.28)
place(sfx, boom(30, 1.4), 21.6, 0.26)
# --- "what would you choose?": a drum hit ON "choose" + heartbeat
place(sfx, hit(0.3), 24.20, 0.65)
place(sfx, heartbeat(), 24.35, 0.5)
# --- "you start walking": footfalls into the sand
place(sfx, whoosh(0.5), 25.05, 0.35)
for s_ in np.arange(25.2, 26.0, 0.32): place(sfx, step(), s_, 0.4)
# --- "the sand slows every step": heavy, dragging footfalls + heat
for s_ in np.arange(26.7, 31.0, 0.36): place(sfx, step(0.16, 600), s_, 0.5)
place(sfx, wind(4.4, 1.2), 27.0, 0.26)
# --- "the sun disappears": a low sun-down hit
place(sfx, lowhit(1.6), 31.92, 0.55)                       # ON "disappears"
place(sfx, wind(3.4, 1.4), 32.6, 0.28)
# --- the empty road: wind + emptiness, a crow on "nobody"
place(sfx, wind(3.8, 1.6), 33.3, 0.30)
place(sfx, crow(0.8, 900), 35.40, 0.30)                    # ON "nobody"
place(sfx, boom(28, 1.6), 35.7, 0.22)
# --- "you decide to stay": the walk back
for s_ in [37.2, 37.6, 38.0]: place(sfx, step(), s_, 0.34)
place(sfx, wind(2.4, 1.8), 37.2, 0.20)
# --- "the wreck gives you some shade": fabric + a cool pad
place(sfx, metal(0.5), 38.7, 0.16)
place(sfx, chord(1.8, 174.0), 39.4, 0.20)                  # ON "shade"
place(sfx, step(), 39.0, 0.16)
# --- "you use a piece of metal to reflect...": the squeal, then the flash
place(sfx, metal(0.9), 41.30, 0.30)                        # ON "metal"
place(sfx, whoosh(0.5), 41.5, 0.30)
place(sfx, ping(1.2, 1500), 41.92, 0.45)                   # ON "sunlight"
place(sfx, whoosh(0.6), 42.3, 0.30)                        # "toward the horizon"
place(sfx, ping(0.8, 1200), 43.0, 0.22)
# --- "hours pass": clock ticks + wind
for s_ in np.arange(43.9, 46.3, 0.5): place(sfx, click(), s_, 0.30)
place(sfx, wind(2.4, 2.0), 44.0, 0.22)
# --- "then at sunrise a search plane appears": engine swell + a hopeful chord
place(sfx, engine(4.2, 88), 46.2, 0.34)
place(sfx, ping(0.7, 900), 48.78, 0.22)                    # ON "appears"
place(sfx, chord(2.8, 196.0), 48.6, 0.30)
place(sfx, wind(2.0, 2.2), 49.2, 0.18)
# --- "from thousands of feet above": the plane overhead + servo beeps
place(sfx, engine(4.4, 78), 49.9, 0.30)
place(sfx, beep(), 50.2, 0.20); place(sfx, beep(), 50.5, 0.16); place(sfx, beep(), 52.0, 0.16)
place(sfx, wind(3.0, 2.4), 51.0, 0.16)
# --- "beside the wreck or the one who walked away?": heartbeat 3
place(sfx, heartbeat(), 54.06, 0.5)
place(sfx, heartbeat(), 54.7, 0.34)
# --- THE TWIST: "would you walk or wait?" — music is already out; a low sting
place(sfx, lowhit(1.8), 56.56, 0.7)                        # ON "Would"
place(sfx, boom(26, 2.0), 57.4, 0.5)
place(sfx, heartbeat(), 57.0, 0.4)
place(sfx, wind(1.6, 2.6), 57.8, 0.16)
place(sfx, lowhit(1.6), 58.32, 0.5)                        # ON "wait?"

for name, buf in (("music.wav", music), ("sfx.wav", sfx)):
    buf = buf / max(1e-9, np.abs(buf).max()) * 0.9
    w = wave.open(name, "w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((buf * 32767).astype(np.int16).tobytes()); w.close()
    print("wrote", name, "%.2f s" % (len(buf) / SR))
