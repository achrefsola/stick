"""Build scene_manifest.json - the timestamped edit plan.

Alignment: images are numbered in storytelling order, so the mapping is a
strictly monotonic (forward-only) walk through the word-level transcript. Each
segment starts on the first word of the phrase that introduces it and ends where
the next segment starts, so the timeline is gapless by construction.

Segments are of two kinds:
  "scene" -> a story image (normalized to 1080p in step 2)
  "card"  -> a full-frame separator (e.g. a black "DAY n" card). A card is its
             own segment; it is NEVER an overlay on a scene, otherwise the scene
             shows through it.

>>> EDIT THE TABLE `S` BELOW. <<<
Every row is (boundary_phrase, kind, image, day, explanation, confidence, flag):
  * boundary_phrase - first few words of the narration line this row illustrates
  * kind            - "scene" or "card"
  * image           - file for a scene; None for a card (path derived from day)
Phrases are matched case/punctuation-insensitively, forward-only. List them in
playback order. If a phrase is not found the script stops and tells you where.

Run from the project root. Reads _pipeline/transcript/words.json.
"""
import json, os, re, sys

ROOT = os.environ.get("STORY_VIDEO_ROOT", os.getcwd())
AUDIO = os.environ.get("STORY_VIDEO_AUDIO", "narration.mp3")
data = json.load(open(os.path.join(ROOT, "_pipeline", "transcript", "words.json")))
words = data["words"]
DUR = data["duration"]


def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower())


toks = [norm(x["w"]) for x in words]
raw = [x["w"] for x in words]
starts = [x["start"] for x in words]

# --------------------------------------------------------------------------
# EXAMPLE TABLE - replace entirely with your own rows, in playback order.
# (kind, image, day columns shown for both a card and a scene.)
# --------------------------------------------------------------------------
S = [
    ("day one", "card", None, 1,
     "Separator: full-frame 'DAY 1' card.", "high", ""),
    ("you wake up to the sound", "scene", "2.png", 1,
     "The character waking in the apartment as the noise starts outside.", "high", ""),
    ("you look outside", "scene", "3.png", 1,
     "At the window, looking down at the crowd in the street.", "high", ""),
    ("day two", "card", None, 2,
     "Separator: full-frame 'DAY 2' card.", "high", ""),
    ("the television keeps repeating", "scene", "6.png", 2,
     "On the couch watching the emergency broadcast.", "high", ""),
    # ... one row per segment, in playback order ...
]

# sequential greedy boundary search - guarantees a strictly monotonic walk
ptr = 0
bounds = []
for phrase, kind, img, day, expl, conf, flag in S:
    ptoks = phrase.split()
    n = len(ptoks)
    found = -1
    for i in range(ptr, len(toks) - n + 1):
        if toks[i:i + n] == ptoks:
            found = i
            break
    if found < 0:
        raise SystemExit("NOT FOUND: %r (searched forward from word %d)" % (phrase, ptr))
    bounds.append({"kind": kind, "img": img, "day": day, "widx": found,
                   "start": starts[found], "expl": expl, "conf": conf, "flag": flag})
    ptr = found + n

segments = []
for k, b in enumerate(bounds):
    next_start = bounds[k + 1]["start"] if k + 1 < len(bounds) else DUR
    end_widx = bounds[k + 1]["widx"] if k + 1 < len(bounds) else len(words)
    text = " ".join(raw[b["widx"]:end_widx]).replace(" -", "-").replace(" %", "%")
    image = "_pipeline/cards/day_{:02d}.png".format(b["day"]) if b["kind"] == "card" else b["img"]
    segments.append({
        "seg": k + 1,
        "kind": b["kind"],
        "day": b["day"],
        "image": image,
        "narration_segment": text,
        "start": round(b["start"], 2),
        "end": round(next_start, 2),
        "duration": round(next_start - b["start"], 2),
        "matching_explanation": b["expl"],
        "confidence": b["conf"],
        "flag": b["flag"],
    })

n_scenes = sum(1 for s in segments if s["kind"] == "scene")
n_cards = sum(1 for s in segments if s["kind"] == "card")

manifest = {
    "audio_file": AUDIO,
    "audio_duration_sec": round(DUR, 2),
    "language": data["language"],
    "total_segments": len(segments),
    "total_scenes": n_scenes,
    "total_day_cards": n_cards,
    "alignment": "monotonic, gapless; segment end = next segment start; last ends at audio end",
    "note": "Separators are standalone full-frame cards, never overlaid on a scene.",
    "cards": {
        "dir": "_pipeline/cards",
        "style": "full-frame card (e.g. 'DAY n'); fades from/to black so it never mixes with a scene",
    },
    "segments": segments,
}
json.dump(manifest, open(os.path.join(ROOT, "_pipeline", "scene_manifest.json"), "w"), indent=1)

for s in segments:
    tag = ("CARD " + str(s["day"])) if s["kind"] == "card" else s["image"]
    print("%2d %-11s %6.2f-%6.2f (%5.2fs) %s" % (
        s["seg"], tag, s["start"], s["end"], s["duration"], s["narration_segment"][:56]))
print("\n%d segments (%d scenes + %d cards) | total %.2fs" % (
    len(segments), n_scenes, n_cards, round(DUR, 2)))
