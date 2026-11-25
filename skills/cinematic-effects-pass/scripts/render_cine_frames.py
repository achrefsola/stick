"""Render enhanced segments to intermediates: _pipeline/cine/seg_XX.mp4.

This is the ONLY new rendering step. It does not own any timing: it asks
engine.py for the SegPlan of each configured segment and writes exactly
counts[i] frames of 1920x1080 at 30 fps, deterministically (all randomness is
seeded). The existing render graph then consumes these files through the SAME
concat path it already uses for stills, so there is still exactly one pipeline.

Frames are streamed as rawvideo into x264 (crf 10) - high quality, because the
final render re-encodes them. Static segments are still written as video so the
graph does not need a special case per segment.

Usage:
  python _pipeline/cinematic/render_cine_frames.py            # all enhanced segs
  python _pipeline/cinematic/render_cine_frames.py --only 8,9 # a subset (POC)
  python _pipeline/cinematic/render_cine_frames.py --force    # re-render too
"""
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

ROOT = os.path.dirname(os.path.dirname(HERE))
FFMPEG = os.path.join(ROOT, "_pipeline", "tools",
                      "ffmpeg-master-latest-win64-gpl", "bin", "ffmpeg.exe")
OUTDIR = os.path.join(ROOT, "_pipeline", "cine")
os.makedirs(OUTDIR, exist_ok=True)

import engine as E  # noqa: E402  (after sys.path / ROOT setup)


def render_seg(seg_id, plan, force=False):
    out = E.intermediate_path(seg_id)
    if os.path.exists(out) and not force:
        return out, "cached"
    plan.load_source()
    n = plan.n
    cmd = [FFMPEG, "-y", "-v", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", "%dx%d" % (1920, 1080), "-r", str(E.FPS), "-i", "-",
           "-frames:v", str(n), "-an",
           "-c:v", "libx264", "-crf", "10", "-preset", "veryfast",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                         stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    t0 = time.time()
    try:
        for i in range(n):
            p.stdin.write(plan.frame(i).tobytes())
    finally:
        p.stdin.close()
        err = p.stderr.read().decode("utf-8", "replace")
        rc = p.wait()
    plan.src = None
    if rc:
        sys.exit("ffmpeg failed for seg %d:\n%s" % (seg_id, err[-2000:]))
    return out, "%.1fs (%d frames)" % (time.time() - t0, n)


def main():
    E.init(ROOT)
    plans = E.plan()
    only = None
    if "--only" in sys.argv:
        only = set(int(x) for x in sys.argv[sys.argv.index("--only") + 1].split(","))
    force = "--force" in sys.argv
    ids = sorted(int(k) for k in plans)
    if only:
        ids = [i for i in ids if i in only]
    total = sum(plans[str(i)].n for i in ids)
    print("rendering %d enhanced segments (%d frames) -> %s" % (len(ids), total, OUTDIR))
    grand = time.time()
    for k in ids:
        out, info = render_seg(k, plans[str(k)], force)
        print("  seg %2d %-9s %s" % (k, plans[str(k)].seg["image"], info))
    print("done in %.1fs" % (time.time() - grand))


if __name__ == "__main__":
    main()
