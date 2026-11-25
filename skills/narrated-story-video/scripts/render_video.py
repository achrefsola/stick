"""Render the final 1920x1080/30fps MP4 from scene_manifest.json + narration audio.

Timeline = concat of one looped input per SEGMENT (scenes and cards alike).

The concat *FILTER* is used rather than the concat *DEMUXER*: for stills whose
source sizes differ, the demuxer silently drops images (whole segments vanish
from the output with no error). The filter graph never does that. Each segment
contributes an exact frame count derived from its timestamps (round the
BOUNDARY, not the duration, so rounding error cannot accumulate), so boundaries
stay gapless and frame-accurate and the last frame lands on the audio end.

Separator cards are their own segments (not overlays): a card fades in from
black, holds, and fades back to black, so a scene image is never visible behind
it. The scene ending a chapter fades out and the scene opening the next fades
in, giving a clean dip-through-black at every card.

Story images are pre-scaled to 1080p by normalize.py (run first); cards are used
directly from _pipeline/cards.

Run from the project root.

Usage:
  python normalize.py
  python render_video.py [output.mp4]
  python render_video.py out.mp4 --preview SS DUR     # review clip only

Env: CRF, PRESET override the encoder; DEBUG_NULL=1 prints the graph and encodes
to a null sink (fast graph validation, no file written).
"""
import json, subprocess, sys, os

ROOT = os.environ.get("STORY_VIDEO_ROOT", os.getcwd())
FFMPEG = os.environ.get(
    "STORY_VIDEO_FFMPEG",
    os.path.join(ROOT, "_pipeline", "tools", "ffmpeg-master-latest-win64-gpl", "bin", "ffmpeg.exe"))
NORM = os.path.join(ROOT, "_pipeline", "norm")
m = json.load(open(os.path.join(ROOT, "_pipeline", "scene_manifest.json")))
audio = os.path.join(ROOT, m["audio_file"])
out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else os.path.join(ROOT, "story_1080p.mp4")

FPS = 30
segs = m["segments"]
DAY_FADE = 0.30


def src_of(s):
    if s["kind"] == "card":
        return os.path.join(ROOT, s["image"].replace("/", os.sep))
    return os.path.join(NORM, s["image"])


# frame-exact lengths: round each boundary, not each duration, so rounding
# error can never accumulate and the last frame lands on the audio end
bounds = [round(s["start"] * FPS) for s in segs]
bounds.append(round(m["audio_duration_sec"] * FPS))
counts = [bounds[i + 1] - bounds[i] for i in range(len(segs))]

cmd = [FFMPEG, "-y", "-v", "error"]
for i, s in enumerate(segs):
    src = src_of(s)
    if not os.path.exists(src):
        sys.exit("missing %s - run normalize.py first" % src)
    # -t padded past the trim point: the decoder must not run dry mid-segment
    cmd += ["-framerate", str(FPS), "-loop", "1", "-t",
            "{:.4f}".format(counts[i] / FPS + 0.5), "-i", src]

audio_idx = len(segs)
cmd += ["-i", audio]

parts = []
for i, s in enumerate(segs):
    dur = counts[i] / FPS
    chain = ["[%d:v]fps=%d,trim=start_frame=0:end_frame=%d,setpts=PTS-STARTPTS"
             % (i, FPS, counts[i])]
    fade_in = fade_out = 0.0
    if s["kind"] == "card":
        # a separator fades from and back to black so it never shares a frame
        # with a scene
        fade_in = fade_out = DAY_FADE
    else:
        if i > 0 and segs[i - 1]["kind"] == "card":
            fade_in = DAY_FADE
        if i + 1 < len(segs) and segs[i + 1]["kind"] == "card":
            fade_out = DAY_FADE
    if fade_in > 0:
        chain.append("fade=t=in:st=0:d=%s" % fade_in)
    if fade_out > 0:
        chain.append("fade=t=out:st=%.3f:d=%s" % (max(0.0, dur - fade_out), fade_out))
    parts.append(",".join(chain) + "[s%d]" % i)

parts.append("".join("[s%d]" % i for i in range(len(segs))) +
             "concat=n=%d:v=1:a=0[cat]" % len(segs))
parts.append("[cat]format=yuv420p[vout]")

cmd += ["-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "%d:a" % audio_idx]

tail = ["-t", "%.3f" % m["audio_duration_sec"]]
preview = None
if "--preview" in sys.argv:
    i = sys.argv.index("--preview")
    preview = (float(sys.argv[i + 1]), float(sys.argv[i + 2]))
    tail = ["-ss", str(preview[0]), "-t", str(preview[1])]

if os.environ.get("DEBUG_NULL"):
    cmd += tail + ["-f", "null", os.devnull]
    print(" ".join(cmd))
    sys.exit(subprocess.run(cmd, capture_output=True, text=True).returncode)

tail += ["-c:v", "libx264",
         "-crf", os.environ.get("CRF", "20" if preview else "18"),
         "-preset", os.environ.get("PRESET", "veryfast" if preview else "medium"),
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
cmd += tail + [out]

print("segments=%d frames=%d duration=%.3fs" % (len(segs), sum(counts), sum(counts) / FPS))
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode:
    print(r.stderr[-4000:])
else:
    print("OK:", out)
sys.exit(r.returncode)
