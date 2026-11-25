"""Procedural sound design assets (Phase 5 fallback).

The project ships NO sound-effect files (only the narration mp3), so instead of
inventing nonexistent asset paths, every effect here is SYNTHESIZED deterministically
with numpy (seeded) into _pipeline/sfx/*.wav at 48 kHz stereo PCM16.

These are placeholder-quality foley: clean, quiet, and mixed well below the
narration (beds RMS ~ -30 dBFS, one-shots peaking ~ -10 dBFS). If real recorded
assets become available, drop same-named files into _pipeline/sfx/ and they are
used as-is (engine.audio_events checks existence per name).

Run:  python _pipeline/cinematic/sfx_build.py
"""
import os
import wave

import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sfx")
os.makedirs(OUT, exist_ok=True)


def t(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, a, d):
    """Attack/decay envelope over n samples."""
    e = np.ones(n)
    na, nd = max(1, int(a * SR)), max(1, int(d * SR))
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na)
    nd = min(nd, n - na)
    if nd > 0:
        e[-nd:] *= np.linspace(1, 0, nd) ** 1.5
    return e


def lowpass(x, alpha):
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc)
        y[i] = acc
    return y


def lowpass_fft(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def bandpass_fft(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (1 / (1 + (lo / np.maximum(f, 1)) ** 3)) * (1 / (1 + (f / hi) ** 3))
    return np.fft.irfft(X, len(x))


def normalize(x, peak):
    m = np.max(np.abs(x)) or 1.0
    return x * (peak / m)


def loopify(x, xf=0.5):
    """Crossfade tail into head so the loop is seamless."""
    n = int(xf * SR)
    if len(x) <= 2 * n:
        return x
    w = np.linspace(0, 1, n)
    head = x[:n].copy()
    x[:n] = head * w + x[-n:] * (1 - w)
    return x[:-n]


def write(name, L, R=None, peak=0.5):
    if R is None:
        R = L
    m = max(np.max(np.abs(L)), np.max(np.abs(R))) or 1.0
    g = min(1.0, peak / m)
    L, R = L * g, R * g
    data = np.empty(len(L) * 2, np.int16)
    data[0::2] = np.clip(L * 32767, -32768, 32767).astype(np.int16)
    data[1::2] = np.clip(R * 32767, -32768, 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    peak_db = 20 * np.log10(max(np.max(np.abs(L)), np.max(np.abs(R))) + 1e-9)
    print("  %-18s %6.2fs  peak %6.1f dBFS" % (name, len(L) / SR, peak_db))


rng = np.random.default_rng(20261027)


def stereo_spread(x, width=0.25, seed=0):
    """Slightly decorrelated stereo from a mono source."""
    r = np.random.default_rng(seed)
    n = len(x)
    d = int(r.uniform(80, 400))
    R = np.roll(lowpass_fft(x, 8000), d) * (1 - width) + x * width
    return x, R


# ---------------------------------------------------------------- beds
def amb_wind():
    n = int(9 * SR)
    x = rng.standard_normal(n)
    x = lowpass_fft(x, 420)
    swell = 0.6 + 0.4 * np.sin(2 * np.pi * np.arange(n) / SR / 3.1)
    rumble = lowpass_fft(rng.standard_normal(n), 90) * 0.9
    x = x * swell + rumble
    L, R = stereo_spread(loopify(x), 0.5, 1)
    write("amb_wind.wav", L, R, peak=0.30)


def drone():
    n = int(11 * SR)
    tt = t(11)
    root, fifth = 55.0, 82.41
    x = (0.5 * np.sin(2 * np.pi * root * tt)
         + 0.42 * np.sin(2 * np.pi * root * 1.003 * tt + 0.7)      # detune beat
         + 0.38 * np.sin(2 * np.pi * fifth * tt + 1.3)
         + 0.22 * np.sin(2 * np.pi * root * 2 * tt + 0.2))
    x *= 0.75 + 0.25 * np.sin(2 * np.pi * tt / 5.3)
    x = lowpass_fft(x, 300)
    L, R = stereo_spread(loopify(x), 0.35, 2)
    write("drone.wav", L, R, peak=0.26)


# ---------------------------------------------------------------- one-shots
def power_down():
    """Mains hum collapsing + mechanical clunk: the electricity cuts out."""
    dur = 1.3
    tt = t(dur)
    f = 60 * (1 - 0.35 * np.clip((tt - 0.25) / 0.5, 0, 1) ** 2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    hum = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph))
    hum *= np.exp(-np.clip((tt - 0.28) / 0.42, 0, 10) ** 2 * 3)
    clunk_n = int(0.09 * SR)
    clunk = lowpass_fft(rng.standard_normal(clunk_n), 260) * np.linspace(1, 0, clunk_n) ** 1.2
    thump = np.sin(2 * np.pi * 68 * t(0.16)) * np.exp(-t(0.16) * 26)
    x = hum.copy()
    x[:clunk_n] += clunk * 1.6
    x[:len(thump)] += thump * 0.9
    L, R = stereo_spread(normalize(x, 1.0), 0.2, 3)
    write("power_down.wav", L, R, peak=0.62)


def flicker_buzz():
    tt = t(0.5)
    x = np.sign(np.sin(2 * np.pi * 120 * tt)) * 0.4 + rng.standard_normal(len(tt)) * 0.2
    gate = (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 11 * tt + 1))) * np.exp(-tt * 5)
    x = bandpass_fft(x * gate, 300, 4200)
    write("flicker_buzz.wav", normalize(x, 1.0), peak=0.42)


def beep_low():
    """Soft double beep for the 19% battery warning."""
    dur = 0.62
    tt = t(dur)
    tone = np.sin(2 * np.pi * 880 * tt) * 0.7 + np.sin(2 * np.pi * 1320 * tt) * 0.12
    # gate the continuous tone into two 0.13 s bursts
    x = np.zeros_like(tone)
    n = int(0.13 * SR)
    for t0 in (0.0, 0.30):
        i0 = int(t0 * SR)
        nn = min(n, len(tone) - i0)
        x[i0:i0 + nn] = tone[i0:i0 + nn] * env_ad(nn, 0.008, 0.05)
    write("beep_low.wav", normalize(x, 1.0), peak=0.4)


def phone_beeps():
    """Remote phone: ringing tone beeps with pauses."""
    segs = []
    for k in range(3):
        tt = t(0.38)
        tone = np.sin(2 * np.pi * 440 * tt) * 0.6 + np.sin(2 * np.pi * 480 * tt) * 0.6
        tone *= env_ad(len(tt), 0.01, 0.06)
        segs.append(tone)
        segs.append(np.zeros(int(0.42 * SR)))
    x = np.concatenate(segs)
    # distant: heavy lowpass + small room
    x = lowpass_fft(x, 2400)
    write("phone_beeps.wav", normalize(x, 1.0), peak=0.38)


def couch_thud():
    dur = 0.55
    tt = t(dur)
    x = np.sin(2 * np.pi * 58 * tt) * np.exp(-tt * 14)
    x += lowpass_fft(rng.standard_normal(len(tt)), 180) * np.exp(-tt * 9) * 0.7
    scrape = bandpass_fft(rng.standard_normal(int(0.3 * SR)), 150, 900)
    scrape *= np.linspace(0.6, 0, len(scrape)) ** 0.7
    x[int(0.05 * SR):int(0.05 * SR) + len(scrape)] += scrape * 0.5
    write("couch_thud.wav", normalize(x, 1.0), peak=0.6)


def drip():
    tt = t(0.28)
    f = 1350 * np.exp(-tt * 14)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 22)
    x += bandpass_fft(rng.standard_normal(len(tt)), 2000, 6000) * np.exp(-tt * 60) * 0.25
    write("drip.wav", normalize(x, 1.0), peak=0.4)


def clink():
    tt = t(0.35)
    x = np.sin(2 * np.pi * 1780 * tt) * np.exp(-tt * 18) * 0.6
    x += np.sin(2 * np.pi * 2650 * tt + 0.8) * np.exp(-tt * 24) * 0.4
    x += np.sin(2 * np.pi * 3550 * tt + 2.1) * np.exp(-tt * 30) * 0.2
    write("clink.wav", normalize(x, 1.0), peak=0.34)


def flashlight_click():
    n = int(0.05 * SR)
    x = lowpass_fft(rng.standard_normal(n), 3200) * np.exp(-np.arange(n) / (0.006 * SR))
    body = np.sin(2 * np.pi * 320 * t(0.05)) * np.exp(-t(0.05) * 60) * 0.5
    x[:len(body)] += body
    write("flashlight_click.wav", normalize(x, 1.0), peak=0.36)


def lamp_click():
    n = int(0.06 * SR)
    x = lowpass_fft(rng.standard_normal(n), 2400) * np.exp(-np.arange(n) / (0.008 * SR))
    body = np.sin(2 * np.pi * 210 * t(0.06)) * np.exp(-t(0.06) * 45) * 0.7
    x[:len(body)] += body
    write("lamp_click.wav", normalize(x, 1.0), peak=0.4)


def stove_click():
    segs = []
    for k in range(4):
        n = int(0.02 * SR)
        c = lowpass_fft(rng.standard_normal(n), 5200) * np.exp(-np.arange(n) / (0.004 * SR))
        segs.append(c)
        segs.append(np.zeros(int(0.045 * SR)))
    x = np.concatenate(segs)
    write("stove_click.wav", normalize(x, 1.0), peak=0.34)


def creak():
    dur = 0.9
    tt = t(dur)
    f = 130 + 70 * np.sin(2 * np.pi * 1.3 * tt + 0.5) + 40 * tt
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sign(np.sin(ph)) * 0.25 + np.sin(ph * 2.01) * 0.2
    x = lowpass_fft(x, 1100)
    x *= env_ad(len(tt), 0.12, 0.3) * (0.55 + 0.45 * np.sin(2 * np.pi * 7 * tt))
    write("creak.wav", normalize(x, 1.0), peak=0.3)


def water_loop():
    n = int(7 * SR)
    x = rng.standard_normal(n)
    x = bandpass_fft(x, 250, 2600)
    # slow amplitude modulation + occasional burbles so it does not sound like flat noise
    am = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * np.arange(n) / SR / 2.7))
    for b in range(5):
        i0 = int(rng.uniform(0.3, 6.0) * SR)
        nn = int(0.18 * SR)
        burble = np.sin(2 * np.pi * rng.uniform(300, 700) * t(0.18) * (1 + 0.3 * t(0.18))) \
            * np.exp(-t(0.18) * 12)
        am[i0:i0 + nn] += burble * 0.5
    x *= am
    L, R = stereo_spread(loopify(x), 0.4, 4)
    write("water_loop.wav", L, R, peak=0.32)


def steam_loop():
    n = int(7 * SR)
    x = rng.standard_normal(n)
    x = bandpass_fft(x, 1400, 7000)
    am = 0.7 + 0.3 * np.sin(2 * np.pi * np.arange(n) / SR / 3.4 + 1.0)
    x *= am
    L, R = stereo_spread(loopify(x), 0.45, 5)
    write("steam_loop.wav", L, R, peak=0.3)


def flash_ping():
    tt = t(0.6)
    x = np.sin(2 * np.pi * 1320 * tt) * np.exp(-tt * 7) * 0.6
    x += np.sin(2 * np.pi * 1980 * tt) * np.exp(-tt * 9) * 0.3
    x += np.sin(2 * np.pi * 660 * tt) * np.exp(-tt * 5) * 0.2
    write("flash_ping.wav", normalize(x, 1.0), peak=0.42)


def signal_die():
    dur = 0.75
    tt = t(dur)
    f = 620 * np.exp(-tt * 2.6)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x *= np.exp(-tt * 4.2)
    x = lowpass_fft(x, 2200)
    write("signal_die.wav", normalize(x, 1.0), peak=0.5)


def knock(variant=1):
    dur = 0.5
    tt = t(dur)
    f = 105 * np.exp(-tt * 9) + 48
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 16)
    n = int(0.02 * SR)
    x[:n] += lowpass_fft(rng.standard_normal(n), 900) * np.linspace(1, 0, n) ** 0.5 * 1.1
    x = lowpass_fft(x, 700)
    body_r = lowpass_fft(rng.standard_normal(len(tt)), 160) * np.exp(-tt * 10) * 0.5
    x += body_r
    write("knock.wav" if variant == 1 else "knock%d.wav" % variant,
          normalize(x, 1.0), peak=0.72)


def pages():
    n = int(0.5 * SR)
    x = bandpass_fft(rng.standard_normal(n), 900, 6000)
    e = np.sin(np.pi * np.arange(n) / n) ** 1.6
    x *= e
    write("pages.wav", normalize(x, 1.0), peak=0.26)


def pencil():
    n = int(0.9 * SR)
    x = bandpass_fft(rng.standard_normal(n), 1200, 5500)
    strokes = np.zeros(n)
    for t0 in (0.05, 0.32, 0.58):
        i0 = int(t0 * SR)
        nn = int(0.2 * SR)
        if i0 + nn > n:
            nn = n - i0
        strokes[i0:i0 + nn] = np.sin(np.pi * np.arange(nn) / nn) * rng.uniform(0.6, 1.0)
    x *= strokes
    write("pencil.wav", normalize(x, 1.0), peak=0.22)



def siren_loop():
    """Distant two-tone siren, muffled by distance (Day 7: it stops)."""
    n = int(8 * SR)
    tt = t(8)
    two = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * tt / 1.6))     # alternating tone
    f = np.where(two > 0.5, 660.0, 520.0)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5
    x += np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR) * 0.25
    x = lowpass_fft(x, 900)                                     # far away
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * tt / 3.7)
    L, R = stereo_spread(loopify(x), 0.6, 6)
    write("siren_loop.wav", L, R, peak=0.30)


if __name__ == "__main__":
    print("synthesizing sfx ->", OUT)
    amb_wind()
    drone()
    power_down()
    flicker_buzz()
    beep_low()
    phone_beeps()
    couch_thud()
    drip()
    clink()
    flashlight_click()
    lamp_click()
    stove_click()
    creak()
    water_loop()
    steam_loop()
    flash_ping()
    signal_die()
    knock(1)
    knock(2)
    knock(3)
    pages()
    pencil()
    siren_loop()
    print("done")
