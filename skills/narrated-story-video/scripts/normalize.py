"""Normalize every story image to an exact 1920x1080 cover-cropped PNG.

Output: _pipeline/norm/<image>

Why pre-scale: the render graph loops ONE input per segment, so a 1080p file
gives a cheap 1080p decode per frame instead of a raw-size decode. It also makes
every concat-filter input identical in size, which is what keeps the filter
honest (the concat DEMUXER silently drops stills whose sizes differ).

Separator cards are already 1080p and are used straight from _pipeline/cards,
so they are skipped here.

Run from the project root. Reads _pipeline/scene_manifest.json.
"""
import json, os
from PIL import Image

ROOT = os.environ.get("STORY_VIDEO_ROOT", os.getcwd())
NORM = os.path.join(ROOT, "_pipeline", "norm")
os.makedirs(NORM, exist_ok=True)

W, H = 1920, 1080
m = json.load(open(os.path.join(ROOT, "_pipeline", "scene_manifest.json")))


def cover(src, dst):
    """Fill the 1920x1080 frame (cover, not contain) and center-crop."""
    im = Image.open(src)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    s = max(W / im.size[0], H / im.size[1])
    if abs(s - 1.0) > 1e-9:
        im = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.Resampling.LANCZOS)
    l = (im.size[0] - W) // 2
    t = (im.size[1] - H) // 2
    im.crop((l, t, l + W, t + H)).save(dst, optimize=True)


done = set()
for s in m["segments"]:
    if s["kind"] != "scene":
        continue
    img = s["image"]
    if img in done:
        continue
    done.add(img)
    cover(os.path.join(ROOT, img.replace("/", os.sep)), os.path.join(NORM, img))

print("normalized %d story images -> %s" % (len(done), NORM))
