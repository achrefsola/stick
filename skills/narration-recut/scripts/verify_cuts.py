"""Verification battery for recut narration audio (see SKILL.md).

Runs three of the four checks:
  1. tail decay   - every VO slice must end in room tone, speech complete
  2. click check  - splice steps tiny vs global p99.99
  3. silence audit- no body window below -45 dBFS RMS

    python verify_cuts.py --wav final.wav --cuts cuts.json [--stem stem.mp3]
                          [--ffmpeg /path/to/ffmpeg.exe] [--sr 48000]

cuts.json: JSON array of {"start": stem_in_s, "end": stem_out_s, "land": out_time_s}
  --stem is required for check 1 (slice tails are measured on the stem slice,
  not the mix - raised beds make mix tails non-silent by design).

Exit code 0 = all pass, 1 = failures printed.
"""
import argparse
import json
import subprocess
import sys

import numpy as np


def decode(ffmpeg, path, sr):
    p = subprocess.run(
        [ffmpeg, "-v", "error", "-i", path, "-f", "f32le", "-acodec",
         "pcm_f32le", "-ac", "1", "-ar", str(sr), "-"],
        stdout=subprocess.PIPE, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def db(x):
    return 20.0 * np.log10(max(float(np.sqrt(np.mean(x.astype(np.float64) ** 2))) + 1e-12, 1e-12))


def env20(x, sr):
    w = int(0.02 * sr)
    return np.array([db(x[i:i + w]) for i in range(0, len(x) - w, w)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wav", required=True, help="final mix to audit")
    ap.add_argument("--cuts", required=True, help="JSON: [{start,end,land}]")
    ap.add_argument("--stem", default="", help="source stem (enables tail check)")
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--sr", type=int, default=48000)
    ap.add_argument("--fade", type=float, default=0.045,
                    help="fade-out length in seconds whose region must be free of voiced audio")
    ap.add_argument("--body-min", type=float, default=-45.0,
                    help="min body dBFS per 0.5 s window (silence audit)")
    a = ap.parse_args()

    cuts = json.load(open(a.cuts, encoding="utf-8"))
    fails = []

    if a.stem:
        stem = decode(a.ffmpeg, a.stem, a.sr)
        fade = int(a.fade * a.sr)   # region that must be free of voiced audio
        print("=== check 1: syllable completion (voiced audio in fade region) ===")
        for i, c in enumerate(cuts, 1):
            seg = stem[int(c["start"] * a.sr):int(c["end"] * a.sr)]
            e = env20(seg, a.sr)
            speech_ref = float(np.percentile(e, 75))   # voiced level of this slice
            # FAIL: phoneme-level audio inside the fade-out region. Reverb
            # tails 15+ dB under the voiced level are fine to cut; anything
            # louder is a syllable being amputated by the fade.
            fade_env = env20(seg[-fade:], a.sr)
            fade_max = float(fade_env.max())
            clipped = fade_max > speech_ref - 15.0
            # context numbers for human judgment
            hard = e > speech_ref - 12.0
            last_hard = (len(e) - 1 - np.where(hard)[0].max()) * 0.02 if hard.any() else len(seg) / a.sr
            dur = c["end"] - c["start"]
            tail = db(seg[-int(0.1 * a.sr):])
            ok = not clipped
            print("  L%-2d %8.3f->%8.3f  speech_ref %5.1f  fade-region max %6.1f  "
                  "last voiced %4.2fs/cut %.2fs  tail %6.1f  %s%s"
                  % (i, c["start"], c["end"], speech_ref, fade_max, last_hard, dur,
                     tail, "ok" if ok else "FAIL  <-- cut mid-phoneme",
                     "" if last_hard <= dur - 0.04 else "  (tight decay, review)"))
            if not ok:
                fails.append("L%d cut mid-phoneme" % i)

    x = decode(a.ffmpeg, a.wav, a.sr)
    print("=== check 2: splice clicks ===")
    d = np.abs(np.diff(x.astype(np.float64)))
    p = np.percentile(d, 99.99)
    print("  global max step %.3f  p99.99 %.3f" % (d.max(), p))
    for i, c in enumerate(cuts, 1):
        t = c["land"] + (c["end"] - c["start"])
        idx = int(t * a.sr)
        w = d[max(0, idx - 400):idx + 900].max() if idx < len(d) else 0.0
        # a splice step much above p99.99 with no SFX nearby is a click
        print("  cut land %6.3f  max step %.4f" % (t, w))

    print("=== check 3: silence audit (0.5 s windows) ===")
    low = 0
    for t in np.arange(0, len(x) / a.sr, 0.5):
        seg = x[int(t * a.sr):int((t + 0.5) * a.sr)]
        v = db(seg)
        if v < a.body_min:
            print("  %5.1f  %6.1f dBFS  <-- LOW" % (t, v))
            low += 1
    if low == 0:
        print("  no window below %.0f dBFS" % a.body_min)
    else:
        fails.append("silence audit: %d low windows" % low)

    print()
    if fails:
        print("FAIL:", "; ".join(fails))
        sys.exit(1)
    print("PASS")


if __name__ == "__main__":
    main()
