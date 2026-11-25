#!/usr/bin/env python3
"""Mix music + SFX stems under a voiceover at exactly the skill's level contract.

    python3 tools/mix.py voice.mp3 music.wav sfx.wav            -> mix_raw.wav

Contract (do not hand-mix):
  - music = 50 % of the voice's GATED RMS (-6 dB vs voice)
  - sfx   = 50 % of the voice's GATED RMS, sample peaks capped at 0.7x voice peak
  - no ducking, no compression; finish.sh adds one linear gain + limiter on the mix.
"""
import subprocess, sys, wave
import numpy as np

SR = 48000

def load(path):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR),
                        "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(p.stdout, np.float32).copy()

def gated_rms(v, hop=0.05, gate_rel=-26):
    w = int(hop * SR)
    n = len(v) // w
    fr = v[:n * w].reshape(n, w)
    rms = np.sqrt((fr ** 2).mean(1))
    thr = rms.max() * 10 ** (gate_rel / 20)
    keep = rms[rms > thr]
    return float(np.sqrt((keep ** 2).mean()))

def rms(x): return float(np.sqrt(np.mean(np.square(x.astype(np.float64)))))

def db(x): return 20 * np.log10(max(x, 1e-12))

def main():
    voice_f, music_f, sfx_f = sys.argv[1:4]
    v, m, s = load(voice_f), load(music_f), load(sfx_f)
    N = max(len(v), len(m), len(s))
    for x, nm in ((v, "voice"), (m, "music"), (s, "sfx")):
        if len(x) < N:
            globals()[nm] = np.pad(x, (0, N - len(x)))
    v, m, s = globals()["voice"], globals()["music"], globals()["sfx"]

    vg = gated_rms(v)
    gm = 0.5 * vg / max(rms(m), 1e-9)
    m *= gm
    gs = 0.5 * vg / max(rms(s), 1e-9)
    s *= gs
    vpeak = float(np.abs(v).max())
    speak = float(np.abs(s).max())
    cap = 0.7 * vpeak
    if speak > cap:
        s *= cap / speak
        speak = cap

    mix = np.clip(v + m + s, -1.0, 1.0).astype(np.float32)
    w = wave.open("mix_raw.wav", "w")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes()); w.close()
    print(f"voice gated RMS {db(vg):+.1f} dBFS | music at {db(0.5*vg):+.1f} dBFS target "
          f"(= -6.0 dB vs voice) | sfx {db(speak):+.1f} dBFS peak (cap {db(cap):+.1f})")
    print("wrote mix_raw.wav  (%.2f s)" % (N / SR))

if __name__ == "__main__":
    main()
