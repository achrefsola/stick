"""End-to-end check of the rendered video against scene_manifest.json.

Checks the ENCODED file, not the plan - a render that looks fine can still have
a dropped segment.

1. container/stream sanity: 1920x1080, 30fps, duration == audio duration
2. frame-continuity: no missing frames in the encoded stream
3. every SEGMENT displays its own asset at its midpoint (scene -> normalized
   image, card -> card), so nothing has drifted out of sync
4. separators are pure: the card is fully opaque through its hold (no scene
   bleeding through) and both flanks dip to black, so a separator never shares
   a frame with a scene image

The opener (first segment) is exempt from the leading-flank test: it starts at
t=0 and legitimately has no preceding scene to fade from.

Run from the project root. Exit code 0 == all checks passed.
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.environ.get("STORY_VIDEO_ROOT", os.getcwd())
FFMPEG = os.environ.get(
    "STORY_VIDEO_FFMPEG",
    os.path.join(ROOT, "_pipeline", "tools", "ffmpeg-master-latest-win64-gpl", "bin", "ffmpeg.exe"))
FP = os.path.join(os.path.dirname(FFMPEG), "ffprobe.exe")
NORM = os.path.join(ROOT, "_pipeline", "norm")
FPS = 30
video = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "story_1080p.mp4")
m = json.load(open(os.path.join(ROOT, "_pipeline", "scene_manifest.json")))
segs = m["segments"]
TMP = os.path.join(ROOT, "_pipeline", "verify")
os.makedirs(TMP, exist_ok=True)

fail = 0


def arr(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)


def probe(args):
    return subprocess.run([FP] + args, capture_output=True, text=True).stdout


def ref_of(s):
    if s["kind"] == "card":
        return os.path.join(ROOT, s["image"].replace("/", os.sep))
    return os.path.join(NORM, s["image"])


def grab(t, path):
    subprocess.run([FFMPEG, "-y", "-v", "error", "-ss", "%.3f" % t, "-i", video,
                    "-frames:v", "1", path], check=True)
    return arr(path)


# ---- 1. container --------------------------------------------------------
vinfo = dict(l.split("=", 1) for l in probe(
    ["-v", "error", "-select_streams", "v:0", "-show_entries",
     "stream=width,height,nb_frames,r_frame_rate,duration",
     "-of", "default=noprint_wrappers=1", video]).splitlines() if "=" in l)
ainfo = dict(l.split("=", 1) for l in probe(
    ["-v", "error", "-select_streams", "a:0", "-show_entries",
     "stream=codec_name,duration", "-of", "default=noprint_wrappers=1", video]).splitlines() if "=" in l)
print("video:", vinfo)
print("audio:", ainfo)
if (vinfo.get("width"), vinfo.get("height"), vinfo.get("r_frame_rate")) != ("1920", "1080", "30/1"):
    print("  FAIL video geometry/rate"); fail += 1
vdur = float(vinfo.get("duration", 0) or 0)
if abs(vdur - m["audio_duration_sec"]) > 0.15:
    print("  FAIL video duration %.3f vs audio %.3f" % (vdur, m["audio_duration_sec"])); fail += 1

# ---- 2. continuity -------------------------------------------------------
ts = [float(x) for x in probe(["-v", "error", "-select_streams", "v:0", "-show_entries",
                               "frame=pts_time", "-of", "csv=p=0", video]).split() if x.strip()]
gaps = [(i, ts[i - 1], ts[i]) for i in range(1, len(ts)) if ts[i] - ts[i - 1] > 1.5 / FPS]
print("video frames=%d last=%.3f gaps=%d" % (len(ts), ts[-1] if ts else -1, len(gaps)))
for g in gaps[:10]:
    print("  GAP", g)
if gaps:
    fail += 1

# ---- 3. per-segment identity at midpoint --------------------------------
mids = [round((s["start"] + s["end"]) / 2 * FPS) for s in segs]
sel = "+".join("eq(n\\,%d)" % i for i in mids)
subprocess.run([FFMPEG, "-y", "-v", "error", "-i", video, "-vf", "select='%s'" % sel,
                "-fps_mode", "passthrough", os.path.join(TMP, "mid_%03d.png")], check=True)
worst = []
for i, s in enumerate(segs):
    f = os.path.join(TMP, "mid_%03d.png" % (i + 1))
    if not os.path.exists(f):
        print("  FAIL seg %d: no frame dumped" % s["seg"]); fail += 1; continue
    d = np.abs(arr(f) - arr(ref_of(s))).mean()
    worst.append((d, s["seg"], s["kind"], os.path.basename(s["image"]), s["start"]))
worst.sort(reverse=True)
print("segment identity: worst 6 mean-abs-diff (encoding noise only):")
for d, sg, k, img, st in worst[:6]:
    print("  %6.2f  seg %2d  %-5s %-16s @%.2fs" % (d, sg, k, img, st))
if worst and worst[0][0] > 8:
    print("  FAIL a segment is showing the wrong asset"); fail += 1

# ---- 4. separators are pure ---------------------------------------------
print("separators:")
for i, s in enumerate(segs):
    if s["kind"] != "card":
        continue
    st, en = s["start"], s["end"]
    card = arr(ref_of(s))
    mid = os.path.join(TMP, "card_mid.png")
    d_mid = np.abs(grab((st + en) / 2, mid) - card).mean()
    # both flanks must dip to black (scene faded out before / fading in after)
    b0 = grab(max(0.0, st + 0.02), os.path.join(TMP, "card_b0.png")).mean()
    b1 = grab(min(vdur - 0.02, en - 0.02), os.path.join(TMP, "card_b1.png")).mean()
    before = segs[i - 1]["kind"] if i > 0 else None
    after = segs[i + 1]["kind"] if i + 1 < len(segs) else None
    # the opener card (i==0) has no preceding scene: its leading edge is frame 0
    lead_ok = (b0 < 22 and before == "scene") if i > 0 else True
    ok = d_mid < 6 and lead_ok and b1 < 22 and after == "scene"
    label = "DAY %d" % s["day"] if "day" in s else "card %d" % s["seg"]
    print("  %-8s [%.2f-%.2f] mid-diff %.2f  flank(%.0f,%.0f)  %s"
          % (label, st, en, d_mid, b0, b1, "ok" if ok else "FAIL"))
    if not ok:
        fail += 1

print("\n=== %s ===" % ("ALL CHECKS PASSED" if fail == 0 else "%d CHECK(S) FAILED" % fail))
sys.exit(1 if fail else 0)
