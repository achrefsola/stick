"""Write a first-pass cinematic effects.json from scene_manifest.json.

The draft is deliberately dull and deliberately SAFE: every scene is a static
full-frame hold, no motion, no overlays, no sound. It validates immediately and
renders as a clean cut with the day dips and the final cut to black already in
place — so the creative pass starts from a working baseline instead of a blank
file, and every later addition has to justify itself through validate.py.

Never overwrites an existing effects.json unless --force.

Usage: python _pipeline/draft_effects.py [--force]
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "_pipeline", "cinematic", "effects.json")

man = json.load(open(os.path.join(ROOT, "_pipeline", "scene_manifest.json"), encoding="utf-8"))
segs = man["segments"]

if os.path.exists(OUT) and "--force" not in sys.argv:
    sys.exit("effects.json already exists - the creative pass has started; "
             "not overwriting it (use --force to discard)")

segments = {}
for i, s in enumerate(segs):
    if s["kind"] != "scene":
        continue
    day_opener = i > 0 and segs[i - 1]["kind"] == "card"
    entry = {
        "_note": (s["narration_segment"][:78] or s["image"]),
        "confidence": "assumed",
        "reason": "first pass - static full-frame hold; add movement only where the story earns it",
    }
    if day_opener:
        entry["establish"] = True
        entry["hold"] = 1.0
    segments[str(s["seg"])] = entry

cfg = {
    "meta": {
        "what": "First-pass plan drafted by draft_effects.py: static holds only.",
        "timing": "segment boundaries come from scene_manifest.json; event times are "
                  "absolute seconds or phrase anchors against transcript/words.json.",
        "policy": "STATIC BY DEFAULT. Add one effect at a time, with a `reason`, then "
                  "run validate.py. Declare `protected` regions and `anchors` from the "
                  "image before animating anything, and mark unconfirmed layout "
                  "`confidence: assumed` so the validator flags it for inspection.",
    },
    "defaults": {"fade": 0.30, "fps": 30},
    "end": {"at": round(man["audio_duration_sec"] - 0.37, 2)},
    "beds": [],
    "sfx": [],
    "segments": segments,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cfg, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("drafted %s: %d static scenes (%d day openers marked establish)"
      % (OUT, len(segments), sum(1 for v in segments.values() if v.get("establish"))))
print("next: add effects one at a time with a `reason`, then run cinematic/validate.py")
